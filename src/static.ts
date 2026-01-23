import { extname, join, normalize } from "path";

import { PUBLIC_DIR, STATIC_FILES } from "./config";

const CONTENT_TYPE_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

export async function serveStatic(pathname: string) {
  const mapped = STATIC_FILES.get(pathname);
  if (mapped) {
    return buildResponse(join(PUBLIC_DIR, mapped));
  }

  const normalized = normalize(pathname).replace(/^\/+/, "");
  if (normalized.includes("..")) return null;
  const directPath = join(PUBLIC_DIR, normalized);
  return buildResponse(directPath);
}

async function buildResponse(path: string) {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  const contentType = contentTypeFor(path);
  if (!contentType) {
    return new Response(file);
  }
  return new Response(file, { headers: { "Content-Type": contentType } });
}

function contentTypeFor(filePath: string) {
  const ext = extname(filePath).toLowerCase();
  return CONTENT_TYPE_MAP[ext] ?? "application/octet-stream";
}
