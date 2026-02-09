import { join } from "path";

import { nip19 } from "nostr-tools";

export const PORT = Number(Bun.env.PORT ?? 3025);
export const SESSION_COOKIE = "nostr_session";
export const LOGIN_EVENT_KIND = 27235;
export const LOGIN_MAX_AGE_SECONDS = 60;
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
export const COOKIE_SECURE = Bun.env.NODE_ENV === "production";
export const APP_NAME = "Other Stuff To Do";
export const APP_TAG = "other-stuff-to-do";
export const PUBLIC_DIR = join(import.meta.dir, "../public");
export const FRONTEND_DIR = join(import.meta.dir, "../dist");
export const UPLOADS_DIR = join(import.meta.dir, "../data/uploads");
export const UPLOADS_PUBLIC_PATH = "/uploads";
export const AI_AGENT_TOKEN = (Bun.env.AI_AGENT_TOKEN ?? "").trim();
export const AI_AGENT_ALLOW_REMOTE = Bun.env.AI_AGENT_ALLOW_REMOTE === "true";

// Whitelisted users (comma-separated npubs, empty = allow all)
const DEFAULT_WHITELIST = "npub1jss47s4fvv6usl7tn6yp5zamv2u60923ncgfea0e6thkza5p7c3q0afmzy,npub1qkntvygrrxkc3ynfzw56aq8far9wnxcfjd8d4lfwhnnlnctn4k5sa2d05s,npub12guhgpnn700zd02jf052yc0c9pnz7jadnyasfe6ss22scq0ycxtqudypta";
const whitelistRaw = (Bun.env.WHITELIST_USERS ?? DEFAULT_WHITELIST).trim();

function parseNpubToPubkey(npub: string): string | null {
  try {
    const decoded = nip19.decode(npub.trim());
    if (decoded.type === "npub") {
      return decoded.data as string;
    }
    // If it's already a hex pubkey, return as-is
    if (/^[0-9a-f]{64}$/i.test(npub.trim())) {
      return npub.trim().toLowerCase();
    }
    return null;
  } catch {
    // If it's already a hex pubkey, return as-is
    if (/^[0-9a-f]{64}$/i.test(npub.trim())) {
      return npub.trim().toLowerCase();
    }
    return null;
  }
}

export const WHITELISTED_PUBKEYS: Set<string> | null = whitelistRaw
  ? new Set(
      whitelistRaw
        .split(",")
        .map((p) => parseNpubToPubkey(p))
        .filter((p): p is string => p !== null)
    )
  : null;

export function isWhitelistedPubkey(pubkey: string): boolean {
  if (!WHITELISTED_PUBKEYS || WHITELISTED_PUBKEYS.size === 0) return true;
  return WHITELISTED_PUBKEYS.has(pubkey.toLowerCase());
}
export const RATE_LIMIT_WINDOW_MS = Number(Bun.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
export const RATE_LIMIT_LOGIN_PER_WINDOW = Number(Bun.env.RATE_LIMIT_LOGIN_PER_WINDOW ?? 10);
export const RATE_LIMIT_UPLOAD_PER_WINDOW = Number(Bun.env.RATE_LIMIT_UPLOAD_PER_WINDOW ?? 30);
export const RATE_LIMIT_AI_PER_WINDOW = Number(Bun.env.RATE_LIMIT_AI_PER_WINDOW ?? 60);

export const STATIC_FILES = new Map<string, string>([
  ["/favicon.ico", "favicon.png"],
  ["/favicon.png", "favicon.png"],
  ["/apple-touch-icon.png", "apple-touch-icon.png"],
  ["/icon-192.png", "icon-192.png"],
  ["/icon-512.png", "icon-512.png"],
  ["/manifest.webmanifest", "manifest.webmanifest"],
  ["/app.js", "app.js"],
  ["/app.css", "app.css"],
]);
