import { createBoard, deleteBoardElements, getBoardById, getBoardElement, insertOrUpdateBoardElement, listBoardElements, updateBoardElement, } from "../db";
export function createBoardRecord(title) {
    const normalizedTitle = typeof title === "string" && title.trim() ? title.trim() : "Untitled Board";
    return createBoard(normalizedTitle);
}
export function fetchBoardById(id) {
    return getBoardById(id);
}
export function fetchBoardElements(boardId) {
    return listBoardElements(boardId);
}
export function createBoardElementRecord(boardId, element) {
    const propsJson = JSON.stringify(element ?? {});
    return insertOrUpdateBoardElement(boardId, element.id, element.type, propsJson);
}
export function fetchBoardElement(boardId, elementId) {
    return getBoardElement(boardId, elementId);
}
export function updateBoardElementRecord(boardId, elementId, element) {
    const propsJson = JSON.stringify(element ?? {});
    return updateBoardElement(boardId, elementId, propsJson);
}
export function deleteBoardElementsRecord(boardId, ids) {
    return deleteBoardElements(boardId, ids);
}
