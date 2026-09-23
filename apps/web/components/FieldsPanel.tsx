"use client";

import { useState } from "react";
import { colorFor } from "@/lib/boxes";
import type { DocumentDetail } from "@/lib/types";

function confColor(c: number): string {
  if (c >= 0.8) return "bg-emerald-500";
  if (c >= 0.5) return "bg-amber-500";
  return "bg-red-500";
}

export function FieldsPanel({
  doc,
  onSelect,
}: {
  doc: DocumentDetail;
  onSelect: (key: string | null) => void;
}) {
  const [tab, setTab] = useState<"fields" | "json">("fields");
  const items =
    (doc.vision_json?.line_items as
      | { desc?: string; qty?: number; rate?: number; amount?: number }[]
      | undefined) ?? [];

  return (
    <div className="flex h-full flex-col rounded-xl border border-zinc-800 bg-zinc-950">
      <div className="flex gap-1 border-b border-zinc-800 px-3 pt-2">
        {(["fields", "json"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-t-lg px-3 py-2 text-sm font-medium ${
              tab === t
                ? "bg-zinc-900 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t === "fields" ? `Fields (${doc.fields.length})` : "JSON"}
          </button>
        ))}
      </div>

      {tab === "fields" ? (
        <div className="flex-1 overflow-y-auto p-3">
          <table className="w-full text-sm">
            <tbody>
              {doc.fields.map((f, i) => (
                <tr
                  key={f.id ?? `${f.key}-${f.value}`}
                  className="border-b border-zinc-900 last:border-0"
                >
                  <td className="py-2 pr-2">
                    <button
                      type="button"
                      onClick={() => onSelect(f.bbox ? f.key : null)}
                      className="flex items-center gap-2 text-left"
                    >
                      <span
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{ backgroundColor: colorFor(f.key, i) }}
                      />
                      <span className="font-mono text-xs text-zinc-400">
                        {f.key}
                      </span>
                    </button>
                    <div className="mt-1 font-medium text-zinc-100">
                      {f.value}
                    </div>
                  </td>
                  <td className="w-24 py-2 pl-2 align-top">
                    <div className="h-1.5 overflow-hidden rounded bg-zinc-800">
                      <div
                        className={`h-full ${confColor(f.confidence)}`}
                        style={{ width: `${Math.round(f.confidence * 100)}%` }}
                      />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-500">
                      <span>{Math.round(f.confidence * 100)}%</span>
                      <span className="rounded border border-zinc-800 px-1">
                        {f.source}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
              {doc.fields.length === 0 && (
                <tr>
                  <td className="py-4 text-zinc-500">no fields extracted</td>
                </tr>
              )}
            </tbody>
          </table>

          {items.length > 0 && (
            <>
              <h3 className="mt-4 mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Line items ({items.length})
              </h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase text-zinc-600">
                    <th className="pb-1 font-medium">Desc</th>
                    <th className="pb-1 text-right font-medium">Qty</th>
                    <th className="pb-1 text-right font-medium">Rate</th>
                    <th className="pb-1 text-right font-medium">Amt</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((li) => (
                    <tr
                      key={`${li.desc}-${li.qty}-${li.rate}-${li.amount}`}
                      className="border-t border-zinc-900 text-zinc-200"
                    >
                      <td className="py-1.5 pr-2">{li.desc}</td>
                      <td className="py-1.5 text-right font-mono text-xs">
                        {li.qty}
                      </td>
                      <td className="py-1.5 text-right font-mono text-xs">
                        {li.rate}
                      </td>
                      <td className="py-1.5 text-right font-mono text-xs">
                        {li.amount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {doc.fused_json && (
            <p className="mt-3 text-[11px] text-zinc-600">
              OCR support rate:{" "}
              {Math.round((doc.fused_json.ocr_support_rate ?? 0) * 100)}%{" · "}
              layout: {doc.fused_json.layout?.method ?? "—"}
            </p>
          )}
        </div>
      ) : (
        <pre className="flex-1 overflow-auto p-3 font-mono text-[11px] leading-relaxed text-zinc-300">
          {JSON.stringify(doc.vision_json, null, 2)}
        </pre>
      )}
    </div>
  );
}
