import { jsonResponse, safeJson } from "../http";
import {
  createBoardElementRecord,
  createBoardRecord,
  deleteBoardElementsRecord,
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
  const allowedElementTypes: Array<SharedBoardElement["type"]> = [
    "sticky",
    "text",
    "rect",
    "ellipse",
    "roundRect",
    "diamond",
  ]
  const isAllowedType = (value: unknown): value is SharedBoardElement["type"] =>
    typeof value === "string" && allowedElementTypes.includes(value as SharedBoardElement["type"])

  if (!body?.type || !isAllowedType(body.type) || !body.element || typeof body.element.id !== "string") {
    return jsonResponse({ message: "Invalid element payload." }, 400);
  }

  if (body.element.type !== body.type) {
    return jsonResponse({ message: "Element type mismatch." }, 400);
  }

  const element = createBoardElementRecord(boardId, body.element);
  if (!element) {
    return jsonResponse({ message: "Unable to create element." }, 500);
  }

  return jsonResponse({ ok: true, id: element.id }, 201);
}

export async function handleBoardElementUpdate(req: Request, boardId: number, elementId: string) {
  const board = fetchBoardById(boardId);
  if (!board) {
    return jsonResponse({ message: "Board not found." }, 404);
  }
  const elementIdString = String(elementId);
  const body = (await safeJson(req)) as { element?: SharedBoardElement | null } | null;
  if (!body?.element) {
    return jsonResponse({ message: "Invalid element payload." }, 400);
  }
  const resolvedId = typeof body.element.id === "string" && body.element.id.trim() ? body.element.id : elementIdString;
  const payload = { ...body.element, id: resolvedId } as SharedBoardElement;
  const existing = fetchBoardElement(boardId, payload.id);
  if (!existing) {
    const created = createBoardElementRecord(boardId, payload);
    if (!created) {
      return jsonResponse({ message: "Unable to upsert element." }, 500);
    }
    return jsonResponse({ ok: true });
  }

  const updated = updateBoardElementRecord(boardId, payload.id, payload);
  if (!updated) {
    return jsonResponse({ message: "Unable to update element." }, 500);
  }

  return jsonResponse({ ok: true });
}

export async function handleBoardElementsDelete(req: Request, boardId: number) {
  const board = fetchBoardById(boardId);
  if (!board) {
    return jsonResponse({ message: "Board not found." }, 404);
  }
  const body = (await safeJson(req)) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids)
    ? body.ids.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  if (ids.length === 0) {
    return jsonResponse({ message: "No valid ids provided." }, 400);
  }
  const deletedCount = deleteBoardElementsRecord(boardId, ids);
  return jsonResponse({ ok: true, deletedCount });
}

export async function handleBoardElementsBatchUpdate(req: Request, boardId: number) {
  const board = fetchBoardById(boardId);
  if (!board) {
    return jsonResponse({ message: "Board not found." }, 404);
  }
  const body = (await safeJson(req)) as { elements?: SharedBoardElement[] | null } | null;
  if (!Array.isArray(body?.elements) || body!.elements.length === 0) {
    return jsonResponse({ message: "No elements provided." }, 400);
  }
  let count = 0;
  for (const element of body!.elements) {
    if (!element || typeof element.id !== "string") continue;
    createBoardElementRecord(boardId, element);
    count += 1;
  }
  return jsonResponse({ ok: true, count });
}
