import { Hono } from "hono";

export const qa = new Hono();

// Phase 0 stub — bbox-cited Q&A lands in Phase 4.
qa.post("/", (c) =>
  c.json(
    {
      answer: null,
      citations: [],
      note: "Phase 4: total? GST? mismatch? via Groq",
    },
    501,
  ),
);
