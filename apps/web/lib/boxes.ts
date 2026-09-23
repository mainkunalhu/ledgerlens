import type { BBox, DocumentDetail, OverlayBox } from "./types";

const KEY_COLORS: Record<string, string> = {
  total: "#22c55e",
  gst: "#f59e0b",
  subtotal: "#38bdf8",
  vendor: "#a78bfa",
  invoice_no: "#f472b6",
  date: "#94a3b8",
};

const FALLBACK = [
  "#34d399",
  "#fbbf24",
  "#60a5fa",
  "#c084fc",
  "#fb7185",
  "#2dd4bf",
];

export function colorFor(key: string, index = 0): string {
  return KEY_COLORS[key] ?? FALLBACK[index % FALLBACK.length];
}

/** Merge field boxes + vision line-item boxes into one overlay list. */
export function buildBoxes(doc: DocumentDetail): OverlayBox[] {
  const boxes: OverlayBox[] = [];
  doc.fields.forEach((f, i) => {
    if (!f.bbox) return;
    boxes.push({
      id: `field:${f.key}`,
      key: f.key,
      label: `${f.key}: ${f.value}`,
      bbox: f.bbox,
      color: colorFor(f.key, i),
    });
  });
  const items =
    (doc.vision_json?.line_items as
      | { desc?: string; bbox?: BBox }[]
      | undefined) ?? [];
  items.forEach((li, i) => {
    if (!li?.bbox) return;
    boxes.push({
      id: `item:${i}`,
      key: `line_items[${i}]`,
      label: li.desc ?? `item ${i + 1}`,
      bbox: li.bbox,
      color: colorFor(`item${i}`, boxes.length + i),
    });
  });
  return boxes;
}
