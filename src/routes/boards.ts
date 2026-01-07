import { jsonResponse, safeJson } from "../http";
import {
  createBoardElementRecord,
  createBoardRecord,
  fetchBoardById,
  fetchBoardElements,
} from "../services/boards";

export async function handleBoardCreate(req: Request) {
  const body = (await safeJson(req)) as { title?: string } | null;
  const board = createBoardRecord(body?.title ?? null);
  if (!board) {
    return jsonResponse({ message: "Unable to create board." }, 500);
  }
  return jsonResponse(board, 201);
}

export function handleBoardShow(boardId: number) {
  const board = fetchBoardById(boardId);
  if (!board) {
    return jsonResponse({ message: "Board not found." }, 404);
  }
  return jsonResponse(board);
}

export function handleBoardElements(boardId: number) {
  const board = fetchBoardById(boardId);
  if (!board) {
    return jsonResponse({ message: "Board not found." }, 404);
  }
  const elements = fetchBoardElements(boardId);
  return jsonResponse({ elements });
}

export async function handleBoardElementCreate(req: Request, boardId: number) {
  const board = fetchBoardById(boardId);
  if (!board) {
    return jsonResponse({ message: "Board not found." }, 404);
  }

  const body = (await safeJson(req)) as { type?: string; props?: unknown } | null;
  if (!body?.type) {
    return jsonResponse({ message: "Element type is required." }, 400);
  }

  const element = createBoardElementRecord(boardId, body.type, body.props ?? {});
  if (!element) {
    return jsonResponse({ message: "Unable to create element." }, 500);
  }

  return jsonResponse(element, 201);
}
