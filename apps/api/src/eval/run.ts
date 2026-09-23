/** End-to-end invoice eval: upload GT invoices, score fields/bboxes/items + QA.
 *
 * Usage:
 *   bun run src/eval/run.ts --labels datasets/v1/labels.jsonl [--limit 10] [--concurrency 4] [--qa 20]
 *
 * Requires: API + worker + DB running, GROQ_API_KEY set for the worker.
 * Writes results JSON next to labels (results.json) and prints a markdown table.
 */

import { isAbsolute, join, resolve } from "node:path";
import { repoRoot } from "../lib/paths.js";
import { type BBox, normNum, prf, scoreFields, scoreItems } from "./score.js";

interface Args {
  labels: string;
  api: string;
  limit: number;
  concurrency: number;
  qa: number;
  out: string;
}

function parseArgs(): Args {
  // Supports --key value, --key=value, and boolean --flag.
  const raw = process.argv.slice(2);
  const a: Record<string, string> = {};
  for (let i = 0; i < raw.length; i++) {
    const tok = raw[i];
    if (!tok.startsWith("--")) continue;
    const eq = tok.indexOf("=");
    if (eq !== -1) {
      a[tok.slice(2, eq)] = tok.slice(eq + 1);
    } else if (i + 1 < raw.length && !raw[i + 1].startsWith("--")) {
      a[tok.slice(2)] = raw[++i];
    } else {
      a[tok.slice(2)] = "true";
    }
  }
  const labels = (a.labels as string) ?? "datasets/v1/labels.jsonl";
  // `bun run --filter api` sets cwd to apps/api — resolve relative paths at repo root.
  const absLabels = isAbsolute(labels) ? labels : resolve(repoRoot(), labels);
  const rawOut = (a.out as string) ?? join(absLabels, "..", "results.json");
  return {
    labels: absLabels,
    api: (
      (a.api as string) ??
      process.env.API_URL ??
      "http://localhost:8787"
    ).replace(/\/$/, ""),
    limit: Number(a.limit ?? Infinity),
    concurrency: Number(a.concurrency ?? 4),
    qa: Number(a.qa ?? 20),
    out: isAbsolute(rawOut) ? rawOut : resolve(repoRoot(), rawOut),
  };
}

interface GtRow {
  id: string;
  file: string;
  tier: string;
  vendor: string;
  invoice_no: string;
  date: string;
  subtotal: number;
  gst: number;
  total: number;
  fields: Record<
    string,
    { value: string; bbox: { x: number; y: number; w: number; h: number } }
  >;
  line_items: {
    desc: string;
    qty: number;
    rate: number;
    amount: number;
    bbox: BBox;
  }[];
}

interface ApiField {
  key: string;
  value: string;
  bbox: { x: number; y: number; w: number; h: number } | null;
}

