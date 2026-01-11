import { nip19 } from "nostr-tools";
import { verifyEvent } from "nostr-tools/pure";
import { jsonResponse, serializeSessionCookie } from "../http";
export class AuthService {
    sessionCookieName;
    appTag;
    loginKind;
    loginMaxAgeSeconds;
    cookieSecure;
    sessionMaxAgeSeconds;
    sessions = new Map();
    constructor(sessionCookieName, appTag, loginKind, loginMaxAgeSeconds, cookieSecure, sessionMaxAgeSeconds) {
        this.sessionCookieName = sessionCookieName;
        this.appTag = appTag;
        this.loginKind = loginKind;
        this.loginMaxAgeSeconds = loginMaxAgeSeconds;
        this.cookieSecure = cookieSecure;
        this.sessionMaxAgeSeconds = sessionMaxAgeSeconds;
    }
    getSession(token) {
        if (!token)
            return null;
        return this.sessions.get(token) ?? null;
    }
    destroySession(token) {
        if (!token)
            return;
        this.sessions.delete(token);
    }
    validateLoginEvent(method, event) {
        if (!event)
            return { ok: false, message: "Missing event." };
        if (event.kind !== this.loginKind)
            return { ok: false, message: "Unexpected event kind." };
        if (!verifyEvent(event))
            return { ok: false, message: "Invalid event signature." };
        const now = Math.floor(Date.now() / 1000);
        if (Math.abs(now - event.created_at) > this.loginMaxAgeSeconds) {
            return { ok: false, message: "Login event expired." };
        }
        const hasAppTag = event.tags.some((tag) => tag[0] === "app" && tag[1] === this.appTag);
        if (!hasAppTag)
            return { ok: false, message: "Missing app tag." };
        const hasMethodTag = event.tags.some((tag) => tag[0] === "method" && tag[1] === method);
        if (!hasMethodTag)
            return { ok: false, message: "Method mismatch." };
        return { ok: true };
    }
    createSession(method, event) {
        const token = crypto.randomUUID();
        const session = {
            token,
            pubkey: event.pubkey,
            npub: nip19.npubEncode(event.pubkey),
            method,
            createdAt: Date.now(),
        };
        this.sessions.set(token, session);
        return {
            session,
            cookie: serializeSessionCookie(token, this.sessionCookieName, this.sessionMaxAgeSeconds, this.cookieSecure),
        };
    }
    login(method, event) {
        const validation = this.validateLoginEvent(method, event);
        if (!validation.ok)
            return jsonResponse({ message: validation.message }, 422);
        const { session, cookie } = this.createSession(method, event);
        return jsonResponse(session, 200, cookie);
    }
    logout(token) {
        if (token) {
            this.sessions.delete(token);
        }
        const cleared = serializeSessionCookie(null, this.sessionCookieName, this.sessionMaxAgeSeconds, this.cookieSecure);
        return jsonResponse({ ok: true }, 200, cleared);
    }
}
export function parseSessionCookie(req, cookieName) {
    const cookieHeader = req.headers.get("cookie");
    if (!cookieHeader)
        return null;
    const pairs = cookieHeader.split(";").map((pair) => pair.trim());
    for (const pair of pairs) {
        const [key, ...rest] = pair.split("=");
        if (key === cookieName)
            return decodeURIComponent(rest.join("="));
    }
    return null;
}
