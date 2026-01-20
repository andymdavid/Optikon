import { jsonResponse, safeJson } from "../http";
import { canComment, canEditBoard, normalizeBoardRole, resolveBoardRole } from "../services/boardAccess";
import {
  archiveBoardRecord,
  createBoardElementRecord,
  createBoardElementsBatchRecord,
  createBoardRecord,
  createBoardCopyRecord,
  deleteBoardElementsRecord,
  fetchBoards,
  fetchBoardById,
  fetchBoardElement,
  fetchBoardElements,
  touchBoardLastAccessedAtRecord,
  touchBoardUpdatedAtRecord,
  updateBoardTitleRecord,
  updateBoardStarredRecord,
  updateBoardDefaultRoleRecord,
  updateBoardDescriptionRecord,
  deleteBoardRecord,
  unarchiveBoardRecord,
  updateBoardElementRecord,
} from "../services/boards";

import type { BoardElement as SharedBoardElement } from "../shared/boardElements";
import type { Session } from "../types";

type OnlineUser = {
  pubkey: string;
  npub: string;
};

export async function handleBoardCreate(req: Request, session: Session | null) {
  const body = (await safeJson(req)) as { title?: string; description?: string } | null;
  const owner = session ? { pubkey: session.pubkey, npub: session.npub } : null;
  const board = createBoardRecord(body?.title ?? null, body?.description ?? null, owner);
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
  if (board.archived_at) {
    return jsonResponse({ message: "Board archived." }, 404);
  }
  const touched = touchBoardLastAccessedAtRecord(boardId) ?? board;
  return jsonResponse({
    id: touched.id,
    title: touched.title,
    description: touched.description,
    createdAt: touched.created_at,
    updatedAt: touched.updated_at,
    lastAccessedAt: touched.last_accessed_at,
    starred: touched.starred,
    ownerPubkey: touched.owner_pubkey,
    ownerNpub: touched.owner_npub,
    defaultRole: touched.default_role,
  });
}

export function handleBoardsList(url: URL, onlineUsersByBoard?: Record<string, OnlineUser[]>) {
  const includeArchived = url.searchParams.get("archived") === "1";
  const boards = fetchBoards(includeArchived);
  const summaries = boards.map((board) => ({
    id: board.id,
    title: board.title,
    description: board.description,
    createdAt: board.created_at,
    updatedAt: board.updated_at,
    lastAccessedAt: board.last_accessed_at,
    starred: board.starred,
    ownerPubkey: board.owner_pubkey,
    ownerNpub: board.owner_npub,
    defaultRole: board.default_role,
    onlineUsers: onlineUsersByBoard?.[String(board.id)] ?? [],
  }));
  return jsonResponse({ boards: summaries });
}

export function handleBoardsPresence(onlineUsersByBoard?: Record<string, OnlineUser[]>) {
  return jsonResponse({ onlineUsersByBoard: onlineUsersByBoard ?? {} });
}

