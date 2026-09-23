"""Synthetic invoice generator with ground-truth labels.

Renders invoices with cv2 Hershey text (seeded RNG), records exact value
bboxes in 0-1000 coords, applies degradation tiers (blur/noise/rotation/
brightness/JPEG). Deterministic: same seed → identical dataset.

Usage:
  uv run --project services/vision-worker datasets/generator/generate.py \
    --n 100 --seed 42 --out datasets/v1

Output: images/inv_000.png ... + labels.jsonl (one GT row per line).
"""

from __future__ import annotations

import argparse
import json
import math
import random
from pathlib import Path

import cv2
import numpy as np

VENDORS = [
    "SHARMA TRADERS", "GUPTA SONS", "PATEL ENTERPRISES", "KHANNA MART",
    "MEHTA DISTRIBUTORS", "AGARWAL & CO", "SINGH PROVISIONS", "REDDY FOODS",
    "NAIR SUPPLY HOUSE", "DAS GENERAL STORE", "KULKARNI TRADERS", "BOSE & SONS",
]

PRODUCTS = [
    ("Basmati Rice 5kg", 600, 750), ("Mustard Oil 1L", 150, 220),
    ("Atta 10kg", 380, 480), ("Sugar 5kg", 200, 260),
    ("Toor Dal 2kg", 280, 360), ("Soap Bar Pack", 120, 180),
    ("Tea Powder 500g", 220, 300), ("Salt 1kg", 25, 40),
    ("Detergent 2kg", 190, 250), ("Biscuits dozen", 90, 140),
]

GST_RATES = [18, 18, 18, 12, 5]
TIERS = ["clean"] * 40 + ["blur", "noise", "rotate", "dim", "jpeg"] * 12

FONTS = [cv2.FONT_HERSHEY_SIMPLEX, cv2.FONT_HERSHEY_DUPLEX]


def put_text(img, text, x, y, scale=0.7, thick=1, font=None):
    """Render text, return axis-aligned pixel bbox of the VALUE."""
    font = font if font is not None else FONTS[0]
    cv2.putText(img, text, (x, y), font, scale, (10, 10, 10), thick, cv2.LINE_AA)
    (tw, th), baseline = cv2.getTextSize(text, font, scale, thick)
    return (x, y - th, x + tw, y + baseline)


def to_1000(box, w, h):
    x0, y0, x1, y1 = box
    x0c, y0c = max(0, x0), max(0, y0)
    x1c, y1c = min(w, x1), min(h, y1)
    return {
        "x": round(x0c / w * 1000, 1),
        "y": round(y0c / h * 1000, 1),
        "w": round(max(0, x1c - x0c) / w * 1000, 1),
        "h": round(max(0, y1c - y0c) / h * 1000, 1),
    }


def rotate_point(px, py, cx, cy, angle_rad):
    cos_a, sin_a = math.cos(angle_rad), math.sin(angle_rad)
    dx, dy = px - cx, py - cy
    return (cx + dx * cos_a - dy * sin_a, cy + dx * sin_a + dy * cos_a)


class Renderer:
    def __init__(self, rng: random.Random, w: int = 760, h: int = 980):
        self.rng = rng
        self.W, self.H = w, h
        self.img = np.full((h, w, 3), 255, np.uint8)
        self.boxes: dict[str, tuple] = {}
        self.font = rng.choice(FONTS)

    def text(self, key, text, x, y, scale=0.7, thick=1):
        self.boxes[key] = put_text(self.img, text, x, y, scale, thick, self.font)
        return text

    def rule(self, y, x0=40, x1=None, thick=2):
        cv2.line(self.img, (x0, y), (x1 or self.W - 40, y), (20, 20, 20), thick)

    def finalize(self, tier: str, nrng: np.random.Generator):
        img = self.img
        angle = 0.0
        if tier == "blur":
            img = cv2.GaussianBlur(img, (3, 3), 0)
        elif tier == "noise":
            noise = nrng.normal(0, 5, img.shape).astype(np.int16)
            img = np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)
        elif tier == "rotate":
            angle = float(nrng.uniform(-4, 4))
            m = cv2.getRotationMatrix2D((self.W / 2, self.H / 2), angle, 1.0)
            img = cv2.warpAffine(img, m, (self.W, self.H), borderValue=(255, 255, 255))
        elif tier == "dim":
            img = np.clip(img.astype(np.float32) * float(nrng.uniform(0.82, 0.95)), 0, 255).astype(np.uint8)

        boxes = dict(self.boxes)
        if angle:
            rad = math.radians(angle)
            cx, cy = self.W / 2, self.H / 2
            rot = {}
            for k, (x0, y0, x1, y1) in boxes.items():
                pts = [rotate_point(px, py, cx, cy, rad) for px, py in
                       ((x0, y0), (x1, y0), (x1, y1), (x0, y1))]
                xs = [p[0] for p in pts]
                ys = [p[1] for p in pts]
                rot[k] = (min(xs), min(ys), max(xs), max(ys))
            boxes = rot

        ok, buf = cv2.imencode(".png", img)
        assert ok
        raw = buf.tobytes()
        if tier == "jpeg":  # re-encode low quality for compression artifacts
            arr = np.frombuffer(raw, np.uint8)
            img2 = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            ok, buf = cv2.imencode(".jpg", img2, [cv2.IMWRITE_JPEG_QUALITY, 45])
            assert ok
            raw = buf.tobytes()
        return raw, boxes


