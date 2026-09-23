import { loadEnv } from "./env.js";

export class GroqError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

/** Minimal Groq client over the OpenAI-compatible endpoint (no SDK needed). */
export async function chatJSON<T = Record<string, unknown>>(
  messages: ChatMessage[],
  opts?: { model?: string; maxTokens?: number },
): Promise<{ data: T; model: string; latencyMs: number }> {
  const env = loadEnv();
  if (!env.GROQ_API_KEY) throw new GroqError(500, "GROQ_API_KEY is not set");
  const model = opts?.model ?? env.GROQ_STRUCTURE_MODEL;
  const start = Date.now();
  let res: Response;
  try {
    res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.GROQ_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        response_format: { type: "json_object" },
        temperature: 0,
        max_tokens: opts?.maxTokens ?? 1024,
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    throw new GroqError(
      503,
      `groq unreachable: ${err instanceof Error ? err.message : err}`,
    );
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new GroqError(
      res.status,
      `groq ${res.status}: ${detail.slice(0, 300)}`,
    );
  }
  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = body.choices?.[0]?.message?.content ?? "";
  try {
    const data = JSON.parse(stripFences(content)) as T;
    return { data, model, latencyMs: Date.now() - start };
  } catch {
    throw new GroqError(
      502,
      `groq returned non-JSON: ${content.slice(0, 200)}`,
    );
  }
}

function stripFences(text: string): string {
  const t = text.trim();
  if (!t.startsWith("```")) return t;
  return t
    .split("\n")
    .filter((ln) => !ln.trim().startsWith("```"))
    .join("\n")
    .trim();
}
