import { Hono } from "hono";

export const documents = new Hono();

// Phase 0 stub — full upload + Groq orchestration lands in Phase 1/2.
documents.get("/", (c) =>
  c.json({ documents: [], note: "Phase 1: list from Postgres" }),
);
documents.post("/upload", (c) =>
  c.json(
    {
      id: "stub",
      note: "Phase 1: accept multipart, save to STORAGE_DIR, insert row",
    },
    501,
  ),
);
documents.get("/:id", (c) =>
  c.json({ id: c.req.param("id"), note: "Phase 1: fetch fused_json + fields" }),
);
