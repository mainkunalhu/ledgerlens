"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getDocument, imageUrl } from "@/lib/api";
import { buildBoxes } from "@/lib/boxes";
import type { DocumentDetail } from "@/lib/types";
import { BboxOverlay } from "./BboxOverlay";
import { FieldsPanel } from "./FieldsPanel";
import { QAPanel } from "./QAPanel";

function statusTone(s: string): string {
  if (s === "ready")
    return "bg-emerald-950 text-emerald-300 border-emerald-800";
  if (s === "failed") return "bg-red-950 text-red-300 border-red-800";
  return "bg-amber-950 text-amber-300 border-amber-800";
}

/** Resolve a citation/field key to an overlay box id. */
function keyToBoxId(
  boxes: { id: string; key: string }[],
  key: string,
): string | null {
  return (
    boxes.find((b) => b.key === key)?.id ??
    boxes.find((b) => b.id === `field:${key}`)?.id ??
    null
  );
}

export function DocViewer({ id }: { id: string }) {
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getDocument(id)
      .then((d) => live && setDoc(d))
      .catch(
        (e) => live && setError(e instanceof Error ? e.message : "load failed"),
      );
    return () => {
      live = false;
    };
  }, [id]);

  const boxes = useMemo(() => (doc ? buildBoxes(doc) : []), [doc]);

  if (error) return <p className="p-8 text-sm text-red-400">{error}</p>;
  if (!doc)
    return (
      <p className="animate-pulse p-8 text-sm text-zinc-500">
        loading document…
      </p>
    );

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <Link href="/" className="text-sm text-zinc-400 hover:text-zinc-100">
          ← all documents
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold text-zinc-50">
          {doc.original_filename ?? doc.id}
        </h1>
        <span
          className={`rounded-full border px-2.5 py-0.5 font-mono text-xs ${statusTone(doc.status)}`}
        >
          {doc.status}
        </span>
      </header>

      {doc.status !== "ready" ? (
        <p className="rounded-xl border border-amber-800 bg-amber-950/40 p-4 text-sm text-amber-200">
          Document is {doc.status}.{" "}
          {doc.status === "failed"
            ? "Vision extraction failed — check the worker and re-upload."
            : "Still processing…"}
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)_minmax(0,3fr)]">
          <BboxOverlay
            src={imageUrl(id)}
            boxes={boxes}
            activeId={activeId}
            onSelect={setActiveId}
          />
          <div className="min-h-[420px]">
            <QAPanel
              docId={id}
              onCite={(key) => key && setActiveId(keyToBoxId(boxes, key))}
            />
          </div>
          <div className="min-h-[420px]">
            <FieldsPanel
              doc={doc}
              onSelect={(key) => key && setActiveId(keyToBoxId(boxes, key))}
            />
          </div>
        </div>
      )}
    </div>
  );
}
