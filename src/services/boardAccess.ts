import { getBoardMember } from "../db";

import type { Board } from "../db";
import type { Session } from "../types";

export type BoardRole = "viewer" | "commenter" | "editor";

export function normalizeBoardRole(value: unknown): BoardRole {
  if (value === "viewer" || value === "commenter" || value === "editor") return value;
  return "viewer";
}

export function isBoardOwner(board: Board, session: Session | null) {
  return !!session?.pubkey && !!board.owner_pubkey && session.pubkey === board.owner_pubkey;
}

export function canViewBoard(board: Board, session: Session | null) {
  if (isBoardOwner(board, session)) return true;
  if (board.is_private === 1) {
    if (!session?.pubkey) return false;
    const member = getBoardMember(board.id, session.pubkey);
    return !!member;
  }
  return true;
}

export function resolveBoardRole(board: Board, session: Session | null): BoardRole {
  if (!session) return "viewer";
  if (isBoardOwner(board, session)) return "editor";
  const member = session.pubkey ? getBoardMember(board.id, session.pubkey) : null;
  if (member?.role) return normalizeBoardRole(member.role);
  if (board.is_private === 1) return "viewer";
  return normalizeBoardRole(board.default_role);
}

export function canEditBoard(role: BoardRole) {
  return role === "editor";
}

export function canComment(role: BoardRole) {
  return role === "commenter" || role === "editor";
}
