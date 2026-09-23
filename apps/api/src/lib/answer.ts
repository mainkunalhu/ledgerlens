import { type BBox, qaResponseSchema } from "@ledgerlens/shared";
import { z } from "zod";
import { chatJSON } from "./groq.js";

export interface DocField {
  key: string;
  value: string;
  bbox: BBox | null;
  confidence: number;
  source: string;
}

export interface DocContext {
  visionJson: Record<string, unknown>;
  fields: DocField[];
}

export interface Citation {
  key: string;
  bbox: BBox;
  label: string;
}

export interface Answer {
  answer: string;
  value?: string;
  citations: Citation[];
  verified: boolean;
}

type Intent = "total" | "gst" | "mismatch" | "freeform";

export function classifyQuestion(question: string): Intent {
  const q = question.toLowerCase();
  if (
    /(mismatch|mismatch|tally|talley|difference|differ|verify|correct|check\b|reconcile)/.test(
      q,
    )
  )
    return "mismatch";
  if (/(gst|tax|vat|cgst|sgst|igst)/.test(q)) return "gst";
  if (/(total|amount payable|grand total|net payable|payable|bill)/.test(q))
    return "total";
  return "freeform";
}

function findField(fields: DocField[], key: string): DocField | undefined {
  return fields.find((f) => f.key === key);
}

/** Build citations for keys that have a stored bbox. */
function cite(
  fields: DocField[],
  keys: { key: string; label: string }[],
): { citations: Citation[]; allGrounded: boolean } {
  const citations: Citation[] = [];
  let allGrounded = true;
  for (const { key, label } of keys) {
    const f = findField(fields, key);
    if (f?.bbox) citations.push({ key, bbox: f.bbox, label });
    else allGrounded = false;
  }
  return { citations, allGrounded };
}

