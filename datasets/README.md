# Datasets

Synthetic invoice sets with ground-truth labels for the eval harness.

## v1 (current)

100 invoices, seed 42. Indian trader vendors, 1–4 line items, GST 5/12/18%,
two header layouts. Degradation tiers: clean 31, rotate 19, jpeg 17, noise 14,
dim 13, blur 6.

Regenerate identically:

```bash
uv run --project services/vision-worker datasets/generator/generate.py \
  --n 100 --seed 42 --out datasets/v1
```

## Label schema (`labels.jsonl`, one JSON per line)

```json
{
  "id": "inv_000", "file": "inv_000.png", "tier": "clean",
  "width": 760, "height": 980,
  "vendor": "SHARMA TRADERS", "invoice_no": "INV-2026-4507",
  "date": "2026-04-08", "gst_rate": 18,
  "subtotal": 5093.58, "gst": 916.84, "total": 6010.42,
  "fields": {
    "vendor": { "value": "SHARMA TRADERS", "bbox": { "x": 65.8, "y": 49, "w": 318.4, "h": 33.7 } }
  },
  "line_items": [
    { "desc": "Basmati Rice 5kg", "qty": 1, "rate": 614.05, "amount": 614.05, "bbox": { "...": 0 } }
  ]
}
```

All bboxes normalized 0–1000 (same space as the vision model). Rotation-tier
boxes are axis-aligned bounding boxes of the rotated text corners.

## Run the eval

```bash
# services first: DB + worker (GROQ_API_KEY) + API
bun run --filter api eval -- --limit 100 --concurrency 4 --qa 20
```

Results land in `datasets/v1/results.json`; see root `EVAL.md` for the report.

Note: `datasets/v1/images/` is gitignored (19 MB, reproducible from seed).
Commit `labels.jsonl` + `results.json`; regenerate images locally.
