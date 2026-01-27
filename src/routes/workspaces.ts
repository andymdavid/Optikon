import { nip19 } from "nostr-tools";

import { jsonResponse, safeJson } from "../http";
import {
  addWorkspaceMember,
  createWorkspaceForSession,
  listWorkspaceMembersForSession,
  listWorkspacesForSession,
} from "../services/workspaces";

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

export async function handleWorkspaceMemberCreate(req: Request, workspaceId: number, session: Session | null) {
  const body = (await safeJson(req)) as { pubkey?: string; npub?: string } | null;
  if (!body) return jsonResponse({ message: "Invalid payload." }, 400);
  const pubkey = normalizeMemberPubkey(body);
  if (!pubkey) return jsonResponse({ message: "Invalid pubkey." }, 400);
  if (session?.pubkey && pubkey === session.pubkey) {
    return jsonResponse({ message: "You are already a member." }, 400);
  }
  const result = addWorkspaceMember(session, workspaceId, pubkey, "member");
  if (!result.ok) return jsonResponse({ message: result.message }, result.status);
  return jsonResponse(
    {
      member: {
        pubkey: result.member.pubkey,
        npub: nip19.npubEncode(result.member.pubkey),
        role: result.member.role,
        createdAt: result.member.created_at,
      },
    },
    201
  );
}

export function handleWorkspaceMembersList(workspaceId: number, session: Session | null) {
  const result = listWorkspaceMembersForSession(session, workspaceId);
  if (!result.ok) return jsonResponse({ message: result.message }, result.status);
  const members = result.members.map((member) => ({
    pubkey: member.pubkey,
    npub: nip19.npubEncode(member.pubkey),
    role: member.role,
    createdAt: member.created_at,
  }));
  return jsonResponse({ members });
}
