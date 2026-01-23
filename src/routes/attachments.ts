import { writeFile } from "fs/promises";
import { basename } from "path";

import { UPLOADS_DIR } from "../config";
import { jsonResponse } from "../http";
import { buildUploadFilename, fetchAttachmentById, storeAttachment } from "../services/attachments";
import { canEditBoard, canViewBoard, resolveBoardRole } from "../services/boardAccess";
import { fetchBoardById, fetchBoardElements } from "../services/boards";

import type { BoardElement } from "../shared/boardElements";
import type { Session } from "../types";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

export async function handleAttachmentUpload(req: Request, boardId: number, session: Session | null) {
  const board = fetchBoardById(boardId);
  if (!board) {
    return jsonResponse({ message: "Board not found." }, 404);
  }
  if (!canViewBoard(board, session)) {
    return jsonResponse({ message: "Forbidden." }, 403);
  }
  const role = resolveBoardRole(board, session);
  if (!canEditBoard(role)) {
    return jsonResponse({ message: "Forbidden." }, 403);
  }
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return jsonResponse({ message: "Missing file." }, 400);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return jsonResponse({ message: "File too large." }, 413);
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return jsonResponse({ message: "Unsupported file type." }, 415);
  }

  const id = crypto.randomUUID();
  const filename = buildUploadFilename(id, file.name, file.type);
  const attachment = storeAttachment({
    id,
    boardId,
    ownerPubkey: session?.pubkey ?? null,
    originalFilename: file.name,
    mimeType: file.type,
    size: file.size,
    relativePath: filename,
  });
  if (!attachment) {
    return jsonResponse({ message: "Unable to store attachment." }, 500);
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(attachment.storage_path, buffer);
  } catch (error) {
    console.error("Failed to write attachment file", error);
    return jsonResponse({ message: "Unable to store file." }, 500);
  }

  return jsonResponse({
    attachment: {
      id: attachment.id,
      url: attachment.public_url,
      mimeType: attachment.mime_type,
      size: attachment.size,
      originalFilename: attachment.original_filename,
      createdAt: attachment.created_at,
    },
  }, 201);
}

export async function handleAttachmentDownload(
  boardId: number,
  attachmentId: string,
  session: Session | null
) {
  const board = fetchBoardById(boardId);
  if (!board) {
    return jsonResponse({ message: "Board not found." }, 404);
  }
  if (!canViewBoard(board, session)) {
    return jsonResponse({ message: "Forbidden." }, 403);
  }
  let attachment = fetchAttachmentById(boardId, attachmentId);
  if (!attachment) {
    const legacy = await recoverLegacyAttachment(boardId, attachmentId, session);
    if (legacy) {
      attachment = legacy;
    }
  }
  if (!attachment) {
    return jsonResponse({ message: "Attachment not found." }, 404);
  }
  const file = Bun.file(attachment.storage_path);
  if (!(await file.exists())) {
    return jsonResponse({ message: "Attachment not found." }, 404);
  }
  const filename = attachment.original_filename.replace(/"/g, "");
  return new Response(file, {
    headers: {
      "Content-Type": attachment.mime_type || "application/octet-stream",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}

async function recoverLegacyAttachment(
  boardId: number,
  attachmentId: string,
  session: Session | null
) {
  const board = fetchBoardById(boardId);
  if (!board) return null;
  if (!canViewBoard(board, session)) return null;
  const rows = fetchBoardElements(boardId);
  const match = rows.find((row) => {
    try {
      const parsed = JSON.parse(row.props_json) as BoardElement;
      return parsed?.type === "image" && parsed.attachmentId === attachmentId;
    } catch (_error) {
      return false;
    }
  });
  if (!match) return null;
  let element: BoardElement | null = null;
  try {
    element = JSON.parse(match.props_json) as BoardElement;
  } catch (_error) {
    return null;
  }
  if (!element || element.type !== "image") return null;
  const image = element as BoardElement & { url?: string; mimeType?: string };
  const url = typeof image.url === "string" ? image.url : "";
  const marker = "/uploads/";
  const index = url.indexOf(marker);
  if (index === -1) return null;
  const relativePath = url.slice(index + marker.length);
  if (!relativePath || relativePath.includes("..")) return null;
  const storagePath = `${UPLOADS_DIR}/${relativePath}`;
  const file = Bun.file(storagePath);
  if (!(await file.exists())) return null;
  const originalFilename = basename(relativePath);
  const mimeType =
    typeof image.mimeType === "string" && image.mimeType.trim()
      ? image.mimeType.trim()
      : "application/octet-stream";
  const created = storeAttachment({
    id: attachmentId,
    boardId,
    ownerPubkey: session?.pubkey ?? null,
    originalFilename,
    mimeType,
    size: file.size,
    relativePath,
  });
  return created;
}
