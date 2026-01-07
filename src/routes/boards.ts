import { jsonResponse, safeJson } from "../http";
import {
  createBoardElementRecord,
  createBoardRecord,
  fetchBoardById,
  fetchBoardElement,
  fetchBoardElements,
  updateBoardElementRecord,
} from "../services/boards";

import type { BoardElement as SharedBoardElement } from "../shared/boardElements";

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

function parseStoredElement(propsJson: string): SharedBoardElement | null {
  try {
    return JSON.parse(propsJson) as SharedBoardElement;
  } catch (error) {
    console.error("Failed to parse board element payload", error);
    return null;
  }
}

export function handleBoardElements(boardId: number) {
  const board = fetchBoardById(boardId);
  if (!board) {
    return jsonResponse({ message: "Board not found." }, 404);
  }
  const rows = fetchBoardElements(boardId);
  const elements = rows.map((row) => ({
    id: row.id,
    boardId: row.board_id,
    type: row.type,
    created_at: row.created_at,
    updated_at: row.updated_at,
    element: parseStoredElement(row.props_json),
  }));
  return jsonResponse({ elements });
}

export async function handleBoardElementCreate(req: Request, boardId: number) {
  const board = fetchBoardById(boardId);
  if (!board) {
    return jsonResponse({ message: "Board not found." }, 404);
  }

  const body = (await safeJson(req)) as { type?: string; element?: SharedBoardElement } | null;
  if (!body?.type || body.type !== "sticky" || !body.element) {
    return jsonResponse({ message: "Invalid element payload." }, 400);
  }

  const element = createBoardElementRecord(boardId, body.type, body.element);
  if (!element) {
    return jsonResponse({ message: "Unable to create element." }, 500);
  }

  return jsonResponse({ id: element.id, board_id: element.board_id, type: element.type }, 201);
}

export async function handleBoardElementUpdate(req: Request, boardId: number, elementId: number) {
  const board = fetchBoardById(boardId);
  if (!board) {
    return jsonResponse({ message: "Board not found." }, 404);
  }
  const existing = fetchBoardElement(boardId, elementId);
  if (!existing) {
    return jsonResponse({ message: "Element not found." }, 404);
  }

  const body = (await safeJson(req)) as { element?: SharedBoardElement | null } | null;
  if (!body?.element) {
    return jsonResponse({ message: "Invalid element payload." }, 400);
  }

  const updated = updateBoardElementRecord(boardId, elementId, body.element);
  if (!updated) {
    return jsonResponse({ message: "Unable to update element." }, 500);
  }

  return jsonResponse({ ok: true });
}
