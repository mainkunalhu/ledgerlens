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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10">
      <header>
        <p className="font-mono text-xs uppercase tracking-widest text-emerald-400">
          LedgerLens · Groq Vision Doc QA
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Upload a messy invoice. Ask{" "}
          <span className="font-mono text-emerald-300">
            total? GST? mismatch?
          </span>
        </h1>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
          Layout detect → OCR + vision cross-check → table JSON — every answer
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
                <Link href={`/documents/${d.id}`}>
                  <Card>
                    <CardContent>
                      <div className="truncate text-sm font-medium">
                        {d.original_filename ?? d.id.slice(0, 8)}
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <Badge variant={statusVariant(d.status)}>
                          {d.status}
                        </Badge>
                        <span className="truncate font-mono text-xs text-zinc-500">
                          {new Date(d.created_at).toLocaleString()}
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
