"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { askQuestion } from "@/lib/api";
import type { ChatMessage } from "@/lib/types";

const CHIPS = ["total?", "GST?", "mismatch?"];

interface Props {
  docId: string;
  onCite: (key: string | null) => void;
}

type StampedMessage = ChatMessage & { id: number };

export function QAPanel({ docId, onCite }: Props) {
  const [messages, setMessages] = useState<StampedMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextId, setNextId] = useState(0);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const id = nextId;
    setNextId(id + 2);
    setBusy(true);
    setError(null);
    setMessages((m) => [...m, { id, role: "user", text: q }]);
    setInput("");
    try {
      const r = await askQuestion(docId, q);
      setMessages((m) => [
        ...m,
        {
          id: id + 1,
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
    <Card className="flex h-full min-h-100 flex-col">
      <CardHeader>
        <CardTitle>Ask the invoice</CardTitle>
        <div className="flex flex-wrap gap-2">
          {CHIPS.map((c) => (
            <Button
              key={c}
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => ask(c)}
            >
              {c}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-3 pr-4">
              {messages.length === 0 && (
                <p className="text-sm text-zinc-500">
                  Ask <span className="font-mono">total? GST? mismatch?</span> —
                  every answer cites the box on the image it came from.
                </p>
              )}
              {messages.map((m) =>
                m.role === "user" ? (
                  <div
                    key={m.id}
                    className="ml-auto w-fit max-w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm"
                  >
                    {m.text}
                  </div>
                ) : (
                  <div
                    key={m.id}
                    className="w-fit max-w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
                  >
                    <p>{m.text}</p>
                    {m.citations && m.citations.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Tooltip>
                          <TooltipTrigger>
                            <span
                              className={
                                m.verified
                                  ? "text-emerald-400"
                                  : "text-amber-400"
                              }
                            >
                              {m.verified ? "✓" : "!"}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {m.verified
                              ? "grounded in image boxes"
                              : "not fully grounded"}
                          </TooltipContent>
                        </Tooltip>
                        {m.citations.map((cit) => (
                          <Badge
                            key={cit.key}
                            variant="outline"
                            render={
                              <button
                                type="button"
                                onClick={() => onCite(cit.key)}
                              />
                            }
                          >
                            {cit.label || cit.key}
                          </Badge>
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
          </ScrollArea>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. who is the vendor?"
              className="min-w-0 flex-1"
            />
            <Button type="submit" disabled={busy || !input.trim()}>
              Ask
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
