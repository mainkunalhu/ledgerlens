/** Pure scoring functions for the invoice eval. No I/O — fully unit-tested. */

export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PredField {
  key: string;
  value: string;
  bbox: BBox | null;
}

export interface GtField {
  value: string;
  bbox: BBox;
}

export interface GtItem {
  desc: string;
  qty: number;
  rate: number;
  amount: number;
  bbox: BBox;
}

export interface PredItem {
  desc?: string;
  qty?: number | null;
  rate?: number | null;
  amount?: number | null;
  bbox?: BBox | null;
}

export const NUMERIC_KEYS = new Set(["subtotal", "gst", "total"]);

export function normText(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function normNum(s: string): number | null {
  const n = Number(s.replace(/[₹,\s]/g, "").replace(/\/-$/, ""));
  return Number.isFinite(n) ? n : null;
}

/** Field value match: numeric tolerance for money, normalized-exact for text. */
export function fieldMatches(key: string, pred: string, gt: string): boolean {
  if (NUMERIC_KEYS.has(key)) {
    const p = normNum(pred);
    const g = normNum(gt);
    if (p === null || g === null) return false;
    return Math.abs(p - g) <= Math.max(0.5, Math.abs(g) * 0.01);
  }
  return normText(pred) === normText(gt) && normText(gt).length > 0;
}

export function iou(a: BBox, b: BBox): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

export interface FieldScore {
  key: string;
  tp: number;
  fp: number;
  fn: number;
  ious: number[];
}

/** Score one doc's fields. pred lookup by key; missing pred = FN, wrong value = FP+FN. */
export function scoreFields(
  pred: PredField[],
  gt: Record<string, GtField>,
): FieldScore[] {
  const byKey = new Map(pred.map((p) => [p.key, p]));
  return Object.entries(gt).map(([key, g]) => {
    const p = byKey.get(key);
    if (!p) return { key, tp: 0, fp: 0, fn: 1, ious: [] };
    if (!fieldMatches(key, p.value, g.value))
      return { key, tp: 0, fp: 1, fn: 1, ious: [] };
    return {
      key,
      tp: 1,
      fp: 0,
      fn: 0,
      ious: p.bbox ? [iou(p.bbox, g.bbox)] : [],
    };
  });
}

export function prf(
  tp: number,
  fp: number,
  fn: number,
): { p: number; r: number; f1: number } {
  const p = tp + fp === 0 ? 0 : tp / (tp + fp);
  const r = tp + fn === 0 ? 0 : tp / (tp + fn);
  return { p, r, f1: p + r === 0 ? 0 : (2 * p * r) / (p + r) };
}

/** Greedy line-item match: desc similarity + amount tolerance. Returns TP/FP/FN. */
export function scoreItems(
  pred: PredItem[],
  gt: GtItem[],
): { tp: number; fp: number; fn: number } {
  const used = new Set<number>();
  let tp = 0;
  for (const p of pred) {
    let best = -1;
    let bestScore = 0;
    gt.forEach((g, i) => {
      if (used.has(i)) return;
      const descOk =
        p.desc !== undefined &&
        normText(p.desc).length > 0 &&
        normText(p.desc) === normText(g.desc);
      const amtOk =
        p.amount !== undefined &&
        p.amount !== null &&
        Math.abs(Number(p.amount) - g.amount) <= Math.max(0.5, g.amount * 0.01);
      const s = (descOk ? 0.6 : 0) + (amtOk ? 0.4 : 0);
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    });
    if (bestScore >= 1.0) {
      used.add(best);
      tp++;
    }
  }
  return { tp, fp: pred.length - tp, fn: gt.length - tp };
}