async function upload(api: string, imgPath: string): Promise<string> {
  const buf = await Bun.file(imgPath).arrayBuffer();
  const form = new FormData();
  form.append("file", new File([buf], "inv.png", { type: "image/png" }));
  const res = await fetch(`${api}/documents/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok)
    throw new Error(
      `upload ${res.status}: ${(await res.text()).slice(0, 200)}`,
    );
  const body = (await res.json()) as { id: string; status: string };
  return body.id;
}

async function fetchDoc(
  api: string,
  id: string,
): Promise<{ fields: ApiField[]; vision: Record<string, unknown> }> {
  const res = await fetch(`${api}/documents/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  const doc = (await res.json()) as {
    fields: ApiField[];
    vision_json: Record<string, unknown>;
    status: string;
  };
  if (doc.status !== "ready") throw new Error(`status=${doc.status}`);
  return { fields: doc.fields, vision: doc.vision_json ?? {} };
}

async function ask(
  api: string,
  id: string,
  question: string,
): Promise<string | null> {
  const res = await fetch(`${api}/qa`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ doc_id: id, question }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { value?: string };
  return body.value ?? null;
}

interface DocResult {
  id: string;
  tier: string;
  ok: boolean;
  error?: string;
  latencyMs: number;
  fieldScores: {
    key: string;
    tp: number;
    fp: number;
    fn: number;
    ious: number[];
  }[];
  items: { tp: number; fp: number; fn: number };
  qaTotal?: boolean;
  qaMismatch?: boolean;
}

async function evalOne(
  api: string,
  imgDir: string,
  gt: GtRow,
  doQa: boolean,
): Promise<DocResult> {
  const start = Date.now();
  try {
    const id = await upload(api, join(imgDir, gt.file));
    const { fields, vision } = await fetchDoc(api, id);
    const fieldScores = scoreFields(fields, gt.fields);
    const items = scoreItems(
      ((vision.line_items as unknown[]) ?? []) as {
        desc?: string;
        amount?: number;
      }[],
      gt.line_items,
    );
    const r: DocResult = {
      id: gt.id,
      tier: gt.tier,
      ok: true,
      latencyMs: Date.now() - start,
      fieldScores,
      items,
    };
    if (doQa) {
      const totalVal = await ask(api, id, "total?");
      const t = totalVal !== null ? normNum(totalVal) : null;
      r.qaTotal =
        t !== null && Math.abs(t - gt.total) <= Math.max(0.5, gt.total * 0.01);
      r.qaMismatch = (await ask(api, id, "mismatch?")) === "ok";
    }
    return r;
  } catch (e) {
    // Total failure (upload/vision error) → all GT fields count as FN.
    const fieldScores = Object.entries(gt.fields).map(([key]) => ({
      key,
      tp: 0,
      fp: 0,
      fn: 1,
      ious: [] as number[],
    }));
    return {
      id: gt.id,
      tier: gt.tier,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      latencyMs: Date.now() - start,
      fieldScores,
      items: { tp: 0, fp: 0, fn: gt.line_items.length },
    };
  }
}

async function main(): Promise<void> {
  const args = parseArgs();
  const imgDir = join(args.labels, "..", "images");
  const rows = (await Bun.file(args.labels).text())
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as GtRow)
    .slice(0, args.limit);
  console.log(
    `eval: ${rows.length} docs, concurrency=${args.concurrency}, qa-subset=${args.qa}`,
  );

  const results: DocResult[] = new Array(rows.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < rows.length) {
      const i = next++;
      const n = rows[i];
      results[i] = await evalOne(args.api, imgDir, n, i < args.qa);
      const done = results.filter(Boolean).length;
      if (done % 10 === 0 || done === rows.length)
        console.log(`  ${done}/${rows.length}…`);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(args.concurrency, rows.length) }, worker),
  );

  // Aggregate
  const byKey = new Map<
    string,
    { tp: number; fp: number; fn: number; ious: number[] }
  >();
  const byTier = new Map<string, { tp: number; fp: number; fn: number }>();
  let itp = 0,
    ifp = 0,
    ifn = 0;
  let qaT = 0,
    qaTOK = 0,
    qaM = 0,
    qaMOK = 0,
    failed = 0;
  let lat: number[] = [];
  for (const r of results) {
    lat.push(r.latencyMs);
    if (!r.ok) failed++;
    for (const s of r.fieldScores) {
      const k = byKey.get(s.key) ?? {
        tp: 0,
        fp: 0,
        fn: 0,
        ious: [] as number[],
      };
      k.tp += s.tp;
      k.fp += s.fp;
      k.fn += s.fn;
      k.ious.push(...s.ious);
      byKey.set(s.key, k);
      const t = byTier.get(r.tier) ?? { tp: 0, fp: 0, fn: 0 };
      t.tp += s.tp;
      t.fp += s.fp;
      t.fn += s.fn;
      byTier.set(r.tier, t);
    }
    itp += r.items.tp;
    ifp += r.items.fp;
    ifn += r.items.fn;
    if (r.qaTotal !== undefined) {
      qaT++;
      if (r.qaTotal) qaTOK++;
    }
    if (r.qaMismatch !== undefined) {
      qaM++;
      if (r.qaMismatch) qaMOK++;
    }
  }
  const keys = [...byKey.keys()].sort();
  let mtp = 0,
    mfp = 0,
    mfn = 0,
    f1sum = 0;
  const keyRows = keys.flatMap((k) => {
    const s = byKey.get(k);
    if (!s) return [];
    const { p, r, f1 } = prf(s.tp, s.fp, s.fn);
    const miou = s.ious.length
      ? s.ious.reduce((a, b) => a + b, 0) / s.ious.length
      : 0;
    mtp += s.tp;
    mfp += s.fp;
    mfn += s.fn;
    f1sum += f1;
    return [{ key: k, p, r, f1, miou, n: s.tp + s.fn, ious: s.ious }];
  });
  const micro = prf(mtp, mfp, mfn);
  const macroF1 = keys.length ? f1sum / keys.length : 0;
  const allIous = keyRows.flatMap((k) => k.ious);
  const mIoU = allIous.length
    ? allIous.reduce((a, b) => a + b, 0) / allIous.length
    : 0;
  const items = prf(itp, ifp, ifn);
  lat = lat.sort((a, b) => a - b);

  const out = {
    n: rows.length,
    failed,
    seed_note: "see datasets README for regeneration",
    microF1: micro.f1,
    macroF1,
    mIoU,
    perKey: keyRows,
    items,
    qa: {
      totalAcc: qaT ? qaTOK / qaT : 0,
      mismatchAcc: qaM ? qaMOK / qaM : 0,
      n: qaT,
    },
    tiers: [...byTier.entries()].map(([tier, s]) => ({
      tier,
      ...prf(s.tp, s.fp, s.fn),
    })),
    latencyMs: {
      p50: lat[Math.floor(lat.length * 0.5)],
      p95: lat[Math.floor(lat.length * 0.95)],
    },
  };
  await Bun.write(args.out, JSON.stringify({ ...out, docs: results }, null, 1));

  console.log("\n| field | P | R | F1 | mIoU | n |");
  console.log("|---|---|---|---|---|---|");
  for (const k of keyRows) {
    console.log(
      `| ${k.key} | ${k.p.toFixed(2)} | ${k.r.toFixed(2)} | ${k.f1.toFixed(2)} | ${k.miou.toFixed(2)} | ${k.n} |`,
    );
  }
  console.log(
    `\nfield-F1 micro=${micro.f1.toFixed(3)} macro=${macroF1.toFixed(3)} mIoU=${mIoU.toFixed(3)}`,
  );
  console.log(
    `line-items P=${items.p.toFixed(2)} R=${items.r.toFixed(2)} F1=${items.f1.toFixed(2)}`,
  );
  console.log(
    `qa total-acc=${qaT ? (qaTOK / qaT).toFixed(2) : "—"} mismatch-acc=${qaM ? (qaMOK / qaM).toFixed(2) : "—"} (n=${qaT})`,
  );
  console.log(
    `tiers: ${out.tiers.map((t) => `${t.tier}=${t.f1.toFixed(2)}`).join(" ")}`,
  );
  console.log(
    `latency p50=${out.latencyMs.p50}ms p95=${out.latencyMs.p95}ms failed=${failed}`,
  );
  console.log(`results → ${args.out}`);
}

await main();
