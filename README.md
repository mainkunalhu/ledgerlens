# LedgerLens — Groq Vision Doc QA

Upload a messy invoice photo and ask `total? GST? mismatch?`. It detects layout,
reads the page with a vision model cross-checked against OCR, rebuilds tables to
JSON, and answers with boxes drawn on the image as proof.

## Demo

<video src="docs/assets/demo.mp4" controls width="100%"></video>

Can&apos;t see the video? [Watch it directly](./docs/assets/demo.mp4).

## Demo (60 seconds)

```bash
cp .env.example .env   # add GROQ_API_KEY
make up                # docker: db + worker + api + web
```

Or run everything natively with live logs (Ctrl-C stops the whole stack,
including docker):

```bash
make dev-all
make down              # stop everything
```

Open http://localhost:3000 → drop an invoice → open it → ask `mismatch?`.
Every answer cites the image box it came from (click a citation to spotlight it).

## How it works

```
photo ──▶ FastAPI worker ──▶ OpenCV layout (header/table/footer zones)
              │                PaddleOCR words (Docker x86, graceful fallback)
              │                Groq qwen3.8-27b vision → fields + bboxes
              ▼
        IoU fusion: OCR wins numeric disagreements,
        unverified boxes flagged (ocr_support: false)
              │
              ▼
Hono API ──▶ Postgres+pgvector (documents/fields/qa_log)
              │  deterministic total/GST/mismatch solvers
              │  freeform via gpt-oss-120b, citations verified vs stored boxes
              ▼
Next.js ──▶ bbox overlay viewer + Q&A chat + fields/JSON panel
```

## Stack

| Layer | Tech |
|---|---|
| UI | Next.js 16 + Tailwind v4 (bun) |
| BFF | Hono + Zod + Postgres (bun) |
| Vision | FastAPI + OpenCV + PaddleOCR (uv, lazy-loaded) |
| Models (Groq) | `qwen/qwen3.8-27b` vision · `openai/gpt-oss-120b` structuring/QA fallback |
| Data | Postgres 16 + pgvector (Docker) |

`llama-3.3-70b-versatile` was retired by Groq in Aug 2026 — not used; the
worker falls back to `llama-4-maverick` if a vision model is decommissioned.

## Local dev (no Docker)

```bash
bun install
uv sync --project services/vision-worker
docker-compose up db -d  # or: docker run pgvector/pgvector:pg16 ...
bun run dev:web & bun run dev:api &
GROQ_API_KEY=... uv run --project services/vision-worker \
  uvicorn app.main:app --app-dir services/vision-worker --port 8000
```

## Eval

Seeded 100-invoice set with ground-truth boxes (`datasets/v1`, regen from seed 42):

```bash
bun run --filter api eval -- --limit 100 --concurrency 4 --qa 20
```

Full report: [`EVAL.md`](./EVAL.md) — field-F1 micro/macro **1.000**, line-items
1.00, QA 20/20, bbox mIoU 0.208 with an honest grounding analysis (money-column
boxes skew left; OCR fusion is the mitigation, measured on x86 Docker).

## Repo map

```
apps/web            Next.js bbox overlay UI
apps/api            Hono API (upload → worker → store → Q&A)
services/vision-worker  FastAPI (layout, OCR, Groq vision, fusion)
packages/shared     zod contracts (bbox 0–1000 is the cross-service truth)
datasets/           generator + labels + results (images gitignored, regen via seed)
infra/              Dockerfiles + compose
EVAL.md             eval report
```

## Roadmap

- Photographed-invoice labels (handwriting, crumple, perspective) for a real-world F1
- OCR-fusion eval numbers from the `OCR=1` image
- pgvector similarity search across invoices ("find all Sept GST bills")
- Auth + multi-user workspaces
