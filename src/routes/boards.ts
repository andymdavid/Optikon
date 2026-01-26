import { existsSync } from "fs";
import { copyFile } from "fs/promises";
import { isAbsolute, join, normalize, relative, sep } from "path";

import { nip19 } from "nostr-tools";

import { UPLOADS_DIR, UPLOADS_PUBLIC_PATH } from "../config";
import { jsonResponse, safeJson } from "../http";
import { buildUploadFilename, deleteBoardAttachments, storeAttachment } from "../services/attachments";
import {
  canComment,
  canEditBoard,
  canViewBoard,
  isBoardOwner,
  normalizeBoardRole,
  resolveBoardRole,
} from "../services/boardAccess";
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
  fetchBoardAttachments,
  fetchBoardMember,
  fetchBoardMembers,
  fetchRenouncedBoardIds,
  isBoardRenouncedRecord,
  deleteBoardMemberRecord,
  upsertBoardMemberRecord,
  recordBoardRenouncement,
  touchBoardLastAccessedAtRecord,
  touchBoardUpdatedAtRecord,
  updateBoardTitleRecord,
  updateBoardStarredRecord,
  updateBoardDefaultRoleRecord,
  updateBoardDescriptionRecord,
  updateBoardPrivacyRecord,
  deleteBoardRecord,
  unarchiveBoardRecord,
  updateBoardElementRecord,
} from "../services/boards";

import type { Board } from "../services/boards";
import type { BoardElement as SharedBoardElement } from "../shared/boardElements";
import type { Session } from "../types";

type OnlineUser = {
  pubkey: string;
  npub: string;
};

function isBoardRenouncedForSession(board: Board, session: Session | null) {
  if (!session?.pubkey) return false;
  if (isBoardOwner(board, session)) return false;
  return isBoardRenouncedRecord(board.id, session.pubkey);
}

export async function handleBoardCreate(req: Request, session: Session | null) {
  if (!session) {
    return jsonResponse({ message: "Unauthorized." }, 401);
  }
  const body = (await safeJson(req)) as {
    title?: string;
    description?: string;
    isPrivate?: boolean;
  } | null;
  const owner = session ? { pubkey: session.pubkey, npub: session.npub } : null;
  const isPrivate = body?.isPrivate === true ? 1 : 0;
  const board = createBoardRecord(body?.title ?? null, body?.description ?? null, owner, "editor", isPrivate);
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
  return jsonResponse({
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
    isPrivate: board.is_private,
  });
}

export function handleBoardShowWithSession(boardId: number, session: Session | null) {
  const board = fetchBoardById(boardId);
  if (!board) {
    return jsonResponse({ message: "Board not found." }, 404);
  }
  if (board.archived_at) {
    return jsonResponse({ message: "Board archived." }, 404);
  }
  if (isBoardRenouncedForSession(board, session)) {
    return jsonResponse({ message: "Forbidden." }, 403);
  }
  if (!canViewBoard(board, session)) {
    return jsonResponse({ message: "Forbidden." }, 403);
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
    isPrivate: touched.is_private,
  });
}

export function handleBoardLeave(boardId: number, session: Session | null) {
  if (!session?.pubkey) {
    return jsonResponse({ message: "Unauthorized." }, 401);
  }
  const board = fetchBoardById(boardId);
  if (!board) {
    return jsonResponse({ message: "Board not found." }, 404);
  }
  if (isBoardOwner(board, session)) {
    return jsonResponse({ message: "Owners cannot leave their own boards." }, 403);
  }
  if (!canViewBoard(board, session)) {
    return jsonResponse({ message: "Forbidden." }, 403);
  }
  recordBoardRenouncement(boardId, session.pubkey);
  return jsonResponse({ ok: true });
}

