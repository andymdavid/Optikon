import { mkdirSync } from "fs";
import { dirname, extname, join } from "path";

import { createAttachment, type Attachment } from "../db";
import { UPLOADS_DIR, UPLOADS_PUBLIC_PATH } from "../config";

export function storeAttachment(params: {
  id: string;
  boardId: number;
  ownerPubkey: string | null;
  originalFilename: string;
  mimeType: string;
  size: number;
  relativePath: string;
}) {
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
