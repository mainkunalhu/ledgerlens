import { ChevronRight, FileText, ScanSearch } from "lucide-react";
import Link from "next/link";
import { UploadDropzone } from "@/components/UploadDropzone";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { listDocuments } from "@/lib/api";

export const dynamic = "force-dynamic";

function statusVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "ready") return "default";
  if (status === "failed") return "destructive";
  return "secondary";
}

export default async function Home() {
  const { documents, total } = await listDocuments(12).catch(() => ({
    documents: [],
    total: 0,
  }));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-6 sm:py-10">
      <nav className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-500 text-zinc-950">
            <ScanSearch className="size-4" />
          </span>
          <span className="text-sm font-semibold tracking-tight">
            LedgerLens
          </span>
        </div>
        <Badge variant="outline">Groq vision QA</Badge>
      </nav>

      <header className="max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-5xl sm:leading-tight">
          Upload a messy invoice. Ask{" "}
          <span className="font-mono font-semibold text-emerald-300">
            total? GST? mismatch?
          </span>
        </h1>
        <p className="text-muted-foreground mt-3 max-w-xl text-sm leading-relaxed sm:text-base">
          Layout detect → OCR + vision cross-check → table JSON. Every answer
          cites the box on the image it came from.
        </p>
      </header>

      <UploadDropzone />

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Recent documents</h2>
          <span className="font-mono text-xs text-zinc-500">{total} total</span>
        </div>
        {documents.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No documents yet</EmptyTitle>
              <EmptyDescription>
                Upload your first invoice above to get started.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {documents.map((d) => (
              <li key={d.id} className="min-w-0">
                <Link href={`/documents/${d.id}`} className="group block">
                  <Card>
                    <CardContent>
                      <div className="flex items-center gap-3">
                        <span className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg">
                          <FileText className="size-4 text-zinc-400" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">
                            {d.original_filename ?? d.id.slice(0, 8)}
                          </div>
                          <div className="truncate font-mono text-xs text-zinc-500">
                            {new Date(d.created_at).toLocaleString()}
                          </div>
                        </div>
                        <ChevronRight className="size-4 shrink-0 text-zinc-600 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-300" />
                      </div>
                      <Separator className="my-3" />
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant={statusVariant(d.status)}>
                          {d.status}
                        </Badge>
                        <span className="font-mono text-xs text-zinc-600">
                          {d.id.slice(0, 8)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
