# LedgerLens Eval — 100-invoice report

> Hiring line: `Vision doc QA via Groq, 100% field-F1 on 100 synthetic invoices, bbox-grounded answers.`

Model: `qwen/qwen3.8-27b` (vision + fields), QA fallback `openai/gpt-oss-120b`.
Dataset: `datasets/v1` — 100 seeded synthetic invoices (seed 42), GT value bboxes
in 0–1000 coords. Regen: see `datasets/README.md`. Raw scores:
`datasets/v1/results.json`.

Run: `bun run --filter api eval -- --limit 100 --concurrency 4 --qa 20`
(DB + worker with `GROQ_API_KEY` + API running; 0 failed docs).

## Field extraction

| field | P | R | F1 | mIoU | n |
|---|---|---|---|---|---|
| date | 1.00 | 1.00 | 1.00 | 0.32 | 100 |
| gst | 1.00 | 1.00 | 1.00 | 0.00 | 100 |
| invoice_no | 1.00 | 1.00 | 1.00 | 0.37 | 100 |
| subtotal | 1.00 | 1.00 | 1.00 | 0.00 | 100 |
| total | 1.00 | 1.00 | 1.00 | 0.00 | 100 |
| vendor | 1.00 | 1.00 | 1.00 | 0.55 | 100 |

**field-F1 micro = 1.000, macro = 1.000 · bbox mIoU = 0.208 (matched fields)**

Match rules: money within max(0.5, 1%); text normalized-exact; IoU on 0–1000 boxes.

## Line items & Q&A

- Line-item rows (desc + amount): P = 1.00, R = 1.00, F1 = 1.00
- `total?` accuracy: 1.00 (n = 20) · `mismatch?` accuracy: 1.00 (n = 20)

## Robustness by degradation tier (field-F1)

| tier | F1 |
|---|---|
| clean (31) | 1.00 |
| rotate ±4° (19) | 1.00 |
| jpeg q45 (17) | 1.00 |
| noise σ5 (14) | 1.00 |
| dim ×0.82–0.95 (13) | 1.00 |
| blur (6) | 1.00 |

End-to-end latency (upload → Groq → stored): p50 7.2 s, p95 29.8 s.

## Grounding analysis (the honest part)

Values extract perfectly, but box grounding is weak where it matters most:
money fields (subtotal/gst/total, right column) score mIoU ≈ 0.00 — predictions
are systematically shifted left of the true value boxes, while header fields
reach 0.27–0.55. A prompt ablation stressing first-digit anchoring
(`datasets/v1/results_prompt2.json`, n = 10) moved mIoU 0.25 → 0.20: no gain,
so the bias is systematic, not instruction-fixable in one shot.

Mitigations already in the pipeline for exactly this reason (Phases 3–4):

- OCR fusion cross-checks every vision box against glyph boxes (IoU match,
  OCR wins numeric disagreements, `ocr_support: False` + halved confidence
  otherwise) — unevaluated locally because PaddleOCR needs x86 Docker;
  measure with `docker build --build-arg OCR=1` + this same harness.
- Q&A citations resolve against stored boxes; unknown/unlocated keys are
  dropped and mark the answer `verified: false`.

## Limitations

- Synthetic Hershey text — no handwriting, crumples, perspective, stamps, or
  real camera noise. Treat 1.00 as a pipeline-correctness ceiling, not a
  real-world claim; the next dataset version should mix in photographed invoices.
- Single run, single seed; no confidence intervals.
- OCR-fusion path not exercised here (ARM Mac); vision-only numbers above.
