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
  ocrAvailable?: boolean;
  ocrSupportRate?: number;
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
    // JSON round-trip: guarantees DB-safe payloads (strips undefined) and
    // satisfies postgres.js's strict JSONValue parameter type.
    const ocrJson = JSON.parse(
      JSON.stringify({
        available: result.ocr.available,
        count: result.ocr.count,
        words: result.ocr.words,
        latency_ms: result.ocr.latency_ms,
      }),
    );
    const fusedJson = JSON.parse(
      JSON.stringify({
        fields: result.fused.fields,
        checks: result.fused.checks,
        ocr_support_rate: result.fused.ocr_support_rate,
        layout: result.layout,
      }),
    );
    await tx`
      UPDATE documents
      SET vision_json = ${tx.json(result.vision_json)},
          ocr_json = ${tx.json(ocrJson)},
          fused_json = ${tx.json(fusedJson)},
          status = 'ready', updated_at = now()
      WHERE id = ${docId}
    `;
    await tx`DELETE FROM fields WHERE doc_id = ${docId} AND source IN ('vision', 'fusion')`;
    for (const f of result.fields) {
      await tx`
        INSERT INTO fields (doc_id, key, value, bbox, confidence, source)
        VALUES (${docId}, ${f.key}, ${f.value}, ${tx.json(f.bbox)}, ${f.confidence}, ${f.source})
      `;
    }
  });

  return {
    status: "ready",
    model: result.model,
    latency_ms: result.latency_ms,
    fieldCount: result.fields.length,
    ocrAvailable: result.ocr.available,
    ocrSupportRate: result.fused.ocr_support_rate,
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
