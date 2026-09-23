import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import app from "../app.js";
import { closeDb, getSql } from "../db/client.js";
import { migrate } from "../db/migrate.js";
import { processDocument } from "../lib/process.js";
import { saveImageBytes } from "../lib/storage.js";
import { WorkerError } from "../lib/worker.js";

// 1x1 transparent PNG
const PNG_1PX = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);

function req(path: string, init?: RequestInit): Request {
  return new Request(`http://localhost${path}`, init);
}

async function seedDoc(): Promise<string> {
  const saved = await saveImageBytes(PNG_1PX, "image/png", "t.png");
  const sql = getSql();
  await sql`
    INSERT INTO documents (id, image_path, original_filename, mime, status)
    VALUES (${saved.id}, ${saved.relPath}, 't.png', 'image/png', 'uploaded')
  `;
  return saved.id;
}

const stubInfer = async () => ({
  ok: true,
  vision_json: { vendor: "Stub Traders", total: 999.5 },
  fields: [
    {
      key: "vendor",
      value: "Stub Traders",
      bbox: { x: 10, y: 20, w: 300, h: 40 },
      confidence: 0.92,
      source: "fusion",
      ocr_support: true,
    },
    {
      key: "total",
      value: "999.5",
      bbox: null,
      confidence: 0.8,
      source: "fusion",
      ocr_support: true,
    },
  ],
  model: "stub-model",
  latency_ms: 5,
  layout: { zones: [], table_bbox: null, method: "stub" },
  ocr: { available: true, count: 2, words: [], latency_ms: 1 },
  fused: { fields: [], checks: [], ocr_support_rate: 1 },
});

describe("phase 2 vision orchestration", () => {
  beforeAll(async () => {
    await migrate();
    const sql = getSql();
    await sql`DELETE FROM documents`;
  });
  afterAll(async () => {
    await closeDb();
  });

  test("processDocument stores vision_json + fields, marks ready", async () => {
    const id = await seedDoc();
    const result = await processDocument(id, stubInfer);
    expect(result.status).toBe("ready");
    expect(result.fieldCount).toBe(2);

    const sql = getSql();
    const rows =
      await sql`SELECT status, vision_json FROM documents WHERE id = ${id}`;
    expect(rows[0].status).toBe("ready");
    expect((rows[0].vision_json as { vendor: string }).vendor).toBe(
      "Stub Traders",
    );

    const fields =
      await sql`SELECT key, value, confidence, source FROM fields WHERE doc_id = ${id}`;
    expect(fields.length).toBe(2);
    expect(fields.find((f) => f.key === "vendor")?.value).toBe("Stub Traders");
    expect(fields.every((f) => f.source === "fusion")).toBe(true);

    const fused =
      await sql`SELECT ocr_json, fused_json FROM documents WHERE id = ${id}`;
    expect((fused[0].ocr_json as { available: boolean }).available).toBe(true);
    expect(
      (fused[0].fused_json as { ocr_support_rate: number }).ocr_support_rate,
    ).toBe(1);
  });

  test("processDocument marks failed when worker errors", async () => {
    const id = await seedDoc();
    const failing = async () => {
      throw new WorkerError(503, "worker unreachable");
    };
    const result = await processDocument(id, failing);
    expect(result.status).toBe("failed");
    expect(result.error).toContain("unreachable");

    const sql = getSql();
    const rows = await sql`SELECT status FROM documents WHERE id = ${id}`;
    expect(rows[0].status).toBe("failed");
  });

  test("reprocess endpoint rejects unknown id", async () => {
    const res = await app.fetch(
      req("/documents/00000000-0000-0000-0000-000000000000/reprocess", {
        method: "POST",
      }),
    );
    expect(res.status).toBe(404);
  });
});