export async function handleBoardUpdate(req: Request, boardId: number, session: Session | null) {
  const board = fetchBoardById(boardId);
  if (!board) {
    return jsonResponse({ message: "Board not found." }, 404);
  }
  if (board.archived_at) {
    return jsonResponse({ message: "Board archived." }, 404);
  }
  const role = resolveBoardRole(board, session);
  if (!canEditBoard(role)) {
    return jsonResponse({ message: "Forbidden." }, 403);
  }
  const body = (await safeJson(req)) as {
    title?: string;
    description?: string | null;
    defaultRole?: string;
  } | null;
  const hasTitle = typeof body?.title !== "undefined";
  const hasDefaultRole = typeof body?.defaultRole !== "undefined";
  const hasDescription = typeof body?.description !== "undefined";
  if (!hasTitle && !hasDefaultRole && !hasDescription) {
    return jsonResponse({ message: "No updates provided." }, 400);
  }
  let updated = board;
  if (hasTitle) {
    const nextTitle = typeof body?.title === "string" ? body.title.trim() : "";
    if (!nextTitle) {
      return jsonResponse({ message: "Title is required." }, 400);
    }
    const next = updateBoardTitleRecord(boardId, nextTitle);
    if (!next) {
      return jsonResponse({ message: "Unable to update board." }, 500);
    }
    updated = next;
  }
  if (hasDescription) {
    const normalizedDescription =
      typeof body?.description === "string" && body.description.trim().length > 0
        ? body.description.trim()
        : null;
    const next = updateBoardDescriptionRecord(boardId, normalizedDescription);
    if (!next) {
      return jsonResponse({ message: "Unable to update board description." }, 500);
    }
    updated = next;
  }
  if (hasDefaultRole) {
    if (typeof body?.defaultRole !== "string") {
      return jsonResponse({ message: "Invalid default role." }, 400);
    }
    const normalizedRole = normalizeBoardRole(body.defaultRole);
    if (normalizedRole !== body.defaultRole) {
      return jsonResponse({ message: "Invalid default role." }, 400);
    }
    const next = updateBoardDefaultRoleRecord(boardId, normalizedRole);
    if (!next) {
      return jsonResponse({ message: "Unable to update board access." }, 500);
    }
    updated = next;
  }
  return jsonResponse({
    id: updated.id,
    title: updated.title,
    description: updated.description,
    createdAt: updated.created_at,
    updatedAt: updated.updated_at,
    lastAccessedAt: updated.last_accessed_at,
    starred: updated.starred,
    ownerPubkey: updated.owner_pubkey,
    ownerNpub: updated.owner_npub,
    defaultRole: updated.default_role,
  });
}

export async function handleBoardStar(req: Request, boardId: number, session: Session | null) {
  const board = fetchBoardById(boardId);
  if (!board) {
    return jsonResponse({ message: "Board not found." }, 404);
  }
  if (board.archived_at) {
    return jsonResponse({ message: "Board archived." }, 404);
  }
  const role = resolveBoardRole(board, session);
  if (!canEditBoard(role)) {
    return jsonResponse({ message: "Forbidden." }, 403);
  }
  const body = (await safeJson(req)) as { starred?: boolean } | null;
  const starred = body?.starred === true ? 1 : 0;
  const updated = updateBoardStarredRecord(boardId, starred);
  if (!updated) {
    return jsonResponse({ message: "Unable to update board." }, 500);
  }
  return jsonResponse({
    id: updated.id,
    title: updated.title,
    createdAt: updated.created_at,
    updatedAt: updated.updated_at,
    lastAccessedAt: updated.last_accessed_at,
    starred: updated.starred,
    ownerPubkey: updated.owner_pubkey,
    ownerNpub: updated.owner_npub,
    description: updated.description,
    defaultRole: updated.default_role,
  });
}

export function handleBoardArchive(boardId: number, session: Session | null) {
  const board = fetchBoardById(boardId);
  if (!board) {
    return jsonResponse({ message: "Board not found." }, 404);
  }
  if (board.archived_at) {
    return jsonResponse({ message: "Board archived." }, 404);
  }
  const role = resolveBoardRole(board, session);
  if (!canEditBoard(role)) {
    return jsonResponse({ message: "Forbidden." }, 403);
  }
  const updated = archiveBoardRecord(boardId);
  if (!updated) {
    return jsonResponse({ message: "Unable to archive board." }, 500);
  }
  return jsonResponse({ ok: true });
}

export function handleBoardUnarchive(boardId: number, session: Session | null) {
  const board = fetchBoardById(boardId);
  if (!board) {
    return jsonResponse({ message: "Board not found." }, 404);
  }
  const role = resolveBoardRole(board, session);
  if (!canEditBoard(role)) {
    return jsonResponse({ message: "Forbidden." }, 403);
  }
  const updated = unarchiveBoardRecord(boardId);
  if (!updated) {
    return jsonResponse({ message: "Unable to unarchive board." }, 500);
  }
  return jsonResponse({ ok: true });
}

export function handleBoardDelete(boardId: number, session: Session | null) {
  const board = fetchBoardById(boardId);
  if (!board) {
    return jsonResponse({ message: "Board not found." }, 404);
  }
  const role = resolveBoardRole(board, session);
  if (!canEditBoard(role)) {
    return jsonResponse({ message: "Forbidden." }, 403);
  }
  const deleted = deleteBoardRecord(boardId);
  if (!deleted) {
    return jsonResponse({ message: "Unable to delete board." }, 500);
  }
  return jsonResponse({ ok: true });
}

