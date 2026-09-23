import type { DocumentDetail, QAResponse, UploadResponse } from "./types";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
  "http://localhost:8787";

export function imageUrl(id: string): string {
  return `${API_URL}/documents/${id}/image`;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `request failed (${res.status})`,
    );
  }
  return res.json() as Promise<T>;
}

export async function listDocuments(limit = 12): Promise<{
  documents: DocumentDetail[];
  total: number;
}> {
  const res = await fetch(`${API_URL}/documents?limit=${limit}`, {
    cache: "no-store",
  });
  return json(res);
}

export async function uploadDocument(
  file: File,
): Promise<UploadResponse & { vision?: unknown }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_URL}/documents/upload`, {
    method: "POST",
    body: form,
  });
  return json(res);
}

export async function getDocument(id: string): Promise<DocumentDetail> {
  const res = await fetch(`${API_URL}/documents/${id}`, { cache: "no-store" });
  return json(res);
}

export async function askQuestion(
  docId: string,
  question: string,
): Promise<QAResponse> {
  const res = await fetch(`${API_URL}/qa`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ doc_id: docId, question }),
  });
  return json(res);
}