function num(value: string): number | null {
  const n = Number(value.replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function inr(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function solveTotal(fields: DocField[]): Answer | null {
  const total = findField(fields, "total");
  if (!total) return null;
  const n = num(total.value);
  const { citations, allGrounded } = cite(fields, [
    { key: "total", label: "Total" },
  ]);
  return {
    answer:
      n !== null
        ? `Total is ${inr(n)} (confidence ${total.confidence}).`
        : `Total reads ${total.value} (confidence ${total.confidence}).`,
    value: total.value,
    citations,
    verified: allGrounded && citations.length > 0,
  };
}

function solveGst(fields: DocField[]): Answer | null {
  const gst = findField(fields, "gst");
  if (!gst) return null;
  const subtotal = findField(fields, "subtotal");
  const keys = [{ key: "gst", label: "GST" }];
  let extra = "";
  const g = num(gst.value);
  const s = subtotal ? num(subtotal.value) : null;
  if (g !== null && s) {
    extra = ` — that's ${((g / s) * 100).toFixed(1)}% of subtotal ${inr(s)}.`;
    keys.push({ key: "subtotal", label: "Subtotal" });
  }
  const { citations, allGrounded } = cite(fields, keys);
  return {
    answer: `GST is ${g !== null ? inr(g) : gst.value}${extra} (confidence ${gst.confidence}).`,
    value: gst.value,
    citations,
    verified: allGrounded && citations.length > 0,
  };
}

interface LineItem {
  amount?: number | string | null;
}

function solveMismatch(ctx: DocContext): Answer | null {
  const { fields, visionJson } = ctx;
  const total = findField(fields, "total");
  const subtotal = findField(fields, "subtotal");
  const gst = findField(fields, "gst");
  if (!total) return null;

  const t = num(total.value);
  const items = (visionJson.line_items as LineItem[] | undefined) ?? [];
  const amounts = items.map((li) =>
    typeof li.amount === "number" ? li.amount : Number(li.amount),
  );
  const lineSum = amounts.every((a) => Number.isFinite(a))
    ? amounts.reduce((a, b) => a + b, 0)
    : null;
  const s = subtotal ? num(subtotal.value) : null;
  const g = gst ? num(gst.value) : null;

  const checks: string[] = [];
  let mismatch = false;
  const TOL = 1.0;
  if (lineSum !== null && s !== null) {
    const ok = Math.abs(lineSum - s) <= TOL;
    mismatch ||= !ok;
    checks.push(
      `line-items sum ${inr(lineSum)} vs subtotal ${inr(s)}: ${ok ? "match" : "MISMATCH"}`,
    );
  }
  if (s !== null && g !== null && t !== null) {
    const ok = Math.abs(s + g - t) <= TOL;
    mismatch ||= !ok;
    checks.push(
      `subtotal + GST = ${inr(s + g)} vs total ${inr(t)}: ${ok ? "match" : "MISMATCH"}`,
    );
  }
  if (checks.length === 0) {
    checks.push(
      `total reads ${total.value}; not enough fields to cross-check line items.`,
    );
  }
  const { citations, allGrounded } = cite(fields, [
    { key: "total", label: "Total" },
    ...(subtotal ? [{ key: "subtotal", label: "Subtotal" }] : []),
    ...(gst ? [{ key: "gst", label: "GST" }] : []),
  ]);
  return {
    answer: mismatch
      ? `Mismatch found. ${checks.join(". ")}.`
      : `No mismatch. ${checks.join(". ")}.`,
    value: mismatch ? "mismatch" : "ok",
    citations,
    verified: allGrounded && citations.length > 0,
  };
}

const llmCitationSchema = z.object({
  answer: z.string(),
  value: z.string().optional(),
  citations: z.array(z.object({ key: z.string() })).default([]),
});

export type ChatFn = typeof chatJSON;

/** Freeform fallback via Groq JSON mode. Citation keys are resolved against
 *  stored fields — unknown keys are dropped and mark the answer unverified. */
export async function solveFreeform(
  ctx: DocContext,
  question: string,
  chat: ChatFn = chatJSON,
): Promise<Answer> {
  const fieldLines = ctx.fields.map(
    (f) =>
      `- ${f.key} = ${f.value} (confidence ${f.confidence}${f.bbox ? ", located" : ", no location"})`,
  );
  const items = ctx.visionJson.line_items as LineItem[] | undefined;
  const itemLines = Array.isArray(items)
    ? items.map((li) => `  item: ${JSON.stringify(li)}`)
    : [];
  const { data } = await chat<{
    answer: string;
    value?: string;
    citations?: { key: string }[];
  }>([
    {
      role: "system",
      content:
        "You answer questions about an invoice. Return STRICT JSON: " +
        '{"answer": string, "value": string (optional), "citations": [{"key": string}]}. ' +
        "Cite ONLY keys from the field list below. Never invent values — say what is missing.",
    },
    {
      role: "user",
      content: `Fields:\n${fieldLines.join("\n")}\nLine items:\n${itemLines.join("\n")}\nQuestion: ${question}`,
    },
  ]);
  const parsed = llmCitationSchema.safeParse(data);
  if (!parsed.success) {
    return {
      answer: "Could not parse the model's response.",
      citations: [],
      verified: false,
    };
  }
  const citations: Citation[] = [];
  let verified = true;
  const seen = new Set<string>();
  for (const { key } of parsed.data.citations) {
    if (seen.has(key)) continue;
    seen.add(key);
    const f = findField(ctx.fields, key);
    if (f?.bbox) citations.push({ key, bbox: f.bbox, label: key });
    else verified = false; // unknown key or no bbox → not grounded
  }
  if (citations.length === 0) verified = false;
  return {
    answer: parsed.data.answer,
    value: parsed.data.value,
    citations,
    verified,
  };
}

export async function answerQuestion(
  ctx: DocContext,
  question: string,
  chat: ChatFn = chatJSON,
): Promise<Answer> {
  switch (classifyQuestion(question)) {
    case "total": {
      const a = solveTotal(ctx.fields);
      if (a) return a;
      break;
    }
    case "gst": {
      const a = solveGst(ctx.fields);
      if (a) return a;
      break;
    }
    case "mismatch": {
      const a = solveMismatch(ctx);
      if (a) return a;
      break;
    }
    case "freeform":
      break;
  }
  // Deterministic path had no data → fall back to LLM (may say what's missing).
  return solveFreeform(ctx, question, chat);
}

/** Validate an Answer against the shared contract before responding. */
export function toResponse(a: Answer): Record<string, unknown> {
  return qaResponseSchema.parse(a);
}
