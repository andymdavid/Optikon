import { jsonResponse, safeJson } from "../http";
import { parseSessionCookie } from "../services/auth";
import { validateLoginMethod } from "../validation";
export function createAuthHandlers(authService, cookieName) {
    const login = async (req) => {
        const body = (await safeJson(req));
        if (!body?.method || !body.event || !validateLoginMethod(body.method)) {
            return jsonResponse({ message: "Invalid payload." }, 400);
        }
        return authService.login(body.method, body.event);
    };
    const logout = (req) => {
        const token = parseSessionCookie(req, cookieName);
        return authService.logout(token);
    };
    const sessionFromRequest = (req) => {
        const token = parseSessionCookie(req, cookieName);
        return authService.getSession(token);
    };
    return { login, logout, sessionFromRequest };
}
