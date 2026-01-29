import { jsonResponse, safeJson } from "../http";
import { parseSessionCookie } from "../services/auth";
import { hasNip98Header, validateNip98Auth } from "../services/nip98";
import { validateLoginMethod } from "../validation";

import type { AuthService } from "../services/auth";
import type { Session } from "../types";

type LoginRequestBody = {
  method?: Session["method"];
  event?: {
    id: string;
    pubkey: string;
    sig: string;
    kind: number;
    content: string;
    created_at: number;
    tags: string[][];
  };
};

export function createAuthHandlers(authService: AuthService, cookieName: string) {
  const login = async (req: Request) => {
    const body = (await safeJson(req)) as LoginRequestBody | null;
    if (!body?.method || !body.event || !validateLoginMethod(body.method)) {
      return jsonResponse({ message: "Invalid payload." }, 400);
    }
    return authService.login(body.method, body.event);
  };

  const logout = (req: Request) => {
    const token = parseSessionCookie(req, cookieName);
    return authService.logout(token);
  };

  const session = (req: Request) => {
    const token = parseSessionCookie(req, cookieName);
    const current = authService.getSession(token);
    if (!current) return jsonResponse({ message: "Unauthorized" }, 401);
    return jsonResponse({ pubkey: current.pubkey, npub: current.npub, method: current.method }, 200);
  };

  const me = (req: Request) => {
    const token = parseSessionCookie(req, cookieName);
    const current = authService.getSession(token);
    if (!current) return jsonResponse(null, 200);
    return jsonResponse({ pubkey: current.pubkey, npub: current.npub }, 200);
  };

  const sessionFromRequest = (req: Request): Session | null => {
    // Try NIP-98 auth first (stateless, no DB lookup)
    if (hasNip98Header(req)) {
      const result = validateNip98Auth(req);
      if (result.ok) {
        return result.session;
      }
      // NIP-98 header present but invalid - don't fall back to cookie
      // This prevents confusion about which auth method is being used
      return null;
    }

    // Fall back to cookie-based session auth
    const token = parseSessionCookie(req, cookieName);
    return authService.getSession(token);
  };

  return { login, logout, session, me, sessionFromRequest };
}
