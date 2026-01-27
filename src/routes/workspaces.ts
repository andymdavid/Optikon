import { jsonResponse, safeJson } from "../http";
import { createWorkspaceForSession, listWorkspacesForSession } from "../services/workspaces";

import type { Session } from "../types";

type WorkspaceResponse = {
  id: number;
  title: string;
  isPersonal: boolean;
  ownerPubkey: string | null;
};

function toWorkspaceResponse(workspace: {
  id: number;
  title: string;
  is_personal: number;
  owner_pubkey: string | null;
}): WorkspaceResponse {
  return {
    id: workspace.id,
    title: workspace.title,
    isPersonal: workspace.is_personal === 1,
    ownerPubkey: workspace.owner_pubkey,
  };
}

export function handleWorkspacesList(session: Session | null) {
  if (!session) return jsonResponse({ message: "Unauthorized." }, 401);
  const workspaces = listWorkspacesForSession(session).map(toWorkspaceResponse);
  return jsonResponse({ workspaces });
}

export async function handleWorkspaceCreate(req: Request, session: Session | null) {
  if (!session) return jsonResponse({ message: "Unauthorized." }, 401);
  const body = (await safeJson(req)) as { title?: string } | null;
  const created = createWorkspaceForSession(session, body?.title ?? null);
  if (!created) return jsonResponse({ message: "Unable to create workspace." }, 500);
  return jsonResponse(toWorkspaceResponse(created), 201);
}
