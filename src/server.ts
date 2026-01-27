import {
  APP_NAME,
  APP_TAG,
  RATE_LIMIT_AI_PER_WINDOW,
  RATE_LIMIT_LOGIN_PER_WINDOW,
  RATE_LIMIT_UPLOAD_PER_WINDOW,
  RATE_LIMIT_WINDOW_MS,
  COOKIE_SECURE,
  LOGIN_EVENT_KIND,
  LOGIN_MAX_AGE_SECONDS,
  PORT,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from "./config";
import { applyCorsHeaders, jsonResponse, withErrorHandling } from "./http";
import { error as logError, info as logInfo } from "./logger";
import { handleAiTasks, handleAiTasksPost, handleLatestSummary, handleSummaryPost } from "./routes/ai";
import { handleAttachmentDownload, handleAttachmentUpload } from "./routes/attachments";
import { createAuthHandlers } from "./routes/auth";
import {
  handleBoardCreate,
  handleBoardExport,
  handleBoardElementsBatchUpdate,
  handleBoardElementsDelete,
  handleBoardElementCreate,
  handleBoardElementUpdate,
  handleBoardElements,
  handleBoardImport,
  handleBoardShowWithSession,
  handleBoardsPresence,
  handleBoardsList,
  handleBoardUpdate,
  handleBoardStar,
  handleBoardArchive,
  handleBoardUnarchive,
  handleBoardDuplicate,
  handleBoardLeave,
  handleBoardDelete,
  handleBoardMembersCreate,
  handleBoardMembersDelete,
  handleBoardMembersList,
} from "./routes/boards";
import { handleHome } from "./routes/home";
import { handleTodoCreate, handleTodoDelete, handleTodoState, handleTodoUpdate } from "./routes/todos";
import {
  handleWorkspaceCreate,
  handleWorkspaceMemberCreate,
  handleWorkspaceMembersList,
  handleWorkspacesList,
} from "./routes/workspaces";
import { AuthService } from "./services/auth";
import { canViewBoard } from "./services/boardAccess";
import { fetchBoardById } from "./services/boards";
import { RateLimiter } from "./services/rateLimit";
import { serveStatic } from "./static";

import type { BoardElement } from "./shared/boardElements";
import type { Session } from "./types";
import type { Server, ServerWebSocket, WebSocketHandler } from "bun";

type CanvasMessageType = "joinBoard" | "elementUpdate" | "elementsUpdate" | "cursorMove" | "elementsDelete";

type CanvasMessageEnvelope = {
  type: CanvasMessageType;
  payload: unknown;
};

type WebSocketData = {
  session: Session | null;
  boardId: string | null;
  presenceUser: { pubkey: string; npub: string } | null;
};

type OnlineUser = {
  pubkey: string;
  npub: string;
};

const boardSockets = new Map<string, Set<ServerWebSocket<WebSocketData>>>();

function isCanvasMessageType(value: string): value is CanvasMessageType {
  return (
    value === "joinBoard" ||
    value === "elementUpdate" ||
    value === "elementsUpdate" ||
    value === "cursorMove" ||
    value === "elementsDelete"
  );
}

function parseCanvasMessage(data: unknown): CanvasMessageEnvelope | null {
  if (typeof data !== "string") return null;

  try {
    const parsed = JSON.parse(data) as Partial<CanvasMessageEnvelope>;
    if (!parsed?.type || !isCanvasMessageType(parsed.type)) return null;
    return { type: parsed.type, payload: parsed.payload } as CanvasMessageEnvelope;
  } catch (_error) {
    return null;
  }
}

function sendJson(ws: ServerWebSocket<WebSocketData>, payload: unknown) {
  ws.send(JSON.stringify(payload));
}

function extractBoardId(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const boardId = (payload as { boardId?: unknown }).boardId;
  if (typeof boardId !== "string" || !boardId.trim()) return null;
  return boardId;
}

function extractPresenceUser(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const user = (payload as { user?: unknown }).user;
  if (!user || typeof user !== "object") return null;
  const pubkey = (user as { pubkey?: unknown }).pubkey;
  const npub = (user as { npub?: unknown }).npub;
  if (typeof pubkey !== "string" || !pubkey.trim()) return null;
  if (typeof npub !== "string" || !npub.trim()) return null;
  return { pubkey, npub };
}

function handleCanvasMessage(ws: ServerWebSocket<WebSocketData>, message: CanvasMessageEnvelope) {
  switch (message.type) {
    case "joinBoard": {
      const boardId = extractBoardId(message.payload);
      if (!boardId) {
        sendJson(ws, { type: "error", payload: { message: "Invalid boardId" } });
        return;
      }
      const boardIdNumber = Number(boardId);
      if (!Number.isFinite(boardIdNumber)) {
        sendJson(ws, { type: "error", payload: { message: "Invalid boardId" } });
        return;
      }
      const board = fetchBoardById(boardIdNumber);
      if (!board) {
        sendJson(ws, { type: "error", payload: { message: "Board not found" } });
        return;
      }
      if (!canViewBoard(board, ws.data.session)) {
        sendJson(ws, { type: "error", payload: { message: "Forbidden" } });
        ws.close();
        return;
      }
      const presenceUser = extractPresenceUser(message.payload);
      if (presenceUser) {
        ws.data.presenceUser = presenceUser;
      }
      attachSocketToBoard(ws, boardId);
      sendJson(ws, { type: "joinAck", payload: { boardId, ok: true } });
      break;
    }
    case "elementUpdate": {
      handleElementUpdate(ws, message.payload);
      break;
    }
    case "elementsUpdate": {
      handleElementsUpdate(ws, message.payload);
      break;
    }
    case "cursorMove": {
      handleCursorMove(ws, message.payload);
      break;
    }
    case "elementsDelete": {
      handleElementsDelete(ws, message.payload);
      break;
    }
  }
}

function ensureJoined(ws: ServerWebSocket<WebSocketData>) {
  if (ws.data.boardId) return true;
  sendJson(ws, { type: "error", payload: { message: "Must joinBoard first" } });
  return false;
}

function attachSocketToBoard(ws: ServerWebSocket<WebSocketData>, boardId: string) {
  ws.data.boardId = boardId;
  let sockets = boardSockets.get(boardId);
  if (!sockets) {
    sockets = new Set();
    boardSockets.set(boardId, sockets);
  }
  sockets.add(ws);
  console.log(`[ws] joined board=${boardId} count=${sockets.size}`);
}

function detachSocketFromBoard(ws: ServerWebSocket<WebSocketData>) {
  const boardId = ws.data.boardId;
  if (!boardId) return;
  const sockets = boardSockets.get(boardId);
  if (!sockets) return;
  sockets.delete(ws);
  if (sockets.size === 0) {
    boardSockets.delete(boardId);
  }
  ws.data.boardId = null;
}

function collectOnlineUsersByBoard() {
  const result: Record<string, OnlineUser[]> = {};
  for (const [boardId, sockets] of boardSockets) {
    const unique = new Map<string, OnlineUser>();
    for (const socket of sockets) {
      const session = socket.data.session;
      const presence = socket.data.presenceUser;
      const pubkey = presence?.pubkey ?? session?.pubkey ?? null;
      const npub = presence?.npub ?? session?.npub ?? null;
      if (!pubkey || !npub) continue;
      if (!unique.has(pubkey)) {
        unique.set(pubkey, { pubkey, npub });
      }
    }
    result[boardId] = Array.from(unique.values());
  }
  return result;
}

function handleElementUpdate(ws: ServerWebSocket<WebSocketData>, payload: unknown) {
  const boardId = ws.data.boardId;
  if (!boardId) {
    sendJson(ws, { type: "error", payload: { message: "Must joinBoard first" } });
    return;
  }
  const typedPayload = payload as { boardId?: string; element?: BoardElement };
  const payloadBoardId = typedPayload?.boardId ?? null;
  if (!payloadBoardId || payloadBoardId !== boardId) {
    sendJson(ws, { type: "error", payload: { message: "Board mismatch" } });
    return;
  }
  const element = typedPayload.element;
  if (!element) {
    sendJson(ws, { type: "error", payload: { message: "Missing element" } });
    return;
  }
  const sockets = boardSockets.get(boardId);
  if (!sockets) return;
  let recipients = 0;
  for (const peer of sockets) {
    if (peer === ws) continue;
    peer.send(
      JSON.stringify({
        type: "elementUpdate",
        payload: { boardId, element },
      })
    );
    recipients += 1;
  }
  console.log(`[ws] elementUpdate board=${boardId} recipients=${recipients}`);
}

function handleElementsUpdate(ws: ServerWebSocket<WebSocketData>, payload: unknown) {
  const boardId = ws.data.boardId;
  if (!boardId) {
    sendJson(ws, { type: "error", payload: { message: "Must joinBoard first" } });
    return;
  }
  const typedPayload = payload as { boardId?: string; elements?: BoardElement[] };
  if (!typedPayload?.boardId || typedPayload.boardId !== boardId) {
    sendJson(ws, { type: "error", payload: { message: "Board mismatch" } });
    return;
  }
  const elements = Array.isArray(typedPayload.elements)
    ? typedPayload.elements.filter((element): element is BoardElement => !!element)
    : [];
  if (elements.length === 0) return;
  const sockets = boardSockets.get(boardId);
  if (!sockets) return;
  let recipients = 0;
  const message = JSON.stringify({ type: "elementsUpdate", payload: { boardId, elements } });
  for (const peer of sockets) {
    if (peer === ws) continue;
    peer.send(message);
    recipients += 1;
  }
  console.log(`[ws] elementsUpdate board=${boardId} recipients=${recipients}`);
}

function handleElementsDelete(ws: ServerWebSocket<WebSocketData>, payload: unknown) {
  const boardId = ws.data.boardId;
  if (!boardId) {
    sendJson(ws, { type: "error", payload: { message: "Must joinBoard first" } });
    return;
  }
  const typedPayload = payload as { boardId?: string; ids?: unknown };
  if (!typedPayload?.boardId || typedPayload.boardId !== boardId) {
    sendJson(ws, { type: "error", payload: { message: "Board mismatch" } });
    return;
  }
  const ids = Array.isArray(typedPayload.ids)
    ? typedPayload.ids.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  if (ids.length === 0) {
    sendJson(ws, { type: "error", payload: { message: "Invalid ids" } });
    return;
  }
  const sockets = boardSockets.get(boardId);
  if (!sockets) return;
  let recipients = 0;
  for (const peer of sockets) {
    if (peer === ws) continue;
    peer.send(
      JSON.stringify({
        type: "elementsDelete",
        payload: { boardId, ids },
      })
    );
    recipients += 1;
  }
  console.log(`[ws] elementsDelete board=${boardId} recipients=${recipients}`);
}

function handleCursorMove(ws: ServerWebSocket<WebSocketData>, payload: unknown) {
  const boardId = ws.data.boardId;
  if (!boardId) {
    sendJson(ws, { type: "error", payload: { message: "Must joinBoard first" } });
    return;
  }
  const typedPayload = payload as {
    boardId?: string;
    boardPoint?: { x?: unknown; y?: unknown };
    user?: { pubkey?: unknown; npub?: unknown } | null;
  } | null;
  if (!typedPayload?.boardId || typedPayload.boardId !== boardId) {
    sendJson(ws, { type: "error", payload: { message: "Board mismatch" } });
    return;
  }
  const point = typedPayload.boardPoint;
  if (!point || typeof point.x !== "number" || typeof point.y !== "number") {
    return;
  }
  const presenceUser = extractPresenceUser(typedPayload);
  if (presenceUser) {
    ws.data.presenceUser = presenceUser;
  }
  const sockets = boardSockets.get(boardId);
  if (!sockets) return;
  const payloadUser = ws.data.presenceUser ?? (ws.data.session
    ? { pubkey: ws.data.session.pubkey, npub: ws.data.session.npub }
    : null);
  const message = JSON.stringify({
    type: "cursorMove",
    payload: { boardId, boardPoint: { x: point.x, y: point.y }, user: payloadUser },
  });
  let recipients = 0;
  for (const peer of sockets) {
    if (peer === ws) continue;
    peer.send(message);
    recipients += 1;
  }
  console.log(`[ws] cursorMove board=${boardId} recipients=${recipients}`);
}

const websocketHandler: WebSocketHandler<WebSocketData> = {
  open(_ws) {
    console.log("[ws] open");
  },
  message(ws, data) {
    const parsed = parseCanvasMessage(data);
    if (!parsed) {
      sendJson(ws, { type: "error", payload: { message: "Invalid message" } });
      return;
    }
    console.log(`[ws] msg ${parsed.type}`);
    if (parsed.type !== "joinBoard" && !ensureJoined(ws)) {
      return;
    }
    handleCanvasMessage(ws, parsed);
  },
  close(ws) {
    const boardId = ws.data.boardId;
    detachSocketFromBoard(ws);
    console.log(`[ws] close board=${boardId ?? "null"}`);
  },
};

const authService = new AuthService(
  SESSION_COOKIE,
  APP_TAG,
  LOGIN_EVENT_KIND,
  LOGIN_MAX_AGE_SECONDS,
  COOKIE_SECURE,
  SESSION_MAX_AGE_SECONDS
);

const { login, logout, session: sessionHandler, me, sessionFromRequest } = createAuthHandlers(authService, SESSION_COOKIE);
const loginRateLimiter = new RateLimiter(RATE_LIMIT_WINDOW_MS, RATE_LIMIT_LOGIN_PER_WINDOW);
const uploadRateLimiter = new RateLimiter(RATE_LIMIT_WINDOW_MS, RATE_LIMIT_UPLOAD_PER_WINDOW);
const aiRateLimiter = new RateLimiter(RATE_LIMIT_WINDOW_MS, RATE_LIMIT_AI_PER_WINDOW);

function handleWebSocketUpgrade(req: Request, serverInstance: Server<WebSocketData>, session: Session | null) {
  const upgradeHeader = req.headers.get("upgrade");
  if (upgradeHeader?.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket upgrade", { status: 400 });
  }

  const upgraded = serverInstance.upgrade(req, {
    data: { session, boardId: null, presenceUser: session ? { pubkey: session.pubkey, npub: session.npub } : null },
  });
  if (upgraded) {
    return new Response(null, { status: 101 });
  }

  return new Response("WebSocket upgrade failed", { status: 500 });
}

function resolveRequestIp(req: Request, serverInstance: Server<WebSocketData>) {
  const resolved = serverInstance.requestIP(req) as { address?: string } | string | null;
  if (!resolved) return null;
  if (typeof resolved === "string") return resolved;
  if (typeof resolved.address === "string") return resolved.address;
  return null;
}

function ensureRequestId(req: Request) {
  const request = req as Request & { requestId?: string };
  if (!request.requestId) {
    request.requestId = crypto.randomUUID();
  }
  return request.requestId;
}

function rateLimitKey(prefix: string, ip: string | null) {
  return `${prefix}:${ip ?? "unknown"}`;
}

function enforceRateLimit(limiter: RateLimiter, key: string) {
  const result = limiter.check(key);
  if (result.allowed) return null;
  const retryAfterSeconds = Math.ceil(result.retryAfterMs / 1000);
  return jsonResponse(
    { message: "Rate limit exceeded. Try again later.", retryAfterSeconds },
    429
  );
}

function formatErrorPayload(error: unknown) {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack, name: error.name };
  }
  return { message: String(error) };
}

