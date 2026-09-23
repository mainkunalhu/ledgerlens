import { loadEnv } from "./env.js";

export interface WorkerField {
  key: string;
  value: string;
  bbox: { x: number; y: number; w: number; h: number } | null;
  confidence: number;
  source: string;
}

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface WorkerInferResult {
  ok: boolean;
  vision_json: { [key: string]: JsonValue };
  fields: WorkerField[];
  model: string;
  latency_ms: number;
}

export class WorkerError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** POST the stored image to the vision worker. Throws WorkerError on failure. */
export async function inferImage(
  absPath: string,
  mime: string,
  filename: string,
): Promise<WorkerInferResult> {
  const env = loadEnv();
  const bytes = await Bun.file(absPath).arrayBuffer();
  const form = new FormData();
  form.append("file", new File([bytes], filename, { type: mime }));

  let res: Response;
  try {
    res = await fetch(`${env.WORKER_URL}/infer`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(90_000),
    });
  } catch (err) {
    throw new WorkerError(
      503,
      `worker unreachable at ${env.WORKER_URL}: ${err instanceof Error ? err.message : err}`,
    );
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new WorkerError(
      res.status,
      `worker ${res.status}: ${detail.slice(0, 300)}`,
    );
  }
  const body = (await res.json()) as WorkerInferResult;
  if (!body.ok) throw new WorkerError(502, "worker returned ok:false");
  return body;
}
