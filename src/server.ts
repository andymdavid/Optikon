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
import { withErrorHandling } from "./http";
import { logError } from "./logger";
import { handleAiTasks, handleAiTasksPost, handleLatestSummary, handleSummaryPost } from "./routes/ai";
import { createAuthHandlers } from "./routes/auth";
import { handleBoardCreate, handleBoardElementCreate, handleBoardElements, handleBoardShow } from "./routes/boards";
import { handleHome } from "./routes/home";
import { handleTodoCreate, handleTodoDelete, handleTodoState, handleTodoUpdate } from "./routes/todos";
import { AuthService } from "./services/auth";
import { serveStatic } from "./static";

import type { Session } from "./types";
import type { Server, ServerWebSocket, WebSocketHandler } from "bun";

type CanvasMessageType = "joinBoard" | "elementUpdate" | "cursorMove";

type CanvasMessageEnvelope = {
  type: CanvasMessageType;
  payload: unknown;
};

type WebSocketData = {
  session: Session | null;
};

function isCanvasMessageType(value: string): value is CanvasMessageType {
  return value === "joinBoard" || value === "elementUpdate" || value === "cursorMove";
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

function handleCanvasMessage(ws: ServerWebSocket<WebSocketData>, message: CanvasMessageEnvelope) {
  switch (message.type) {
    case "joinBoard": {
      // TODO: implement board join registration
      break;
    }
    case "elementUpdate": {
      // TODO: handle new or updated elements on the board
      break;
    }
    case "cursorMove": {
      // TODO: broadcast cursor positions to other participants
      break;
    }
  }
}

const websocketHandler: WebSocketHandler<WebSocketData> = {
  open(_ws) {
    // Placeholder for future session validation or state hydration
  },
  message(ws, data) {
    const parsed = parseCanvasMessage(data);
    if (!parsed) return;
    handleCanvasMessage(ws, parsed);
  },
  close(_ws) {
    // Placeholder for cleanup hooks when sockets disconnect
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

const { login, logout, sessionFromRequest } = createAuthHandlers(authService, SESSION_COOKIE);

function handleWebSocketUpgrade(req: Request, serverInstance: Server<WebSocketData>, session: Session | null) {
  const upgradeHeader = req.headers.get("upgrade");
  if (upgradeHeader?.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket upgrade", { status: 400 });
  }

  const upgraded = serverInstance.upgrade(req, { data: { session } });
  if (upgraded) {
    return new Response(null, { status: 101 });
  }

  return new Response("WebSocket upgrade failed", { status: 500 });
}

async function routeRequest(req: Request, serverInstance: Server<WebSocketData>) {
  const url = new URL(req.url);
  const { pathname } = url;
  const session = sessionFromRequest(req);

  if (pathname === "/ws") {
    return handleWebSocketUpgrade(req, serverInstance, session);
  }

  if (req.method === "GET") {
    const staticResponse = await serveStatic(pathname);
    if (staticResponse) return staticResponse;

    const aiTasksMatch = pathname.match(/^\/ai\/tasks\/(\d+)(?:\/(yes|no))?$/);
    if (aiTasksMatch) return handleAiTasks(url, aiTasksMatch);
    if (pathname === "/ai/summary/latest") return handleLatestSummary(url);
    const boardElementsMatch = pathname.match(/^\/boards\/(\d+)\/elements$/);
    if (boardElementsMatch) return handleBoardElements(Number(boardElementsMatch[1]));
    const boardMatch = pathname.match(/^\/boards\/(\d+)$/);
    if (boardMatch) return handleBoardShow(Number(boardMatch[1]));
    if (pathname === "/") return handleHome(url, session);
  }

  if (req.method === "POST") {
    if (pathname === "/boards") return handleBoardCreate(req);
    if (pathname === "/auth/login") return login(req);
    if (pathname === "/auth/logout") return logout(req);
    if (pathname === "/ai/summary") return handleSummaryPost(req);
    if (pathname === "/ai/tasks") return handleAiTasksPost(req);
    if (pathname === "/todos") return handleTodoCreate(req, session);
    const boardElementMatch = pathname.match(/^\/boards\/(\d+)\/elements$/);
    if (boardElementMatch) return handleBoardElementCreate(req, Number(boardElementMatch[1]));

    const updateMatch = pathname.match(/^\/todos\/(\d+)\/update$/);
    if (updateMatch) return handleTodoUpdate(req, session, Number(updateMatch[1]));

    const stateMatch = pathname.match(/^\/todos\/(\d+)\/state$/);
    if (stateMatch) return handleTodoState(req, session, Number(stateMatch[1]));

    const deleteMatch = pathname.match(/^\/todos\/(\d+)\/delete$/);
    if (deleteMatch) return handleTodoDelete(session, Number(deleteMatch[1]));
  }

  return new Response("Not found", { status: 404 });
}

const server = Bun.serve<WebSocketData>({
  port: PORT,
  websocket: websocketHandler,
  fetch: withErrorHandling(
    (req: Request, serverInstance: Server<WebSocketData>) => routeRequest(req, serverInstance),
    (error) => logError("Request failed", error)
  ),
});

console.log(`${APP_NAME} ready on http://localhost:${server.port}`);