async function routeRequest(req: Request, serverInstance: Server<WebSocketData>) {
  const url = new URL(req.url);
  const { pathname } = url;
  const session = sessionFromRequest(req);
  const requestIp = resolveRequestIp(req, serverInstance);
  const requestId = ensureRequestId(req);
  const startedAt = Date.now();
  logInfo("request.start", {
    requestId,
    method: req.method,
    path: pathname,
    ip: requestIp,
  });
  let response: Response | null = null;
  const respond = (next: Response) => {
    response = next;
    return next;
  };

  try {
    if (req.method === "OPTIONS") {
      return respond(new Response(null, { status: 204 }));
    }

    if (pathname === "/ws") {
      return respond(handleWebSocketUpgrade(req, serverInstance, session));
    }

    if (req.method === "GET") {
      const staticResponse = await serveStatic(pathname);
      if (staticResponse) return respond(staticResponse);

      const aiTasksMatch = pathname.match(/^\/ai\/tasks\/(\d+)(?:\/(yes|no))?$/);
      if (aiTasksMatch) {
        const limited = enforceRateLimit(aiRateLimiter, rateLimitKey("ai", requestIp));
        if (limited) return respond(limited);
        return respond(handleAiTasks(req, url, aiTasksMatch, requestIp));
      }
      if (pathname === "/ai/summary/latest") {
        const limited = enforceRateLimit(aiRateLimiter, rateLimitKey("ai", requestIp));
        if (limited) return respond(limited);
        return respond(handleLatestSummary(req, url, requestIp));
      }
      if (pathname === "/auth/session") return respond(sessionHandler(req));
      if (pathname === "/auth/me") return respond(me(req));
      const attachmentDownloadMatch = pathname.match(/^\/boards\/(\d+)\/attachments\/([^/]+)$/);
      if (attachmentDownloadMatch) {
        return respond(
          await handleAttachmentDownload(Number(attachmentDownloadMatch[1]), attachmentDownloadMatch[2], session)
        );
      }
    const boardElementsMatch = pathname.match(/^\/boards\/(\d+)\/elements$/);
    if (boardElementsMatch) return respond(handleBoardElements(Number(boardElementsMatch[1]), session));
    const boardMembersMatch = pathname.match(/^\/boards\/(\d+)\/members$/);
    if (boardMembersMatch) return respond(handleBoardMembersList(Number(boardMembersMatch[1]), session));
    const boardExportMatch = pathname.match(/^\/boards\/(\d+)\/export$/);
    if (boardExportMatch) return respond(handleBoardExport(Number(boardExportMatch[1]), session));
      const boardMatch = pathname.match(/^\/boards\/(\d+)$/);
      if (boardMatch) return respond(handleBoardShowWithSession(Number(boardMatch[1]), session));
      if (pathname === "/boards/presence")
        return respond(handleBoardsPresence(collectOnlineUsersByBoard(), session));
      if (pathname === "/boards") return respond(handleBoardsList(url, collectOnlineUsersByBoard(), session));
      if (pathname === "/workspaces") return respond(handleWorkspacesList(session));
      const workspaceMembersMatch = pathname.match(/^\/workspaces\/(\d+)\/members$/);
      if (workspaceMembersMatch) {
        return respond(handleWorkspaceMembersList(Number(workspaceMembersMatch[1]), session));
      }
      if (pathname === "/") return respond(handleHome(url, session));
    }

    if (req.method === "POST") {
      if (pathname === "/boards") return respond(await handleBoardCreate(req, session));
      if (pathname === "/boards/import") return respond(await handleBoardImport(req, session));
      if (pathname === "/workspaces") return respond(await handleWorkspaceCreate(req, session));
      const workspaceMembersMatch = pathname.match(/^\/workspaces\/(\d+)\/members$/);
      if (workspaceMembersMatch) {
        return respond(await handleWorkspaceMemberCreate(req, Number(workspaceMembersMatch[1]), session));
      }
      if (pathname === "/auth/login") {
        const limited = enforceRateLimit(loginRateLimiter, rateLimitKey("auth-login", requestIp));
        if (limited) return respond(limited);
        return respond(await login(req));
      }
      if (pathname === "/auth/logout") return respond(logout(req));
      if (pathname === "/ai/summary") {
        const limited = enforceRateLimit(aiRateLimiter, rateLimitKey("ai", requestIp));
        if (limited) return respond(limited);
        return respond(await handleSummaryPost(req, requestIp));
      }
      if (pathname === "/ai/tasks") {
        const limited = enforceRateLimit(aiRateLimiter, rateLimitKey("ai", requestIp));
        if (limited) return respond(limited);
        return respond(await handleAiTasksPost(req, requestIp));
      }
      if (pathname === "/todos") return respond(await handleTodoCreate(req, session));
      const boardElementMatch = pathname.match(/^\/boards\/(\d+)\/elements$/);
      if (boardElementMatch)
        return respond(await handleBoardElementCreate(req, Number(boardElementMatch[1]), session));
      const boardArchiveMatch = pathname.match(/^\/boards\/(\d+)\/archive$/);
      if (boardArchiveMatch) return respond(handleBoardArchive(Number(boardArchiveMatch[1]), session));
      const boardUnarchiveMatch = pathname.match(/^\/boards\/(\d+)\/unarchive$/);
      if (boardUnarchiveMatch) return respond(handleBoardUnarchive(Number(boardUnarchiveMatch[1]), session));
      const boardDuplicateMatch = pathname.match(/^\/boards\/(\d+)\/duplicate$/);
      if (boardDuplicateMatch) return respond(handleBoardDuplicate(Number(boardDuplicateMatch[1]), session));
    const boardLeaveMatch = pathname.match(/^\/boards\/(\d+)\/leave$/);
    if (boardLeaveMatch) return respond(handleBoardLeave(Number(boardLeaveMatch[1]), session));
    const boardMembersMatch = pathname.match(/^\/boards\/(\d+)\/members$/);
    if (boardMembersMatch) return respond(await handleBoardMembersCreate(req, Number(boardMembersMatch[1]), session));
      const attachmentMatch = pathname.match(/^\/boards\/(\d+)\/attachments$/);
      if (attachmentMatch) {
        const limited = enforceRateLimit(uploadRateLimiter, rateLimitKey("upload", requestIp));
        if (limited) return respond(limited);
        return respond(await handleAttachmentUpload(req, Number(attachmentMatch[1]), session));
      }

      const updateMatch = pathname.match(/^\/todos\/(\d+)\/update$/);
      if (updateMatch) return respond(await handleTodoUpdate(req, session, Number(updateMatch[1])));

      const stateMatch = pathname.match(/^\/todos\/(\d+)\/state$/);
      if (stateMatch) return respond(await handleTodoState(req, session, Number(stateMatch[1])));

      const deleteMatch = pathname.match(/^\/todos\/(\d+)\/delete$/);
      if (deleteMatch) return respond(await handleTodoDelete(session, Number(deleteMatch[1])));
    }

    if (req.method === "PATCH") {
      const boardMatch = pathname.match(/^\/boards\/(\d+)$/);
      if (boardMatch) return respond(await handleBoardUpdate(req, Number(boardMatch[1]), session));
      const starMatch = pathname.match(/^\/boards\/(\d+)\/star$/);
      if (starMatch) return respond(await handleBoardStar(req, Number(starMatch[1]), session));
    }

    if (req.method === "PUT") {
      const boardElementsBatchMatch = pathname.match(/^\/boards\/(\d+)\/elements$/);
      if (boardElementsBatchMatch) {
        return respond(await handleBoardElementsBatchUpdate(req, Number(boardElementsBatchMatch[1]), session));
      }
      const boardElementUpdateMatch = pathname.match(/^\/boards\/(\d+)\/elements\/([^/]+)$/);
      if (boardElementUpdateMatch) {
        return respond(
          await handleBoardElementUpdate(req, Number(boardElementUpdateMatch[1]), boardElementUpdateMatch[2], session)
        );
      }
    }

  if (req.method === "DELETE") {
    const boardElementsDeleteMatch = pathname.match(/^\/boards\/(\d+)\/elements$/);
    if (boardElementsDeleteMatch) {
      return respond(await handleBoardElementsDelete(req, Number(boardElementsDeleteMatch[1]), session));
    }
    const boardMemberDeleteMatch = pathname.match(/^\/boards\/(\d+)\/members\/([^/]+)$/);
    if (boardMemberDeleteMatch) {
      return respond(handleBoardMembersDelete(Number(boardMemberDeleteMatch[1]), boardMemberDeleteMatch[2], session));
    }
    const boardMatch = pathname.match(/^\/boards\/(\d+)$/);
    if (boardMatch) return respond(await handleBoardDelete(Number(boardMatch[1]), session));

      const todoDeleteMatch = pathname.match(/^\/todos\/(\d+)\/delete$/);
      if (todoDeleteMatch) return respond(await handleTodoDelete(session, Number(todoDeleteMatch[1])));
    }

    return respond(new Response("Not found", { status: 404 }));
  } finally {
    const status = (response as Response | null)?.status ?? 500;
    logInfo("request.end", {
      requestId,
      method: req.method,
      path: pathname,
      status,
      durationMs: Date.now() - startedAt,
    });
  }
}

const server = Bun.serve<WebSocketData>({
  port: PORT,
  websocket: websocketHandler,
  fetch: withErrorHandling(
    (req: Request, serverInstance: Server<WebSocketData>) => routeRequest(req, serverInstance),
    (error, req) => {
      const requestId = ensureRequestId(req);
      const url = new URL(req.url);
      logError("request.error", {
        requestId,
        method: req.method,
        path: url.pathname,
        error: formatErrorPayload(error),
      });
    },
    (response) => {
      if (response.status === 101) return response;
      return applyCorsHeaders(response);
    }
  ),
});

console.log(`${APP_NAME} ready on http://localhost:${server.port}`);
