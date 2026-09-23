"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { getDocument, imageUrl } from "@/lib/api";
import { buildBoxes } from "@/lib/boxes";
import type { DocumentDetail } from "@/lib/types";
import { BboxOverlay } from "./BboxOverlay";
import { FieldsPanel } from "./FieldsPanel";
import { QAPanel } from "./QAPanel";

function statusVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "ready") return "default";
  if (status === "failed") return "destructive";
  return "secondary";
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

  if (error) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Couldn&apos;t load this document</EmptyTitle>
          <EmptyDescription>{error}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  if (!doc) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 lg:grid-cols-12">
          <Skeleton className="min-h-100 lg:col-span-5" />
          <Skeleton className="min-h-100 lg:col-span-4" />
          <Skeleton className="min-h-100 lg:col-span-3" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button variant="outline" size="sm" render={<Link href="/" />}>
          <ArrowLeft className="size-4" />
          all documents
        </Button>
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight">
          {doc.original_filename ?? doc.id}
        </h1>
        <Badge variant={statusVariant(doc.status)}>{doc.status}</Badge>
      </header>

      {doc.status !== "ready" ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Document is {doc.status}</EmptyTitle>
            <EmptyDescription>
              {doc.status === "failed"
                ? "Vision extraction failed — check the worker and re-upload."
                : "Still processing… refresh in a moment."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-5">
            <BboxOverlay
              src={imageUrl(id)}
              boxes={boxes}
              activeId={activeId}
              onSelect={setActiveId}
            />
          </div>
          <div className="min-h-100 min-w-0 lg:col-span-4">
            <QAPanel
              docId={id}
              onCite={(key) => key && setActiveId(keyToBoxId(boxes, key))}
            />
          </div>
          <div className="min-h-100 min-w-0 lg:col-span-3">
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
