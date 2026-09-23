import Link from "next/link";
import { UploadDropzone } from "@/components/UploadDropzone";
import { listDocuments } from "@/lib/api";

export const dynamic = "force-dynamic";

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
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl">
          Upload a messy invoice. Ask{" "}
          <span className="font-mono text-emerald-300">
            total? GST? mismatch?
          </span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-400">
          Layout detect → OCR + vision cross-check → table JSON — every answer
          cites the box on the image it came from.
        </p>
      </header>

      <UploadDropzone />

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">
            Recent documents
          </h2>
          <span className="font-mono text-xs text-zinc-500">{total} total</span>
        </div>
        {documents.length === 0 ? (
          <p className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-sm text-zinc-500">
            No documents yet — upload your first invoice above.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {documents.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/documents/${d.id}`}
                  className="block rounded-xl border border-zinc-800 bg-zinc-950 p-4 transition-colors hover:border-emerald-700"
                >
                  <div className="truncate text-sm font-medium text-zinc-100">
                    {d.original_filename ?? d.id.slice(0, 8)}
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-zinc-500">
                    <span className="font-mono">{d.status}</span>
                    <span>{new Date(d.created_at).toLocaleString()}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
