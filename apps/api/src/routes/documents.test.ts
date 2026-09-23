import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import app from "../app.js";
import { closeDb, getSql } from "../db/client.js";
import { migrate } from "../db/migrate.js";

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

describe("phase 1 documents flow", () => {
  beforeAll(async () => {
    await migrate();
    // isolate tests
    const sql = getSql();
    await sql`DELETE FROM documents`;
  });
  afterAll(async () => {
    await closeDb();
  });

  test("health reports db ok", async () => {
    const res = await app.fetch(req("/health"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.db.ok).toBe(true);
  });

  test("upload -> get -> image -> list round-trip", async () => {
    const form = new FormData();
    form.append(
      "file",
      new File([PNG_1PX], "receipt.png", { type: "image/png" }),
    );
    const up = await app.fetch(
      req("/documents/upload?process=false", { method: "POST", body: form }),
    );
    expect(up.status).toBe(201);
    const created = await up.json();
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.status).toBe("uploaded");

    const got = await app.fetch(req(`/documents/${created.id}`));
    expect(got.status).toBe(200);
    const doc = await got.json();
    expect(doc.id).toBe(created.id);
    expect(doc.mime).toBe("image/png");
    expect(Array.isArray(doc.fields)).toBe(true);

    const img = await app.fetch(req(`/documents/${created.id}/image`));
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/png");
    expect((await img.arrayBuffer()).byteLength).toBeGreaterThan(0);

    const list = await app.fetch(req("/documents?limit=10"));
    expect(list.status).toBe(200);
    const page = await list.json();
    expect(page.total).toBeGreaterThanOrEqual(1);
  });

  test("upload rejects non-image and bad id", async () => {
    const bad = new FormData();
    bad.append("file", new File(["hello"], "x.txt", { type: "text/plain" }));
    const r1 = await app.fetch(
      req("/documents/upload", { method: "POST", body: bad }),
    );
    expect(r1.status).toBe(415);

    const r2 = await app.fetch(req("/documents/not-a-uuid"));
    expect(r2.status).toBe(400);

    const r3 = await app.fetch(
      req("/documents/00000000-0000-0000-0000-000000000000"),
    );
    expect(r3.status).toBe(404);
  });
});
