import type { Session } from "./types";

// Allowed origins for CORS (comma-separated in env, or defaults)
const CORS_ALLOWED_ORIGINS = new Set(
  (Bun.env.CORS_ORIGINS ?? "http://localhost:5510,http://localhost:3025").split(",").map((o) => o.trim())
);

export function redirect(path: string) {
  return new Response(null, { status: 303, headers: { Location: path } });
}

export function unauthorized() {
  return new Response("Unauthorized", { status: 401 });
}

export function jsonResponse(body: unknown, status = 200, cookie?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cookie) headers["Set-Cookie"] = cookie;
  return new Response(JSON.stringify(body), { status, headers });
}

export function parseCookies(header: string | null) {
  const map: Record<string, string> = {};
  if (!header) return map;
  const pairs = header.split(";").map((part) => part.trim());
  for (const pair of pairs) {
    const [key, ...rest] = pair.split("=");
    if (!key) continue;
    map[key] = decodeURIComponent(rest.join("="));
  }
  return map;
}

export async function safeJson(req: Request) {
  try {
    return await req.json();
  } catch (_err) {
    return null;
  }
}

export function serializeSessionCookie(token: string | null, cookieName: string, maxAgeSeconds: number, secure: boolean) {
  if (!token) {
    return `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  }
  const secureFlag = secure ? "; Secure" : "";
  return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secureFlag}`;
}

export function sessionFromRequest(req: Request, cookieName: string, sessionStore: Map<string, Session>) {
  const cookies = parseCookies(req.headers.get("cookie"));
  const token = cookies[cookieName];
  if (!token) return null;
  return sessionStore.get(token) ?? null;
}

export function applyCorsHeaders(response: Response, requestOrigin?: string | null) {
  // Determine allowed origin
  let allowedOrigin = "";
  if (requestOrigin && CORS_ALLOWED_ORIGINS.has(requestOrigin)) {
    // Known origin - allow with credentials
    allowedOrigin = requestOrigin;
    response.headers.set("Access-Control-Allow-Credentials", "true");
  } else if (requestOrigin) {
    // Unknown origin - allow for NIP-98 API access (no credentials)
    allowedOrigin = requestOrigin;
    // Don't set Allow-Credentials for unknown origins
  }

  if (allowedOrigin) {
    response.headers.set("Access-Control-Allow-Origin", allowedOrigin);
  }
  response.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return response;
}

export function withErrorHandling<TArgs extends unknown[]>(
  handler: (...args: TArgs) => Promise<Response> | Response,
  onError?: (error: unknown, ...args: TArgs) => void,
  decorateResponse?: (response: Response, ...args: TArgs) => Response
) {
  return async (...args: TArgs) => {
    try {
      const response = await handler(...args);
      return decorateResponse ? decorateResponse(response, ...args) : response;
    } catch (error) {
      onError?.(error, ...args);
      const response = new Response("Internal Server Error", { status: 500 });
      return decorateResponse ? decorateResponse(response, ...args) : response;
    }
  };
}
