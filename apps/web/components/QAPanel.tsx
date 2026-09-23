"use client";

import { useState } from "react";
import { askQuestion } from "@/lib/api";
import type { ChatMessage } from "@/lib/types";

const CHIPS = ["total?", "GST?", "mismatch?"];

interface Props {
  docId: string;
  onCite: (key: string | null) => void;
}

export function QAPanel({ docId, onCite }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    setMessages((m) => [...m, { role: "user", text: q }]);
    setInput("");
    try {
      const r = await askQuestion(docId, q);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: r.answer,
          value: r.value,
          citations: r.citations,
          verified: r.verified,
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "question failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col rounded-xl border border-zinc-800 bg-zinc-950">
      <div className="border-b border-zinc-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-100">Ask the invoice</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              disabled={busy}
              onClick={() => ask(c)}
              className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs font-medium text-zinc-200 transition-colors hover:border-emerald-500 hover:text-emerald-300 disabled:opacity-50"
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <p className="text-sm text-zinc-500">
            Ask{" "}
            <span className="font-mono text-zinc-400">
              total? GST? mismatch?
            </span>{" "}
            — every answer cites the box on the image it came from.
          </p>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div
              key={i}
              className="ml-auto w-fit max-w-[90%] rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
            >
              {m.text}
            </div>
          ) : (
            <div
              key={i}
              className="w-fit max-w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200"
            >
              <p>{m.text}</p>
              {m.citations && m.citations.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span
                    className={
                      m.verified ? "text-emerald-400" : "text-amber-400"
                    }
                    title={
                      m.verified
                        ? "grounded in image boxes"
                        : "not fully grounded"
                    }
                  >
                    {m.verified ? "✓" : "!"}
                  </span>
                  {m.citations.map((cit, j) => (
                    <button
                      key={j}
                      type="button"
                      onClick={() => onCite(cit.key)}
                      className="rounded border border-zinc-700 px-1.5 py-0.5 font-mono text-[11px] text-sky-300 hover:border-sky-500"
                    >
                      {cit.label || cit.key}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ),
        )}
        {busy && (
          <p className="animate-pulse text-sm text-zinc-500">
            reading invoice…
          </p>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      <form
        className="flex gap-2 border-t border-zinc-800 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. who is the vendor?"
          className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          Ask
        </button>
      </form>
    </div>
  );
}
