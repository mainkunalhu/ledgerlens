"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { uploadDocument } from "@/lib/api";

const ACCEPT = "image/jpeg,image/png,image/webp";

/** Drag-drop upload. The POST itself runs Groq vision — show progress meanwhile. */
export function UploadDropzone() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await uploadDocument(file);
      router.push(`/documents/${r.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "upload failed");
      setBusy(false);
    }
  }

  return (
    <div>
      <Card>
        <CardContent>
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              send(e.dataTransfer.files?.[0]);
            }}
            className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
              drag
                ? "border-emerald-400 bg-emerald-950/30"
                : "border-zinc-700 hover:border-zinc-500"
            } ${busy ? "cursor-wait opacity-80" : "cursor-pointer"}`}
          >
            {busy ? (
              <>
                <Spinner />
                <span className="text-sm font-medium">
                  Analyzing with Groq vision…
                </span>
                <span className="text-xs text-zinc-500">
                  layout → OCR cross-check → table JSON (up to a minute)
                </span>
              </>
            ) : (
              <>
                <Upload className="size-6 text-zinc-400" />
                <span className="text-sm font-medium">
                  Drop an invoice photo, or click to browse
                </span>
                <span className="text-xs text-zinc-500">
                  JPG / PNG / WebP · messy photos welcome
                </span>
              </>
            )}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => send(e.target.files?.[0])}
          />
        </CardContent>
      </Card>
      <div className="mt-2 flex items-center justify-between">
        {error ? <p className="text-sm text-red-400">{error}</p> : <span />}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          Browse files
        </Button>
      </div>
    </div>
  );
}
