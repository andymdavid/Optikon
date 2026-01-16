import type { Session } from "./types";

const CORS_ORIGIN = "http://localhost:5510";

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

export function applyCorsHeaders(response: Response) {
  response.headers.set("Access-Control-Allow-Origin", CORS_ORIGIN);
  response.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.headers.set("Access-Control-Allow-Credentials", "true");
  return response;
}

export function withErrorHandling<TArgs extends unknown[]>(
  handler: (...args: TArgs) => Promise<Response> | Response,
  onError?: (error: unknown) => void,
  decorateResponse?: (response: Response) => Response
) {
  return async (...args: TArgs) => {
    try {
      const response = await handler(...args);
      return decorateResponse ? decorateResponse(response) : response;
    } catch (error) {
      onError?.(error);
      const response = new Response("Internal Server Error", { status: 500 });
      return decorateResponse ? decorateResponse(response) : response;
    }
  };
}
