import type postgres from "postgres";
import { getSql } from "../db/client.js";
import { resolveImagePath } from "./storage.js";
import { inferImage, WorkerError } from "./worker.js";

export type InferFn = typeof inferImage;

export interface ProcessResult {
  status: "ready" | "failed";
  model?: string;
  latency_ms?: number;
  fieldCount?: number;
  error?: string;
}

/**
 * Run vision on a stored document and persist results.
 * `infer` is injectable so tests can stub the worker.
 */
export async function processDocument(
  docId: string,
  infer: InferFn = inferImage,
): Promise<ProcessResult> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, image_path, mime, original_filename FROM documents WHERE id = ${docId}
  `;
  const doc = rows[0] as
    | {
        id: string;
        image_path: string;
        mime: string;
        original_filename: string | null;
      }
    | undefined;
  if (!doc) throw new Error(`document ${docId} not found`);

  await sql`UPDATE documents SET status = 'processing', updated_at = now() WHERE id = ${docId}`;

  const abs = resolveImagePath(doc.image_path);
  if (!(await Bun.file(abs).exists())) {
    const error = "stored image missing";
    await fail(sql, docId, error);
    return { status: "failed", error };
  }

  let result: Awaited<ReturnType<InferFn>>;
  try {
    result = await infer(abs, doc.mime, doc.original_filename ?? "image");
  } catch (err) {
    const error = err instanceof WorkerError ? err.message : String(err);
    await fail(sql, docId, error);
    return { status: "failed", error };
  }

  await sql.begin(async (tx) => {
    await tx`
      UPDATE documents
      SET vision_json = ${tx.json(result.vision_json)},
          status = 'ready', updated_at = now()
      WHERE id = ${docId}
    `;
    await tx`DELETE FROM fields WHERE doc_id = ${docId} AND source = 'vision'`;
    for (const f of result.fields) {
      await tx`
        INSERT INTO fields (doc_id, key, value, bbox, confidence, source)
        VALUES (${docId}, ${f.key}, ${f.value}, ${tx.json(f.bbox)}, ${f.confidence}, 'vision')
      `;
    }
  });

  return {
    status: "ready",
    model: result.model,
    latency_ms: result.latency_ms,
    fieldCount: result.fields.length,
  };
}

async function fail(
  sql: postgres.Sql,
  docId: string,
  error: string,
): Promise<void> {
  await sql`
    UPDATE documents
    SET vision_json = ${sql.json({ error })}, status = 'failed', updated_at = now()
    WHERE id = ${docId}
  `;
}
