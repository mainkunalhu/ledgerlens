import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { extname, isAbsolute, join } from "node:path";
import { loadEnv } from "./env.js";
import { repoRoot } from "./paths.js";

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export const SUPPORTED_MIMES = Object.keys(MIME_TO_EXT);

export function extForMime(mime: string, filename?: string): string {
  if (MIME_TO_EXT[mime]) return MIME_TO_EXT[mime];
  const ext = filename ? extname(filename).toLowerCase() : "";
  if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext)) {
    return ext === ".jpeg" ? ".jpg" : ext;
  }
  return ".jpg";
}

/** Repo root = dir containing package.json named "ledgerlens". */
export { repoRoot } from "./paths.js";

/** Absolute storage dir; relative STORAGE_DIR resolves against repo root. */
export function storageDir(): string {
  const env = loadEnv();
  if (isAbsolute(env.STORAGE_DIR)) return env.STORAGE_DIR;
  return join(repoRoot(), env.STORAGE_DIR);
}

export async function ensureStorageDir(): Promise<string> {
  const dir = storageDir();
  await mkdir(dir, { recursive: true });
  return dir;
}

export interface SavedFile {
  id: string;
  absPath: string;
  relPath: string;
}

/** Persist raw image bytes, return id + paths. Caller inserts DB row. */
export async function saveImageBytes(
  bytes: Uint8Array,
  mime: string,
  originalFilename?: string,
): Promise<SavedFile> {
  const dir = await ensureStorageDir();
  const id = randomUUID();
  const ext = extForMime(mime, originalFilename);
  const filename = `${id}${ext}`;
  const absPath = join(dir, filename);
  await Bun.write(absPath, bytes);
  return { id, absPath, relPath: filename };
}

export function resolveImagePath(relPath: string): string {
  // Guard against path traversal: only basename is trusted.
  const base = relPath.split("/").pop() ?? relPath;
  return join(storageDir(), base);
}
