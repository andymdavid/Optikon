const CORS_ORIGIN = "http://localhost:5510";
export function redirect(path) {
    return new Response(null, { status: 303, headers: { Location: path } });
}
export function unauthorized() {
    return new Response("Unauthorized", { status: 401 });
}
export function jsonResponse(body, status = 200, cookie) {
    const headers = { "Content-Type": "application/json" };
    if (cookie)
        headers["Set-Cookie"] = cookie;
    return new Response(JSON.stringify(body), { status, headers });
}
export function parseCookies(header) {
    const map = {};
    if (!header)
        return map;
    const pairs = header.split(";").map((part) => part.trim());
    for (const pair of pairs) {
        const [key, ...rest] = pair.split("=");
        if (!key)
            continue;
        map[key] = decodeURIComponent(rest.join("="));
    }
    return map;
}
export async function safeJson(req) {
    try {
        return await req.json();
    }
    catch (_err) {
        return null;
    }
}
export function serializeSessionCookie(token, cookieName, maxAgeSeconds, secure) {
    if (!token) {
        return `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
    }
    const secureFlag = secure ? "; Secure" : "";
    return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secureFlag}`;
}
export function sessionFromRequest(req, cookieName, sessionStore) {
    const cookies = parseCookies(req.headers.get("cookie"));
    const token = cookies[cookieName];
    if (!token)
        return null;
    return sessionStore.get(token) ?? null;
}
export function applyCorsHeaders(response) {
    response.headers.set("Access-Control-Allow-Origin", CORS_ORIGIN);
    response.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    return response;
}
export function withErrorHandling(handler, onError, decorateResponse) {
    return async (...args) => {
        try {
            const response = await handler(...args);
            return decorateResponse ? decorateResponse(response) : response;
        }
        catch (error) {
            onError?.(error);
            const response = new Response("Internal Server Error", { status: 500 });
            return decorateResponse ? decorateResponse(response) : response;
        }
    };
}
