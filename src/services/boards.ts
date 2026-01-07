import {
  createBoard,
  getBoardById,
  getBoardElement,
  insertOrUpdateBoardElement,
  listBoardElements,
  updateBoardElement,
} from "../db";

import type { Board, BoardElement } from "../db";
import type { BoardElement as SharedBoardElement } from "../shared/boardElements";

export function createBoardRecord(title: string | null | undefined) {
  const normalizedTitle = typeof title === "string" && title.trim() ? title.trim() : "Untitled Board";
  return createBoard(normalizedTitle);
}

export function fetchBoardById(id: number) {
  return getBoardById(id);
}

export function fetchBoardElements(boardId: number) {
  return listBoardElements(boardId);
}

export function createBoardElementRecord(boardId: number, element: SharedBoardElement) {
  const propsJson = JSON.stringify(element ?? {});
  return insertOrUpdateBoardElement(boardId, element.id, element.type, propsJson);
}

export function fetchBoardElement(boardId: number, elementId: string) {
  return getBoardElement(boardId, elementId);
}

export function updateBoardElementRecord(boardId: number, elementId: string, element: SharedBoardElement) {
  const propsJson = JSON.stringify(element ?? {});
  return updateBoardElement(boardId, elementId, propsJson);
}

export type { Board, BoardElement };