export function handleBoardsList(
  url: URL,
  onlineUsersByBoard?: Record<string, OnlineUser[]>,
  session?: Session | null
) {
  const includeArchived = url.searchParams.get("archived") === "1";
  const boards = fetchBoards(includeArchived);
  const renouncedIds = session?.pubkey
    ? new Set(fetchRenouncedBoardIds(session.pubkey).map((id) => String(id)))
    : null;
  const summaries = boards
    .filter((board) => canViewBoard(board, session ?? null))
    .filter(
      (board) =>
        !renouncedIds ||
        isBoardOwner(board, session ?? null) ||
        !renouncedIds.has(String(board.id))
    )
    .map((board) => ({
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
    isPrivate: board.is_private,
    onlineUsers: onlineUsersByBoard?.[String(board.id)] ?? [],
  }));
  return jsonResponse({ boards: summaries });
}

export function handleBoardsPresence(
  onlineUsersByBoard?: Record<string, OnlineUser[]>,
  session?: Session | null
) {
  if (!onlineUsersByBoard) return jsonResponse({ onlineUsersByBoard: {} });
  const boards = fetchBoards(true);
  const renouncedIds = session?.pubkey
    ? new Set(fetchRenouncedBoardIds(session.pubkey).map((id) => String(id)))
    : null;
  const visible = new Set(
    boards
      .filter((board) => canViewBoard(board, session ?? null))
      .filter(
        (board) =>
          !renouncedIds ||
          isBoardOwner(board, session ?? null) ||
          !renouncedIds.has(String(board.id))
      )
      .map((board) => String(board.id))
  );
  const filtered: Record<string, OnlineUser[]> = {};
  Object.entries(onlineUsersByBoard).forEach(([boardId, users]) => {
    if (!visible.has(boardId)) return;
    filtered[boardId] = users;
  });
  return jsonResponse({ onlineUsersByBoard: filtered });
}

function normalizeMemberPubkey(payload: { pubkey?: unknown; npub?: unknown }) {
  if (typeof payload.pubkey === "string" && payload.pubkey.trim()) {
    return payload.pubkey.trim();
  }
  if (typeof payload.npub === "string" && payload.npub.trim()) {
    try {
      const decoded = nip19.decode(payload.npub.trim());
      if (decoded.type === "npub") return decoded.data as string;
    } catch (_error) {
      return null;
    }
  }
  return null;
}

export function handleBoardMembersList(boardId: number, session: Session | null) {
  if (!session?.pubkey) {
    return jsonResponse({ message: "Unauthorized." }, 401);
  }
  const board = fetchBoardById(boardId);
  if (!board) {
    return jsonResponse({ message: "Board not found." }, 404);
  }
  if (!isBoardOwner(board, session)) {
    return jsonResponse({ message: "Forbidden." }, 403);
  }
  const members = fetchBoardMembers(boardId).map((member) => ({
    pubkey: member.pubkey,
    npub: nip19.npubEncode(member.pubkey),
    role: normalizeBoardRole(member.role),
    createdAt: member.created_at,
  }));
  return jsonResponse({ members });
}

export async function handleBoardMembersCreate(req: Request, boardId: number, session: Session | null) {
  if (!session?.pubkey) {
    return jsonResponse({ message: "Unauthorized." }, 401);
  }
  const board = fetchBoardById(boardId);
  if (!board) {
    return jsonResponse({ message: "Board not found." }, 404);
  }
  if (!isBoardOwner(board, session)) {
    return jsonResponse({ message: "Forbidden." }, 403);
  }
  const body = (await safeJson(req)) as { pubkey?: string; npub?: string; role?: string } | null;
  if (!body) {
    return jsonResponse({ message: "Invalid payload." }, 400);
  }
  const pubkey = normalizeMemberPubkey(body);
  if (!pubkey) {
    return jsonResponse({ message: "Invalid pubkey." }, 400);
  }
  const role = normalizeBoardRole(body.role ?? "viewer");
  if (board.owner_pubkey && pubkey === board.owner_pubkey) {
    return jsonResponse({ message: "Owner already has full access." }, 400);
  }
  const member = upsertBoardMemberRecord(boardId, pubkey, role);
  if (!member) {
    return jsonResponse({ message: "Unable to add member." }, 500);
  }
  return jsonResponse({
    member: {
      pubkey: member.pubkey,
      npub: nip19.npubEncode(member.pubkey),
      role: normalizeBoardRole(member.role),
      createdAt: member.created_at,
    },
  }, 201);
}

