import { createBoard, getBoardById, getBoardElement, insertBoardElement, listBoardElements, updateBoardElement } from "../db";

import type { Board, BoardElement } from "../db";

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

export function createBoardElementRecord(boardId: number, type: string, props: unknown) {
  const propsJson = JSON.stringify(props ?? {});
  return insertBoardElement(boardId, type, propsJson);
}

export function fetchBoardElement(boardId: number, elementId: number) {
  return getBoardElement(boardId, elementId);
}

export function updateBoardElementRecord(boardId: number, elementId: number, element: unknown) {
  const propsJson = JSON.stringify(element ?? {});
  return updateBoardElement(boardId, elementId, propsJson);
}

export type { Board, BoardElement };
