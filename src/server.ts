import {
  APP_NAME,
  APP_TAG,
  COOKIE_SECURE,
  LOGIN_EVENT_KIND,
  LOGIN_MAX_AGE_SECONDS,
  PORT,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from "./config";
import { applyCorsHeaders, jsonResponse, withErrorHandling } from "./http";
import { logError } from "./logger";
import { handleAiTasks, handleAiTasksPost, handleLatestSummary, handleSummaryPost } from "./routes/ai";
import { handleAttachmentUpload } from "./routes/attachments";
import { createAuthHandlers } from "./routes/auth";
import {
  handleBoardCreate,
  handleBoardElementsBatchUpdate,
  handleBoardElementsDelete,
  handleBoardElementCreate,
  handleBoardElementUpdate,
  handleBoardElements,
  handleBoardShow,
  handleBoardsList,
} from "./routes/boards";
import { handleHome } from "./routes/home";
import { handleTodoCreate, handleTodoDelete, handleTodoState, handleTodoUpdate } from "./routes/todos";
import { AuthService } from "./services/auth";
import { serveStatic, serveUpload } from "./static";

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

function handleCanvasMessage(ws: ServerWebSocket<WebSocketData>, message: CanvasMessageEnvelope) {
  switch (message.type) {
    case "joinBoard": {
      const boardId = extractBoardId(message.payload);
      if (!boardId) {
        sendJson(ws, { type: "error", payload: { message: "Invalid boardId" } });
        return;
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
      // TODO: implement realtime handling
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

function handleWebSocketUpgrade(req: Request, serverInstance: Server<WebSocketData>, session: Session | null) {
  const upgradeHeader = req.headers.get("upgrade");
  if (upgradeHeader?.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket upgrade", { status: 400 });
  }

  const upgraded = serverInstance.upgrade(req, { data: { session, boardId: null } });
  if (upgraded) {
    return new Response(null, { status: 101 });
  }

  return new Response("WebSocket upgrade failed", { status: 500 });
}

async function routeRequest(req: Request, serverInstance: Server<WebSocketData>) {
  const url = new URL(req.url);
  const { pathname } = url;
  const session = sessionFromRequest(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (pathname === "/ws") {
    return handleWebSocketUpgrade(req, serverInstance, session);
  }

  if (req.method === "GET") {
    const uploadResponse = await serveUpload(pathname);
    if (uploadResponse) return uploadResponse;
    const staticResponse = await serveStatic(pathname);
    if (staticResponse) return staticResponse;

    const aiTasksMatch = pathname.match(/^\/ai\/tasks\/(\d+)(?:\/(yes|no))?$/);
    if (aiTasksMatch) return handleAiTasks(url, aiTasksMatch);
    if (pathname === "/ai/summary/latest") return handleLatestSummary(url);
    if (pathname === "/auth/session") return sessionHandler(req);
    if (pathname === "/auth/me") return me(req);
    const boardElementsMatch = pathname.match(/^\/boards\/(\d+)\/elements$/);
    if (boardElementsMatch) return handleBoardElements(Number(boardElementsMatch[1]));
    const boardMatch = pathname.match(/^\/boards\/(\d+)$/);
    if (boardMatch) return handleBoardShow(Number(boardMatch[1]));
    if (pathname === "/") return handleHome(url, session);
  }

  if (req.method === "POST") {
    if (pathname === "/boards") {
      if (req.method === "GET") return handleBoardsList();
      if (req.method === "POST") return handleBoardCreate(req);
      return jsonResponse({ message: "Method not allowed." }, 405);
    }
    if (pathname === "/auth/login") return login(req);
    if (pathname === "/auth/logout") return logout(req);
    if (pathname === "/ai/summary") return handleSummaryPost(req);
    if (pathname === "/ai/tasks") return handleAiTasksPost(req);
    if (pathname === "/todos") return handleTodoCreate(req, session);
    const boardElementMatch = pathname.match(/^\/boards\/(\d+)\/elements$/);
    if (boardElementMatch) return handleBoardElementCreate(req, Number(boardElementMatch[1]));
    const attachmentMatch = pathname.match(/^\/boards\/(\d+)\/attachments$/);
    if (attachmentMatch) return handleAttachmentUpload(req, Number(attachmentMatch[1]), session);

    const updateMatch = pathname.match(/^\/todos\/(\d+)\/update$/);
    if (updateMatch) return handleTodoUpdate(req, session, Number(updateMatch[1]));

    const stateMatch = pathname.match(/^\/todos\/(\d+)\/state$/);
    if (stateMatch) return handleTodoState(req, session, Number(stateMatch[1]));

    const deleteMatch = pathname.match(/^\/todos\/(\d+)\/delete$/);
    if (deleteMatch) return handleTodoDelete(session, Number(deleteMatch[1]));
  }

  if (req.method === "PUT") {
    const boardElementsBatchMatch = pathname.match(/^\/boards\/(\d+)\/elements$/);
    if (boardElementsBatchMatch) {
      return handleBoardElementsBatchUpdate(req, Number(boardElementsBatchMatch[1]));
    }
    const boardElementUpdateMatch = pathname.match(/^\/boards\/(\d+)\/elements\/([^/]+)$/);
    if (boardElementUpdateMatch) {
      return handleBoardElementUpdate(req, Number(boardElementUpdateMatch[1]), boardElementUpdateMatch[2]);
    }
  }

  if (req.method === "DELETE") {
    const boardElementsDeleteMatch = pathname.match(/^\/boards\/(\d+)\/elements$/);
    if (boardElementsDeleteMatch) {
      return handleBoardElementsDelete(req, Number(boardElementsDeleteMatch[1]));
    }

    const todoDeleteMatch = pathname.match(/^\/todos\/(\d+)\/delete$/);
    if (todoDeleteMatch) return handleTodoDelete(session, Number(todoDeleteMatch[1]));
  }

  return new Response("Not found", { status: 404 });
}

const server = Bun.serve<WebSocketData>({
  port: PORT,
  websocket: websocketHandler,
  fetch: withErrorHandling(
    (req: Request, serverInstance: Server<WebSocketData>) => routeRequest(req, serverInstance),
    (error) => logError("Request failed", error),
    (response) => {
      if (response.status === 101) return response;
      return applyCorsHeaders(response);
    }
  ),
});

console.log(`${APP_NAME} ready on http://localhost:${server.port}`);