export function handleBoardMembersDelete(boardId: number, pubkeyParam: string, session: Session | null) {
  if (!session?.pubkey) {
    return jsonResponse({ message: "Unauthorized." }, 401);
  }
  const board = fetchBoardById(boardId);
  if (!board) {
    return jsonResponse({ message: "Board not found." }, 404);
  }
  if (!isBoardOwner(board, session)) {
    return jsonResponse({ message: "Forbidden." }, 403);
  }
  const pubkey = normalizeMemberPubkey({ pubkey: pubkeyParam, npub: pubkeyParam });
  if (!pubkey) {
    return jsonResponse({ message: "Invalid pubkey." }, 400);
  }
  const existing = fetchBoardMember(boardId, pubkey);
  if (!existing) {
    return jsonResponse({ ok: true });
  }
  deleteBoardMemberRecord(boardId, pubkey);
  return jsonResponse({ ok: true });
}

export async function handleBoardUpdate(req: Request, boardId: number, session: Session | null) {
  const board = fetchBoardById(boardId);
  if (!board) {
    return jsonResponse({ message: "Board not found." }, 404);
  }
  if (board.archived_at) {
    return jsonResponse({ message: "Board archived." }, 404);
  }
  if (isBoardRenouncedForSession(board, session)) {
    return jsonResponse({ message: "Forbidden." }, 403);
  }
  if (!canViewBoard(board, session)) {
    return jsonResponse({ message: "Forbidden." }, 403);
  }
  const role = resolveBoardRole(board, session);
  if (!canEditBoard(role)) {
    return jsonResponse({ message: "Forbidden." }, 403);
  }
  const body = (await safeJson(req)) as {
    title?: string;
    description?: string | null;
    defaultRole?: string;
    isPrivate?: boolean;
  } | null;
  const hasTitle = typeof body?.title !== "undefined";
  const hasDefaultRole = typeof body?.defaultRole !== "undefined";
  const hasDescription = typeof body?.description !== "undefined";
  const hasPrivate = typeof body?.isPrivate !== "undefined";
  if (!hasTitle && !hasDefaultRole && !hasDescription && !hasPrivate) {
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
  if (hasPrivate) {
    if (!isBoardOwner(board, session)) {
      return jsonResponse({ message: "Forbidden." }, 403);
    }
    const next = updateBoardPrivacyRecord(boardId, body?.isPrivate === true ? 1 : 0);
    if (!next) {
      return jsonResponse({ message: "Unable to update board privacy." }, 500);
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
    isPrivate: updated.is_private,
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
  if (isBoardRenouncedForSession(board, session)) {
    return jsonResponse({ message: "Forbidden." }, 403);
  }
  if (!canViewBoard(board, session)) {
    return jsonResponse({ message: "Forbidden." }, 403);
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
    isPrivate: updated.is_private,
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
  if (isBoardRenouncedForSession(board, session)) {
    return jsonResponse({ message: "Forbidden." }, 403);
  }
  if (!canViewBoard(board, session)) {
    return jsonResponse({ message: "Forbidden." }, 403);
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
  if (isBoardRenouncedForSession(board, session)) {
    return jsonResponse({ message: "Forbidden." }, 403);
  }
  if (!canViewBoard(board, session)) {
    return jsonResponse({ message: "Forbidden." }, 403);
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

export async function handleBoardDelete(boardId: number, session: Session | null) {
  const board = fetchBoardById(boardId);
  if (!board) {
    return jsonResponse({ message: "Board not found." }, 404);
  }
  if (isBoardRenouncedForSession(board, session)) {
    return jsonResponse({ message: "Forbidden." }, 403);
  }
  if (!canViewBoard(board, session)) {
    return jsonResponse({ message: "Forbidden." }, 403);
  }
  if (!isBoardOwner(board, session)) {
    return jsonResponse({ message: "Only the board owner can delete." }, 403);
  }
  await deleteBoardAttachments(boardId);
  const deleted = deleteBoardRecord(boardId);
  if (!deleted) {
    return jsonResponse({ message: "Unable to delete board." }, 500);
  }
  return jsonResponse({ ok: true });
}

export function handleBoardDuplicate(boardId: number, session: Session | null) {
  if (!session) {
    return jsonResponse({ message: "Unauthorized." }, 401);
  }
  const board = fetchBoardById(boardId);
  if (!board) {
    return jsonResponse({ message: "Board not found." }, 404);
  }
  if (board.archived_at) {
    return jsonResponse({ message: "Board archived." }, 404);
  }
  if (isBoardRenouncedForSession(board, session)) {
    return jsonResponse({ message: "Forbidden." }, 403);
  }
  if (!canViewBoard(board, session)) {
    return jsonResponse({ message: "Forbidden." }, 403);
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
    board.default_role,
    board.is_private
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

export function handleBoardElements(boardId: number, session: Session | null) {
  const board = fetchBoardById(boardId);
  if (!board) {
    return jsonResponse({ message: "Board not found." }, 404);
  }
  if (board.archived_at) {
    return jsonResponse({ message: "Board archived." }, 404);
  }
  if (isBoardRenouncedForSession(board, session)) {
    return jsonResponse({ message: "Forbidden." }, 403);
  }
  if (!canViewBoard(board, session)) {
    return jsonResponse({ message: "Forbidden." }, 403);
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

export function handleBoardExport(boardId: number, session: Session | null) {
  const board = fetchBoardById(boardId);
  if (!board) {
    return jsonResponse({ message: "Board not found." }, 404);
  }
  if (board.archived_at) {
    return jsonResponse({ message: "Board archived." }, 404);
  }
  if (isBoardRenouncedForSession(board, session)) {
    return jsonResponse({ message: "Forbidden." }, 403);
  }
  if (!canViewBoard(board, session)) {
    return jsonResponse({ message: "Forbidden." }, 403);
  }
  const role = resolveBoardRole(board, session);
  if (!canEditBoard(role)) {
    return jsonResponse({ message: "Forbidden." }, 403);
  }
  const rows = fetchBoardElements(boardId);
  const elements = rows
    .map((row) => parseStoredElement(row.props_json))
    .filter((element): element is SharedBoardElement => !!element);
  const attachments = fetchBoardAttachments(boardId).map((attachment) => {
    let relativePath: string | null = null;
    if (attachment.public_url?.startsWith(`${UPLOADS_PUBLIC_PATH}/`)) {
      relativePath = attachment.public_url.slice(UPLOADS_PUBLIC_PATH.length + 1);
    } else if (attachment.storage_path) {
      const candidate = normalize(relative(UPLOADS_DIR, attachment.storage_path));
      if (candidate && !candidate.split(sep).includes("..")) {
        relativePath = candidate;
      }
    }
    return {
      id: attachment.id,
      originalFilename: attachment.original_filename,
      mimeType: attachment.mime_type,
      size: attachment.size,
      publicUrl: attachment.public_url,
      relativePath,
      createdAt: attachment.created_at,
    };
  });

  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    board: {
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
      isPrivate: board.is_private,
    },
    elements,
    attachments,
  };

  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="optikon-board-${board.id}.json"`,
    },
  });
}

function resolveUploadSource(relativePath: string) {
  if (!relativePath || typeof relativePath !== "string") return null;
  if (isAbsolute(relativePath)) return null;
  const normalized = normalize(relativePath);
  if (!normalized || normalized.split(sep).includes("..")) return null;
  return join(UPLOADS_DIR, normalized);
}

export async function handleBoardImport(req: Request, session: Session | null) {
  if (!session) {
    return jsonResponse({ message: "Unauthorized." }, 401);
  }
  const body = (await safeJson(req)) as {
    board?: {
      title?: string;
      description?: string | null;
      defaultRole?: string;
      isPrivate?: boolean;
    };
    elements?: SharedBoardElement[];
    attachments?: Array<{
      id?: string;
      originalFilename?: string;
      mimeType?: string;
      size?: number;
      publicUrl?: string;
      relativePath?: string | null;
    }>;
  } | null;

  if (!body || typeof body !== "object") {
    return jsonResponse({ message: "Invalid import payload." }, 400);
  }

  const baseTitle =
    typeof body.board?.title === "string" && body.board.title.trim()
      ? body.board.title.trim()
      : "Untitled Board";
  const title = `Imported - ${baseTitle}`;
  const description =
    typeof body.board?.description === "string" && body.board.description.trim()
      ? body.board.description.trim()
      : null;
  let defaultRole = "editor";
  if (typeof body.board?.defaultRole === "string") {
    const normalized = normalizeBoardRole(body.board.defaultRole);
    defaultRole = normalized === body.board.defaultRole ? normalized : "editor";
  }
  const isPrivate = session && body.board?.isPrivate === true ? 1 : 0;
  const owner = session ? { pubkey: session.pubkey, npub: session.npub } : null;

  const board = createBoardRecord(title, description, owner, defaultRole, isPrivate);
  if (!board) {
    return jsonResponse({ message: "Unable to import board." }, 500);
  }

  const attachmentIdMap = new Map<string, { id: string; url: string }>();
  const attachmentUrlMap = new Map<string, { id: string; url: string }>();
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];
  for (const attachment of attachments) {
    if (!attachment) continue;
    const originalFilename = attachment.originalFilename ?? "attachment";
    const mimeType = attachment.mimeType ?? "application/octet-stream";
    const relativePath = attachment.relativePath ?? null;
    if (!relativePath) continue;
    const sourcePath = resolveUploadSource(relativePath);
    if (!sourcePath || !existsSync(sourcePath)) continue;
    const id = crypto.randomUUID();
    const filename = buildUploadFilename(id, originalFilename, mimeType);
    const stored = storeAttachment({
      id,
      boardId: board.id,
      ownerPubkey: session?.pubkey ?? null,
      originalFilename,
      mimeType,
      size: attachment.size ?? 0,
      relativePath: filename,
    });
    if (!stored) continue;
    try {
      await copyFile(sourcePath, stored.storage_path);
    } catch (error) {
      console.error("Failed to copy attachment file", error);
      continue;
    }
    if (attachment.id) {
      attachmentIdMap.set(attachment.id, { id: stored.id, url: stored.public_url });
    }
    if (attachment.publicUrl) {
      attachmentUrlMap.set(attachment.publicUrl, { id: stored.id, url: stored.public_url });
    }
  }

  const allowedElementTypes: Array<SharedBoardElement["type"]> = [
    "sticky",
    "text",
    "rect",
    "frame",
    "comment",
    "ellipse",
    "roundRect",
    "diamond",
    "speechBubble",
    "image",
    "line",
    "freeDraw",
  ];
  const isAllowedType = (value: unknown): value is SharedBoardElement["type"] =>
    typeof value === "string" && allowedElementTypes.includes(value as SharedBoardElement["type"]);

  const elements = Array.isArray(body.elements) ? body.elements : [];
  const idMap = new Map<string, string>();
  const stagedElements: SharedBoardElement[] = [];
  for (const element of elements) {
    if (!element || typeof element !== "object") continue;
    if (typeof element.id !== "string" || !element.id.trim()) continue;
    if (!isAllowedType(element.type)) continue;
    const newId = crypto.randomUUID();
    idMap.set(element.id, newId);
    stagedElements.push(element);
  }

  const normalizedElements: SharedBoardElement[] = stagedElements.map((element) => {
    const next = { ...element, id: idMap.get(element.id) ?? element.id } as SharedBoardElement;
    if (next.type === "comment") {
      const comment = next as SharedBoardElement & { elementId?: string };
      if (comment.elementId && idMap.has(comment.elementId)) {
        comment.elementId = idMap.get(comment.elementId);
      }
    }
    if (next.type === "line") {
      const line = next as SharedBoardElement & {
        startBinding?: { elementId: string; anchor: string };
        endBinding?: { elementId: string; anchor: string };
      };
      if (line.startBinding?.elementId && idMap.has(line.startBinding.elementId)) {
        line.startBinding = {
          ...line.startBinding,
          elementId: idMap.get(line.startBinding.elementId) ?? line.startBinding.elementId,
        };
      }
      if (line.endBinding?.elementId && idMap.has(line.endBinding.elementId)) {
        line.endBinding = {
          ...line.endBinding,
          elementId: idMap.get(line.endBinding.elementId) ?? line.endBinding.elementId,
        };
      }
    }
    if (next.type === "image") {
      const image = next as SharedBoardElement & { attachmentId?: string; url?: string };
      if (image.attachmentId && attachmentIdMap.has(image.attachmentId)) {
        const mapped = attachmentIdMap.get(image.attachmentId);
        if (mapped) {
          image.attachmentId = mapped.id;
          image.url = mapped.url;
        }
      } else if (image.url && attachmentUrlMap.has(image.url)) {
        const mapped = attachmentUrlMap.get(image.url);
        if (mapped) {
          image.attachmentId = mapped.id;
          image.url = mapped.url;
        }
      }
    }
    return next;
  });

  if (normalizedElements.length > 0) {
    createBoardElementsBatchRecord(board.id, normalizedElements);
  }

  return jsonResponse({ id: board.id, title: board.title }, 201);
}

export async function handleBoardElementCreate(req: Request, boardId: number, session: Session | null) {
  const board = fetchBoardById(boardId);
  if (!board) {
    return jsonResponse({ message: "Board not found." }, 404);
  }
  if (board.archived_at) {
    return jsonResponse({ message: "Board archived." }, 404);
  }
  if (isBoardRenouncedForSession(board, session)) {
    return jsonResponse({ message: "Forbidden." }, 403);
  }
  if (!canViewBoard(board, session)) {
    return jsonResponse({ message: "Forbidden." }, 403);
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
    "speechBubble",
    "image",
    "freeDraw",
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
  const requiresCoordinates = element.type !== "line" && element.type !== "freeDraw";
  if (requiresCoordinates) {
    if (typeof (element as { x?: unknown }).x !== "number" || typeof (element as { y?: unknown }).y !== "number") {
      return logAndReject("missing coordinates");
    }
  }
  if (element.type === "freeDraw") {
    const points = (element as { points?: unknown }).points;
    if (!Array.isArray(points) || points.length === 0) {
      return logAndReject("missing free draw points");
    }
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
  if (isBoardRenouncedForSession(board, session)) {
    return jsonResponse({ message: "Forbidden." }, 403);
  }
  if (!canViewBoard(board, session)) {
    return jsonResponse({ message: "Forbidden." }, 403);
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
  if (isBoardRenouncedForSession(board, session)) {
    return jsonResponse({ message: "Forbidden." }, 403);
  }
  if (!canViewBoard(board, session)) {
    return jsonResponse({ message: "Forbidden." }, 403);
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
  if (isBoardRenouncedForSession(board, session)) {
    return jsonResponse({ message: "Forbidden." }, 403);
  }
  if (!canViewBoard(board, session)) {
    return jsonResponse({ message: "Forbidden." }, 403);
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
