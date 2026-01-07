import { createBoard, getBoardById, insertBoardElement, listBoardElements } from "../db";

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

export type { Board, BoardElement };
