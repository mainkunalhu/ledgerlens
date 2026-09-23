import { Hono } from "hono";
import { z } from "zod";
import { getSql } from "../db/client.js";
import { loadEnv } from "../lib/env.js";
import {
  resolveImagePath,
  SUPPORTED_MIMES,
  saveImageBytes,
} from "../lib/storage.js";

export const documents = new Hono();

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const uuidParam = z.string().uuid();

documents.get("/", async (c) => {
  const parsed = listQuery.safeParse({
    limit: c.req.query("limit"),
    offset: c.req.query("offset"),
  });
  if (!parsed.success) return c.json({ error: "invalid query" }, 400);
  const { limit, offset } = parsed.data;
  const sql = getSql();
  const rows = await sql`
    SELECT id, image_path, original_filename, mime, width, height, status,
           created_at, updated_at
    FROM documents ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}
  `;
  const total =
    (await sql`SELECT count(*)::int AS n FROM documents`)[0]?.n ?? 0;
  return c.json({ documents: rows, total, limit, offset });
});

documents.post("/upload", async (c) => {
  const env = loadEnv();
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return c.json({ error: "expected multipart/form-data with 'file'" }, 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return c.json({ error: "field 'file' is required" }, 400);
  }
  const mime = file.type || "application/octet-stream";
  if (!SUPPORTED_MIMES.includes(mime)) {
    return c.json(
      {
        error: `unsupported mime '${mime}'. Use ${SUPPORTED_MIMES.join(", ")}`,
      },
      415,
    );
  }
  const maxBytes = env.MAX_IMAGE_MB * 1024 * 1024;
  if (file.size <= 0) return c.json({ error: "empty file" }, 400);
  if (file.size > maxBytes) {
    return c.json({ error: `file too large (max ${env.MAX_IMAGE_MB}MB)` }, 413);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const saved = await saveImageBytes(bytes, mime, file.name);
  const sql = getSql();
  const rows = await sql`
    INSERT INTO documents (id, image_path, original_filename, mime, status)
    VALUES (${saved.id}, ${saved.relPath}, ${file.name || null}, ${mime}, 'uploaded')
    RETURNING id, image_path, status
  `;
  const doc = rows[0] as { id: string; image_path: string; status: string };
  return c.json(
    { id: doc.id, status: doc.status, image_path: doc.image_path },
    201,
  );
});

documents.get("/:id", async (c) => {
  const parsed = uuidParam.safeParse(c.req.param("id"));
  if (!parsed.success) return c.json({ error: "invalid id" }, 400);
  const sql = getSql();
  const rows = await sql`
    SELECT id, image_path, original_filename, mime, width, height, status,
           ocr_json, vision_json, fused_json, created_at, updated_at
    FROM documents WHERE id = ${parsed.data}
  `;
  const doc = rows[0];
  if (!doc) return c.json({ error: "not found" }, 404);
  const fields = await sql`
    SELECT id, key, value, bbox, confidence, source
    FROM fields WHERE doc_id = ${parsed.data} ORDER BY created_at ASC
  `;
  return c.json({ ...doc, fields });
});

documents.get("/:id/image", async (c) => {
  const parsed = uuidParam.safeParse(c.req.param("id"));
  if (!parsed.success) return c.json({ error: "invalid id" }, 400);
  const sql = getSql();
  const rows = await sql`
    SELECT image_path, mime FROM documents WHERE id = ${parsed.data}
  `;
  const doc = rows[0] as { image_path: string; mime: string } | undefined;
  if (!doc) return c.json({ error: "not found" }, 404);
  const abs = resolveImagePath(doc.image_path);
  const f = Bun.file(abs);
  if (!(await f.exists())) return c.json({ error: "image missing" }, 410);
  return new Response(f, {
    headers: {
      "content-type": doc.mime || "application/octet-stream",
      "cache-control": "private, max-age=3600",
    },
  });
});
