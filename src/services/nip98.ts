import { nip19 } from "nostr-tools";
import { verifyEvent } from "nostr-tools/pure";

import type { Session } from "../types";

const NIP98_KIND = 27235;
const NIP98_MAX_AGE_SECONDS = 60;

type Nip98Event = {
  id: string;
  pubkey: string;
  sig: string;
  kind: number;
  content: string;
  created_at: number;
  tags: string[][];
};

type Nip98ValidationResult =
  | { ok: true; session: Session }
  | { ok: false; message: string };

function findTag(tags: string[][], name: string): string | null {
  const tag = tags.find((t) => t[0] === name);
  return tag?.[1] ?? null;
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove default ports
    if (parsed.port === "80" && parsed.protocol === "http:") {
      parsed.port = "";
    }
    if (parsed.port === "443" && parsed.protocol === "https:") {
      parsed.port = "";
    }
    // Normalize trailing slashes for root path
    return parsed.toString();
  } catch {
    return url;
  }
}

export function validateNip98Auth(req: Request): Nip98ValidationResult {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Nostr ")) {
    return { ok: false, message: "Missing or invalid Authorization header." };
  }

  const eventBase64 = authHeader.slice(6).trim();
  if (!eventBase64) {
    return { ok: false, message: "Empty authorization token." };
  }

  let event: Nip98Event;
  try {
    const decoded = atob(eventBase64);
    event = JSON.parse(decoded) as Nip98Event;
  } catch {
    return { ok: false, message: "Invalid base64 or JSON in authorization." };
  }

  // Validate event structure
  if (!event.id || !event.pubkey || !event.sig || !event.tags) {
    return { ok: false, message: "Malformed NIP-98 event." };
  }

  // Validate kind
  if (event.kind !== NIP98_KIND) {
    return { ok: false, message: `Invalid event kind. Expected ${NIP98_KIND}.` };
  }

  // Validate signature
  if (!verifyEvent(event as Parameters<typeof verifyEvent>[0])) {
    return { ok: false, message: "Invalid event signature." };
  }

  // Validate timestamp (must be within 60 seconds)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - event.created_at) > NIP98_MAX_AGE_SECONDS) {
    return { ok: false, message: "NIP-98 event expired or too far in future." };
  }

  // Validate URL tag matches request
  const urlTag = findTag(event.tags, "u");
  if (!urlTag) {
    return { ok: false, message: "Missing URL tag in NIP-98 event." };
  }

  const requestUrl = normalizeUrl(req.url);
  const eventUrl = normalizeUrl(urlTag);
  if (requestUrl !== eventUrl) {
    return { ok: false, message: "URL mismatch in NIP-98 event." };
  }

  // Validate method tag matches request
  const methodTag = findTag(event.tags, "method");
  if (!methodTag) {
    return { ok: false, message: "Missing method tag in NIP-98 event." };
  }

  if (methodTag.toUpperCase() !== req.method.toUpperCase()) {
    return { ok: false, message: "HTTP method mismatch in NIP-98 event." };
  }

  // Optional: Validate payload hash for POST/PUT/PATCH
  // const payloadTag = findTag(event.tags, "payload");
  // This would require reading the body and hashing it

  // Create synthetic session (stateless - no DB storage)
  const session: Session = {
    token: `nip98:${event.id}`,
    pubkey: event.pubkey,
    npub: nip19.npubEncode(event.pubkey),
    method: "nip98",
    createdAt: event.created_at * 1000,
  };

  return { ok: true, session };
}

export function hasNip98Header(req: Request): boolean {
  const authHeader = req.headers.get("Authorization");
  return !!authHeader && authHeader.startsWith("Nostr ");
}
