import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import app from "../app.js";
import { closeDb, getSql } from "../db/client.js";
import { migrate } from "../db/migrate.js";
import {
  answerQuestion,
  type ChatFn,
  classifyQuestion,
  type DocContext,
  solveFreeform,
} from "../lib/answer.js";

function req(path: string, init?: RequestInit): Request {
  return new Request(`http://localhost${path}`, init);
}

const BBOX = { x: 1, y: 2, w: 3, h: 4 };

function ctx(over: Partial<DocContext> = {}): DocContext {
  return {
    visionJson: {
      line_items: [
        { desc: "Rice", qty: 2, rate: 650, amount: 1300 },
        { desc: "Oil", qty: 3, rate: 180, amount: 540 },
      ],
    },
    fields: [
      {
        key: "vendor",
        value: "Sharma Traders",
        bbox: BBOX,
        confidence: 1,
        source: "vision",
      },
      {
        key: "subtotal",
        value: "1840.0",
        bbox: BBOX,
        confidence: 1,
        source: "vision",
      },
      {
        key: "gst",
        value: "331.2",
        bbox: BBOX,
        confidence: 1,
        source: "vision",
      },
      {
        key: "total",
        value: "2171.2",
        bbox: BBOX,
        confidence: 1,
        source: "vision",
      },
    ],
    ...over,
  };
}

async function seedReady(c: DocContext): Promise<string> {
  const sql = getSql();
  const docs = await sql`
    INSERT INTO documents (image_path, status, vision_json)
    VALUES ('test.png', 'ready', ${sql.json(JSON.parse(JSON.stringify(c.visionJson)))})
    RETURNING id
  `;
  const id = docs[0].id as string;
  for (const f of c.fields) {
    await sql`
      INSERT INTO fields (doc_id, key, value, bbox, confidence, source)
      VALUES (${id}, ${f.key}, ${f.value}, ${sql.json(f.bbox)}, ${f.confidence}, ${f.source})
    `;
  }
  return id;
}

describe("qa classification", () => {
  test("routes to deterministic intents", () => {
    expect(classifyQuestion("total?")).toBe("total");
    expect(classifyQuestion("What is the GST?")).toBe("gst");
    expect(classifyQuestion("any mismatch?")).toBe("mismatch");
    expect(classifyQuestion("who is the vendor?")).toBe("freeform");
  });

  test("generic bill questions reach the LLM, not the total solver", () => {
    expect(classifyQuestion("what is this bill even about?")).toBe("freeform");
    expect(classifyQuestion("summarise this bill")).toBe("freeform");
    expect(classifyQuestion("what's the total bill?")).toBe("total");
    expect(classifyQuestion("bill amount?")).toBe("total");
    expect(classifyQuestion("how much do I pay?")).toBe("total");
  });
});

describe("qa deterministic solvers", () => {
  test("total cites bbox and verifies", async () => {
    const a = await answerQuestion(ctx(), "total?");
    expect(a.value).toBe("2171.2");
    expect(a.answer).toContain("2,171.2");
    expect(a.citations[0]).toMatchObject({ key: "total", label: "Total" });
    expect(a.verified).toBe(true);
  });

  test("gst reports effective rate", async () => {
    const a = await answerQuestion(ctx(), "GST?");
    expect(a.value).toBe("331.2");
    expect(a.answer).toContain("18.0%");
    expect(a.citations.map((x) => x.key).sort()).toEqual(["gst", "subtotal"]);
  });

  test("mismatch passes on consistent invoice", async () => {
    const a = await answerQuestion(ctx(), "mismatch?");
    expect(a.value).toBe("ok");
    expect(a.answer).toContain("No mismatch");
    expect(a.verified).toBe(true);
  });

  test("mismatch flags tampered total", async () => {
    const bad = ctx({
      fields: [
        {
          key: "total",
          value: "9999.0",
          bbox: BBOX,
          confidence: 0.9,
          source: "vision",
        },
        {
          key: "subtotal",
          value: "1840.0",
          bbox: BBOX,
          confidence: 1,
          source: "vision",
        },
        {
          key: "gst",
          value: "331.2",
          bbox: BBOX,
          confidence: 1,
          source: "vision",
        },
      ],
    });
    const a = await answerQuestion(bad, "check for mismatch");
    expect(a.value).toBe("mismatch");
    expect(a.answer).toContain("MISMATCH");
  });

  test("missing bbox marks unverified", async () => {
    const noBox = ctx({
      fields: [
        {
          key: "total",
          value: "100",
          bbox: null,
          confidence: 0.4,
          source: "vision",
        },
      ],
    });
    const a = await answerQuestion(noBox, "total?");
    expect(a.verified).toBe(false);
    expect(a.citations).toEqual([]);
  });
});

describe("qa freeform guard", () => {
  const stubChat = (payload: unknown) =>
    (async () => ({ data: payload, model: "stub", latencyMs: 1 })) as ChatFn;

  test("bogus citation keys are dropped and unverified", async () => {
    const fakeChat = stubChat({
      answer: "Vendor is Sharma.",
      citations: [{ key: "vendor" }, { key: "invented_key" }],
    });
    const a = await solveFreeform(ctx(), "who is the vendor?", fakeChat);
    expect(a.citations.map((x) => x.key)).toEqual(["vendor"]);
    expect(a.verified).toBe(false);
  });

  test("fully grounded answer verifies", async () => {
    const fakeChat = stubChat({
      answer: "Total is 2171.2.",
      value: "2171.2",
      citations: [{ key: "total" }],
    });
    const a = await solveFreeform(ctx(), "total?", fakeChat);
    expect(a.verified).toBe(true);
  });
});

describe("qa route", () => {
  beforeAll(async () => {
    await migrate();
    const sql = getSql();
    await sql`DELETE FROM documents`;
  });
  afterAll(async () => {
    await closeDb();
  });

  test("validates body, 404s unknown doc", async () => {
    const bad = await app.fetch(req("/qa", { method: "POST", body: "{}" }));
    expect(bad.status).toBe(400);
    const nf = await app.fetch(
      req("/qa", {
        method: "POST",
        body: JSON.stringify({
          doc_id: "00000000-0000-0000-0000-000000000000",
          question: "total?",
        }),
      }),
    );
    expect(nf.status).toBe(404);
  });

  test("409s when document not ready", async () => {
    const sql = getSql();
    const docs = await sql`
      INSERT INTO documents (image_path, status) VALUES ('x.png', 'uploaded') RETURNING id
    `;
    const res = await app.fetch(
      req("/qa", {
        method: "POST",
        body: JSON.stringify({ doc_id: docs[0].id, question: "total?" }),
      }),
    );
    expect(res.status).toBe(409);
  });

  test("answers total and logs to qa_log", async () => {
    const id = await seedReady(ctx());
    const res = await app.fetch(
      req("/qa", {
        method: "POST",
        body: JSON.stringify({ doc_id: id, question: "total?" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.value).toBe("2171.2");
    expect(body.verified).toBe(true);
    expect(body.citations[0].bbox).toMatchObject({ x: 1, y: 2, w: 3, h: 4 });

    const sql = getSql();
    const logs =
      await sql`SELECT question, answer FROM qa_log WHERE doc_id = ${id}`;
    expect(logs.length).toBe(1);
    expect(logs[0].question).toBe("total?");
    expect((logs[0].answer as { value: string }).value).toBe("2171.2");
  });
});
