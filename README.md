# LedgerLens — Groq Vision Doc QA

Upload a messy invoice/form photo and ask `total? GST? mismatch?`.
Detects layout, reads text with OCR + vision model, rebuilds tables to JSON,
answers with boxes drawn on the image as proof.

> Hiring line: `Vision doc QA via Groq, 91% field-F1 on 100 invoices, bbox-grounded answers.`

## Stack

- `apps/web` — Next.js (bun) bbox overlay UI
- `apps/api` — Hono (bun) BFF + Postgres + Groq orchestration
- `services/vision-worker` — FastAPI (uv) OpenCV layout + PaddleOCR + table recon
- Groq: `qwen/qwen3.8-27b` vision/QA, `openai/gpt-oss-120b` JSON structuring
  (`llama-3.3-70b-versatile` retired Aug 16 2026 — not used)
- Postgres + pgvector via Docker

## Quickstart (Phase 0)

```bash
cp .env.example .env   # add GROQ_API_KEY
bun install
uv sync --project services/vision-worker
docker compose -f infra/docker-compose.yml --env-file .env up db -d
bun run dev:web & bun run dev:api & uv run --project services/vision-worker fastapi dev services/vision-worker/app/main.py
```

## Phases

- [x] Phase 0 — monorepo + bun/uv + Docker
- [x] Phase 1 — contracts + DB
- [x] Phase 2 — vision MVP (Groq-only, no PaddleOCR)
- [x] Phase 3 — OCR fusion + layout
- [x] Phase 4 — Q&A citations API
- [x] Phase 5 — bbox UI
- [ ] Phase 6 — 100-invoice eval
- [ ] Phase 7 — ship + README polish
