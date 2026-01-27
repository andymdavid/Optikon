import {
  assignBoardsToWorkspaceByOwner,
  createWorkspace,
  getPersonalWorkspaceForPubkey,
  getWorkspaceById,
  getWorkspaceMember,
  listWorkspacesForMember,
  upsertWorkspaceMember,
} from "../db";

import type { Session } from "../types";

function normalizeWorkspaceTitle(title: string | null | undefined, fallback: string) {
  if (typeof title === "string" && title.trim()) return title.trim();
  return fallback;
}

export function getWorkspaceForSession(workspaceId: number, session: Session | null) {
  if (!session?.pubkey) return null;
  const workspace = getWorkspaceById(workspaceId);
  if (!workspace) return null;
  const isOwner = !!workspace.owner_pubkey && workspace.owner_pubkey === session.pubkey;
  if (isOwner) {
    upsertWorkspaceMember(workspaceId, session.pubkey, "owner");
    return workspace;
  }
  const member = getWorkspaceMember(workspaceId, session.pubkey);
  if (!member) return null;
  return workspace;
}

export function isWorkspaceOwner(session: Session | null, workspaceId: number) {
  if (!session?.pubkey) return false;
  const workspace = getWorkspaceById(workspaceId);
  if (!workspace) return false;
  if (workspace.owner_pubkey && workspace.owner_pubkey === session.pubkey) {
    upsertWorkspaceMember(workspaceId, session.pubkey, "owner");
    return true;
  }
  return false;
}

export function ensurePersonalWorkspace(session: Session) {
  const existing = getPersonalWorkspaceForPubkey(session.pubkey);
  if (existing) {
    upsertWorkspaceMember(existing.id, session.pubkey, "owner");
    assignBoardsToWorkspaceByOwner(existing.id, session.pubkey);
    return existing;
  }
  const created = createWorkspace("Personal", { pubkey: session.pubkey, npub: session.npub }, 1);
  if (!created) return null;
  upsertWorkspaceMember(created.id, session.pubkey, "owner");
  assignBoardsToWorkspaceByOwner(created.id, session.pubkey);
  return created;
}

export function listWorkspacesForSession(session: Session | null) {
  if (!session) return [];
  ensurePersonalWorkspace(session);
  return listWorkspacesForMember(session.pubkey);
}

export function createWorkspaceForSession(session: Session | null, title: string | null | undefined) {
  if (!session) return null;
  const normalizedTitle = normalizeWorkspaceTitle(title, "Untitled Workspace");
  const workspace = createWorkspace(normalizedTitle, { pubkey: session.pubkey, npub: session.npub }, 0);
  if (!workspace) return null;
  upsertWorkspaceMember(workspace.id, session.pubkey, "owner");
  return workspace;
}

export function isWorkspaceMember(session: Session | null, workspaceId: number) {
  if (!session?.pubkey) return false;
  return !!getWorkspaceForSession(workspaceId, session);
}

export function addWorkspaceMember(
  session: Session | null,
  workspaceId: number,
  pubkey: string,
  role: string = "member"
) {
  if (!session?.pubkey) return { ok: false as const, status: 401 as const, message: "Unauthorized." };
  const workspace = getWorkspaceById(workspaceId);
  if (!workspace) return { ok: false as const, status: 404 as const, message: "Workspace not found." };
  if (!isWorkspaceOwner(session, workspaceId)) {
    return { ok: false as const, status: 403 as const, message: "Only the workspace owner can invite." };
  }
  const member = upsertWorkspaceMember(workspaceId, pubkey, role);
  if (!member) return { ok: false as const, status: 500 as const, message: "Unable to add member." };
  return { ok: true as const, member, workspace };
}
