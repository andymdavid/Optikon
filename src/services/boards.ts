import {
  createBoard,
  createBoardCopy,
  archiveBoard,
  deleteBoardElements,
  getBoardById,
  listBoards,
  getBoardElement,
  insertOrUpdateBoardElement,
  listBoardElements,
  unarchiveBoard,
  touchBoardLastAccessedAt,
  touchBoardUpdatedAt,
  updateBoardTitle,
  updateBoardStarred,
  updateBoardDefaultRole,
  updateBoardDescription,
  deleteBoard,
  updateBoardElement,
} from "../db";

import type { Board, BoardElement } from "../db";
import type { BoardElement as SharedBoardElement } from "../shared/boardElements";

export function createBoardRecord(
  title: string | null | undefined,
  description: string | null | undefined,
  owner: { pubkey: string; npub: string } | null,
  defaultRole: string = "editor"
) {
  const normalizedTitle = typeof title === "string" && title.trim() ? title.trim() : "Untitled Board";
  const normalizedDescription =
    typeof description === "string" && description.trim() ? description.trim() : null;
  return createBoard(normalizedTitle, normalizedDescription, owner, defaultRole);
}

export function fetchBoardById(id: number) {
  return getBoardById(id);
}

export function fetchBoards(includeArchived: boolean) {
  return listBoards(includeArchived);
}

export function updateBoardTitleRecord(boardId: number, title: string) {
  return updateBoardTitle(boardId, title);
}

export function updateBoardStarredRecord(boardId: number, starred: number) {
  return updateBoardStarred(boardId, starred);
}

export function updateBoardDefaultRoleRecord(boardId: number, defaultRole: string) {
  return updateBoardDefaultRole(boardId, defaultRole);
}

export function updateBoardDescriptionRecord(boardId: number, description: string | null) {
  return updateBoardDescription(boardId, description);
}

export function deleteBoardRecord(boardId: number) {
  return deleteBoard(boardId);
}

export function archiveBoardRecord(boardId: number) {
  return archiveBoard(boardId);
}

export function unarchiveBoardRecord(boardId: number) {
  return unarchiveBoard(boardId);
}

export function createBoardCopyRecord(
  title: string,
  description: string | null,
  owner: { pubkey: string; npub: string } | null,
  defaultRole: string = "editor"
) {
  return createBoardCopy(title, description, owner, defaultRole);
}

export function touchBoardUpdatedAtRecord(boardId: number) {
  return touchBoardUpdatedAt(boardId);
}

export function touchBoardLastAccessedAtRecord(boardId: number) {
  return touchBoardLastAccessedAt(boardId);
}

export function fetchBoardElements(boardId: number) {
  return listBoardElements(boardId);
}

export function createBoardElementRecord(boardId: number, element: SharedBoardElement) {
  const propsJson = JSON.stringify(element ?? {});
  const record = insertOrUpdateBoardElement(boardId, element.id, element.type, propsJson);
  if (record) touchBoardUpdatedAt(boardId);
  return record;
}

export function fetchBoardElement(boardId: number, elementId: string) {
  return getBoardElement(boardId, elementId);
}

export function updateBoardElementRecord(boardId: number, elementId: string, element: SharedBoardElement) {
  const propsJson = JSON.stringify(element ?? {});
  const record = updateBoardElement(boardId, elementId, propsJson);
  if (record) touchBoardUpdatedAt(boardId);
  return record;
}

export function deleteBoardElementsRecord(boardId: number, ids: string[]) {
  const removed = deleteBoardElements(boardId, ids);
  if (removed > 0) touchBoardUpdatedAt(boardId);
  return removed;
}

export function createBoardElementsBatchRecord(boardId: number, elements: SharedBoardElement[]) {
  let count = 0;
  for (const element of elements) {
    if (!element || typeof element.id !== "string") continue;
    const propsJson = JSON.stringify(element ?? {});
    const record = insertOrUpdateBoardElement(boardId, element.id, element.type, propsJson);
    if (record) count += 1;
  }
  if (count > 0) touchBoardUpdatedAt(boardId);
  return count;
}

export type { Board, BoardElement };
