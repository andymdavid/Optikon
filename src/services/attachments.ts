import { mkdirSync } from "fs";
import { unlink } from "fs/promises";
import { dirname, extname, join } from "path";

import { UPLOADS_DIR, UPLOADS_PUBLIC_PATH } from "../config";
import { createAttachment, deleteAttachmentsByBoard, getAttachment, listBoardAttachments, type Attachment } from "../db";

export function storeAttachment(params: {
  id: string;
  boardId: number;
  ownerPubkey: string | null;
  originalFilename: string;
  mimeType: string;
  size: number;
  relativePath: string;
}): Attachment | null {
  const storagePath = join(UPLOADS_DIR, params.relativePath);
  const publicUrl = `${UPLOADS_PUBLIC_PATH}/${params.relativePath}`;
  const dir = dirname(storagePath);
  mkdirSync(dir, { recursive: true });
  return (
    createAttachment({
      id: params.id,
      boardId: params.boardId,
      ownerPubkey: params.ownerPubkey,
      originalFilename: params.originalFilename,
      mimeType: params.mimeType,
      size: params.size,
      storagePath,
      publicUrl,
    }) ?? null
  );
}

export function buildUploadFilename(id: string, originalFilename: string, mimeType: string) {
  const extFromName = extname(originalFilename || "").toLowerCase();
  const extFromMime =
    mimeType === "image/png"
      ? ".png"
      : mimeType === "image/jpeg"
        ? ".jpg"
        : mimeType === "image/webp"
          ? ".webp"
          : mimeType === "image/gif"
            ? ".gif"
            : "";
  const extension = extFromMime || extFromName || "";
  return `${id}${extension}`;
}

export function fetchAttachmentById(boardId: number, attachmentId: string) {
  return getAttachment(boardId, attachmentId);
}

export async function deleteBoardAttachments(boardId: number) {
  const attachments = listBoardAttachments(boardId);
  for (const attachment of attachments) {
    if (!attachment.storage_path) continue;
    try {
      await unlink(attachment.storage_path);
    } catch (error) {
      console.warn("Failed to delete attachment file", {
        boardId,
        attachmentId: attachment.id,
        path: attachment.storage_path,
        error,
      });
    }
  }
  deleteAttachmentsByBoard(boardId);
}