def make_invoice(rng: random.Random, idx: int) -> tuple[dict, callable]:
    r = Renderer(rng)
    vendor = rng.choice(VENDORS)
    inv_no = f"INV-2026-{rng.randint(1, 9999):04d}"
    date = f"2026-{rng.randint(1, 9):02d}-{rng.randint(1, 28):02d}"
    gst_rate = rng.choice(GST_RATES)

    layout = rng.choice(["A", "B"])
    y = 80 if layout == "A" else 100
    r.text("vendor", vendor, 50, y, scale=1.2, thick=2)
    r.text("invoice_no", inv_no, 50, y + 45, scale=0.7, thick=1)
    r.text("date", date, 50, y + 80, scale=0.7, thick=1)
    r.text("gstin", f"GSTIN: 07{rng.choice('ABCDE')}{rng.randint(1000,9999)}F1Z5",
           50, y + 112, scale=0.55, thick=1)

    y0 = y + 160
    r.rule(y0 - 28)
    items = []
    n_items = rng.randint(1, 4)
    for i in range(n_items):
        desc, lo, hi = rng.choice(PRODUCTS)
        qty = rng.randint(1, 9)
        rate = round(rng.uniform(lo, hi), 2)
        amount = round(qty * rate, 2)
        row = f"{desc} | {qty} | {rate:.2f} | {amount:.2f}"
        ry = y0 + i * 42
        r.text(f"item_{i}", row, 50, ry, scale=0.55, thick=1)
        r.rule(ry + 13, thick=1)
        items.append({"desc": desc, "qty": qty, "rate": rate, "amount": amount,
                      "bbox_key": f"item_{i}"})

    subtotal = round(sum(it["amount"] for it in items), 2)
    gst = round(subtotal * gst_rate / 100, 2)
    total = round(subtotal + gst, 2)
    fy = y0 + n_items * 42 + 34
    r.text("subtotal", f"{subtotal:.2f}", 420, fy, scale=0.7, thick=1)
    r.text("gst", f"{gst:.2f}", 420, fy + 36, scale=0.7, thick=1)
    r.text("total", f"{total:.2f}", 420, fy + 78, scale=0.9, thick=2)

    gt = {
        "id": f"inv_{idx:03d}",
        "vendor": vendor, "invoice_no": inv_no, "date": date,
        "gst_rate": gst_rate, "subtotal": subtotal, "gst": gst, "total": total,
        "line_items": [{k: it[k] for k in ("desc", "qty", "rate", "amount")} for it in items],
        "_item_keys": [it["bbox_key"] for it in items],
    }
    return gt, r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=100)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out", default="datasets/v1")
    args = ap.parse_args()

    out = Path(args.out)
    imgdir = out / "images"
    imgdir.mkdir(parents=True, exist_ok=True)
    rng = random.Random(args.seed)
    nrng = np.random.default_rng(args.seed)

    tiers_used: dict[str, int] = {}
    with open(out / "labels.jsonl", "w") as f:
        for i in range(args.n):
            gt, r = make_invoice(rng, i)
            tier = rng.choice(TIERS)
            tiers_used[tier] = tiers_used.get(tier, 0) + 1
            raw, boxes = r.finalize(tier, nrng)
            fname = f"inv_{i:03d}.png"
            (imgdir / fname).write_bytes(raw)
            row = {**gt, "file": fname, "tier": tier,
                   "width": r.W, "height": r.H,
                   "fields": {k: {"value": str(gt[k]), "bbox": to_1000(boxes[k], r.W, r.H)}
                              for k in ("vendor", "invoice_no", "date", "subtotal", "gst", "total")}}
            for it, key in zip(row["line_items"], gt["_item_keys"]):
                it["bbox"] = to_1000(boxes[key], r.W, r.H)
            del row["_item_keys"]
            f.write(json.dumps(row) + "\n")

    print(f"wrote {args.n} invoices to {out} (seed={args.seed})")
    print("tiers:", dict(sorted(tiers_used.items())))


if __name__ == "__main__":
    main()
