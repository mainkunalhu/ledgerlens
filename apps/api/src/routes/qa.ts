import { qaRequestSchema } from "@ledgerlens/shared";
import { Hono } from "hono";
import { getSql } from "../db/client.js";
import { answerQuestion, type DocField } from "../lib/answer.js";
import { GroqError } from "../lib/groq.js";

export const qa = new Hono();

qa.post("/", async (c) => {
  const parsed = qaRequestSchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!parsed.success)
    return c.json({ error: "expected {doc_id: uuid, question}" }, 400);
  const { doc_id, question } = parsed.data;

  const sql = getSql();
  const docs = await sql`
    SELECT status, vision_json FROM documents WHERE id = ${doc_id}
  `;
  const doc = docs[0] as
    | { status: string; vision_json: Record<string, unknown> | null }
    | undefined;
  if (!doc) return c.json({ error: "not found" }, 404);
  if (doc.status !== "ready") {
    return c.json(
      { error: `document is '${doc.status}', not ready for Q&A` },
      409,
    );
  }

  const rows = await sql`
    SELECT key, value, bbox, confidence, source FROM fields WHERE doc_id = ${doc_id}
  `;
  const fields = rows as unknown as DocField[];
  const visionJson = (doc.vision_json ?? {}) as Record<string, unknown>;

  let answer: Awaited<ReturnType<typeof answerQuestion>>;
  try {
    answer = await answerQuestion({ visionJson, fields }, question);
  } catch (err) {
    if (err instanceof GroqError) {
      const status = err.status === 503 ? 503 : 502;
      return c.json({ error: err.message }, status);
    }
    throw err;
  }

  await sql`
    INSERT INTO qa_log (doc_id, question, answer)
    VALUES (${doc_id}, ${question}, ${sql.json(JSON.parse(JSON.stringify(answer)))})
  `;
  return c.json(answer);
});
