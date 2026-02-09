import { nip19 } from "nostr-tools";
import { verifyEvent } from "nostr-tools/pure";

import { isWhitelistedPubkey } from "../config";

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

function getPublicUrl(req: Request): string {
  // Behind reverse proxy (Cloudflare, nginx, etc.), reconstruct the public URL
  // Check various headers that proxies use
  let proto = req.headers.get("X-Forwarded-Proto");

  // Cloudflare also sends CF-Visitor with scheme info
  if (!proto) {
    const cfVisitor = req.headers.get("CF-Visitor");
    if (cfVisitor) {
      try {
        const parsed = JSON.parse(cfVisitor);
        proto = parsed.scheme;
      } catch { /* ignore */ }
    }
  }

  // Default to https if host looks like a real domain (not localhost)
  const host = req.headers.get("X-Forwarded-Host") || req.headers.get("Host") || "localhost";
  if (!proto) {
    proto = host.includes("localhost") || host.startsWith("127.") ? "http" : "https";
  }

  const url = new URL(req.url);
  return `${proto}://${host}${url.pathname}${url.search}`;
}

export function validateNip98Auth(req: Request): Nip98ValidationResult {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Nostr ")) {
    console.log("[nip98] Missing or invalid Authorization header");
    return { ok: false, message: "Missing or invalid Authorization header." };
  }

  const eventBase64 = authHeader.slice(6).trim();
  if (!eventBase64) {
    console.log("[nip98] Empty authorization token");
    return { ok: false, message: "Empty authorization token." };
  }

  let event: Nip98Event;
  try {
    const decoded = atob(eventBase64);
    event = JSON.parse(decoded) as Nip98Event;
  } catch (err) {
    console.log("[nip98] Invalid base64 or JSON:", err);
    return { ok: false, message: "Invalid base64 or JSON in authorization." };
  }

  // Validate event structure
  if (!event.id || !event.pubkey || !event.sig || !event.tags) {
    console.log("[nip98] Malformed event - missing fields");
    return { ok: false, message: "Malformed NIP-98 event." };
  }

  // Validate kind
  if (event.kind !== NIP98_KIND) {
    console.log(`[nip98] Invalid kind: ${event.kind}, expected ${NIP98_KIND}`);
    return { ok: false, message: `Invalid event kind. Expected ${NIP98_KIND}.` };
  }

  // Validate signature
  if (!verifyEvent(event as Parameters<typeof verifyEvent>[0])) {
    console.log("[nip98] Invalid signature");
    return { ok: false, message: "Invalid event signature." };
  }

  // Check pubkey whitelist (if configured)
  if (!isWhitelistedPubkey(event.pubkey)) {
    console.log(`[nip98] Pubkey not in whitelist: ${event.pubkey.slice(0, 8)}...`);
    return { ok: false, message: "Pubkey not authorized for access." };
  }

  // Validate timestamp (must be within 60 seconds)
  const now = Math.floor(Date.now() / 1000);
  const timeDiff = Math.abs(now - event.created_at);
  if (timeDiff > NIP98_MAX_AGE_SECONDS) {
    console.log(`[nip98] Timestamp expired: diff=${timeDiff}s, max=${NIP98_MAX_AGE_SECONDS}s, event_time=${event.created_at}, server_time=${now}`);
    return { ok: false, message: "NIP-98 event expired or too far in future." };
  }

  // Validate URL tag matches request
  const urlTag = findTag(event.tags, "u");
  if (!urlTag) {
    console.log("[nip98] Missing URL tag");
    return { ok: false, message: "Missing URL tag in NIP-98 event." };
  }

  const requestUrl = normalizeUrl(getPublicUrl(req));
  const eventUrl = normalizeUrl(urlTag);
  if (requestUrl !== eventUrl) {
    console.log(`[nip98] URL mismatch: request="${requestUrl}", event="${eventUrl}"`);
    return { ok: false, message: "URL mismatch in NIP-98 event." };
  }

  // Validate method tag matches request
  const methodTag = findTag(event.tags, "method");
  if (!methodTag) {
    console.log("[nip98] Missing method tag");
    return { ok: false, message: "Missing method tag in NIP-98 event." };
  }

  if (methodTag.toUpperCase() !== req.method.toUpperCase()) {
    console.log(`[nip98] Method mismatch: request="${req.method}", event="${methodTag}"`);
    return { ok: false, message: "HTTP method mismatch in NIP-98 event." };
  }

  console.log(`[nip98] Auth successful for pubkey=${event.pubkey.slice(0, 8)}...`)

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