export function handleBoardDuplicate(boardId: number, session: Session | null) {
  const board = fetchBoardById(boardId);
  if (!board) {
    return jsonResponse({ message: "Board not found." }, 404);
  }
  if (board.archived_at) {
    return jsonResponse({ message: "Board archived." }, 404);
  }
  const role = resolveBoardRole(board, session);
  if (!canEditBoard(role)) {
    return jsonResponse({ message: "Forbidden." }, 403);
  }
  const owner = session ? { pubkey: session.pubkey, npub: session.npub } : null;
  const newBoard = createBoardCopyRecord(
    `Copy of ${board.title}`,
    board.description ?? null,
    owner,
    board.default_role
  );
  if (!newBoard) {
    return jsonResponse({ message: "Unable to duplicate board." }, 500);
  }
  const elements = fetchBoardElements(boardId);
  for (const element of elements) {
    try {
      const parsed = JSON.parse(element.props_json) as SharedBoardElement;
      if (!parsed || typeof parsed.id !== "string") continue;
      const newId = crypto.randomUUID();
      const next = { ...parsed, id: newId };
      createBoardElementRecord(newBoard.id, next);
    } catch (error) {
      console.error("Failed to duplicate element", error);
    }
  }
  touchBoardUpdatedAtRecord(newBoard.id);
  return jsonResponse({ id: newBoard.id, title: newBoard.title }, 201);
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
  if (board.archived_at) {
    return jsonResponse({ message: "Board archived." }, 404);
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

export async function handleBoardElementCreate(req: Request, boardId: number, session: Session | null) {
  const board = fetchBoardById(boardId);
  if (!board) {
    return jsonResponse({ message: "Board not found." }, 404);
  }
  if (board.archived_at) {
    return jsonResponse({ message: "Board archived." }, 404);
  }
  const role = resolveBoardRole(board, session);
  const canEdit = canEditBoard(role);
  const canCommentOnly = !canEdit && canComment(role);
  if (!canEdit && !canCommentOnly) {
    return jsonResponse({ message: "Forbidden." }, 403);
  }
  const body = (await safeJson(req)) as { element?: SharedBoardElement } | null;
  const allowedElementTypes: Array<SharedBoardElement["type"]> = [
    "sticky",
    "text",
    "rect",
    "frame",
    "comment",
    "ellipse",
    "roundRect",
    "diamond",
    "triangle",
    "speechBubble",
    "image",
  ];
  const isAllowedType = (value: unknown): value is SharedBoardElement["type"] =>
    typeof value === "string" && allowedElementTypes.includes(value as SharedBoardElement["type"]);

  const element = body?.element ?? null;
  const logAndReject = (reason: string) => {
    const receivedType = body?.element?.type ?? (body as { type?: string } | null)?.type ?? null;
    console.warn(`[boards] invalid element payload: ${reason}`, body);
    return jsonResponse(
      {
        message: "Invalid element payload.",
        receivedKeys: body ? Object.keys(body) : [],
        receivedType,
      },
      400
    );
  };

  if (!element || typeof element !== "object") {
    return logAndReject("missing element");
  }
  if (typeof element.id !== "string" || !element.id.trim()) {
    return logAndReject("missing id");
  }
  if (!isAllowedType(element.type)) {
    return logAndReject("unsupported type");
  }
  if (canCommentOnly && element.type !== "comment") {
    return jsonResponse({ message: "Forbidden." }, 403);
  }
  if (typeof (element as { x?: unknown }).x !== "number" || typeof (element as { y?: unknown }).y !== "number") {
    return logAndReject("missing coordinates");
  }
  if (element.type === "comment" && typeof (element as { text?: unknown }).text !== "string") {
    return logAndReject("missing comment text");
  }

  const elementRecord = createBoardElementRecord(boardId, element);
  if (!elementRecord) {
    return jsonResponse({ message: "Unable to create element." }, 500);
  }

  return jsonResponse({ ok: true, id: elementRecord.id }, 201);
}

export async function handleBoardElementUpdate(req: Request, boardId: number, elementId: string, session: Session | null) {
  const board = fetchBoardById(boardId);
  if (!board) {
    return jsonResponse({ message: "Board not found." }, 404);
  }
  if (board.archived_at) {
    return jsonResponse({ message: "Board archived." }, 404);
  }
  const role = resolveBoardRole(board, session);
  const canEdit = canEditBoard(role);
  const canCommentOnly = !canEdit && canComment(role);
  if (!canEdit && !canCommentOnly) {
    return jsonResponse({ message: "Forbidden." }, 403);
  }
  const elementIdString = String(elementId);
  const body = (await safeJson(req)) as { element?: SharedBoardElement | null } | null;
  if (!body?.element) {
    return jsonResponse({ message: "Invalid element payload." }, 400);
  }
  const resolvedId = typeof body.element.id === "string" && body.element.id.trim() ? body.element.id : elementIdString;
  const payload = { ...body.element, id: resolvedId } as SharedBoardElement;
  if (canCommentOnly && payload.type !== "comment") {
    return jsonResponse({ message: "Forbidden." }, 403);
  }
  const existing = fetchBoardElement(boardId, payload.id);
  if (!existing) {
    const created = createBoardElementRecord(boardId, payload);
    if (!created) {
      return jsonResponse({ message: "Unable to upsert element." }, 500);
    }
    return jsonResponse({ ok: true });
  }
  if (canCommentOnly && existing.type !== "comment") {
    return jsonResponse({ message: "Forbidden." }, 403);
  }

  const updated = updateBoardElementRecord(boardId, payload.id, payload);
  if (!updated) {
    return jsonResponse({ message: "Unable to update element." }, 500);
  }

  return jsonResponse({ ok: true });
}

export async function handleBoardElementsDelete(req: Request, boardId: number, session: Session | null) {
  const board = fetchBoardById(boardId);
  if (!board) {
    return jsonResponse({ message: "Board not found." }, 404);
  }
  if (board.archived_at) {
    return jsonResponse({ message: "Board archived." }, 404);
  }
  const role = resolveBoardRole(board, session);
  const canEdit = canEditBoard(role);
  const canCommentOnly = !canEdit && canComment(role);
  const body = (await safeJson(req)) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids)
    ? body.ids.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  if (ids.length === 0) {
    return jsonResponse({ message: "No valid ids provided." }, 400);
  }
  if (canCommentOnly) {
    for (const id of ids) {
      const existing = fetchBoardElement(boardId, id);
      if (!existing || existing.type !== "comment") {
        return jsonResponse({ message: "Forbidden." }, 403);
      }
    }
  } else if (!canEdit) {
    return jsonResponse({ message: "Forbidden." }, 403);
  }
  const deletedCount = deleteBoardElementsRecord(boardId, ids);
  return jsonResponse({ ok: true, deletedCount });
}

export async function handleBoardElementsBatchUpdate(req: Request, boardId: number, session: Session | null) {
  const board = fetchBoardById(boardId);
  if (!board) {
    return jsonResponse({ message: "Board not found." }, 404);
  }
  if (board.archived_at) {
    return jsonResponse({ message: "Board archived." }, 404);
  }
  const role = resolveBoardRole(board, session);
  const canEdit = canEditBoard(role);
  const canCommentOnly = !canEdit && canComment(role);
  const body = (await safeJson(req)) as { elements?: SharedBoardElement[] | null } | null;
  if (!Array.isArray(body?.elements) || body!.elements.length === 0) {
    return jsonResponse({ message: "No elements provided." }, 400);
  }
  if (canCommentOnly && body.elements.some((element) => element.type !== "comment")) {
    return jsonResponse({ message: "Forbidden." }, 403);
  }
  if (!canEdit && !canCommentOnly) {
    return jsonResponse({ message: "Forbidden." }, 403);
  }
  const count = createBoardElementsBatchRecord(boardId, body.elements);
  return jsonResponse({ ok: true, count });
}
