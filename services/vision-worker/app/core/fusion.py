"""Vision × OCR fusion — cross-check every vision field against OCR words.

Policy:
- Numeric keys (subtotal/gst/total/amounts): OCR wins on disagreement
  (OCR reads glyphs; VL models approximate). Tolerance 1% + 0.5 abs.
- Text keys: fuzzy match; OCR text wins when similarity >= 0.8 and
  vision confidence < 0.9.
- No overlapping OCR words → keep vision value, halve confidence,
  flag `ocr_support: False` (hallucination guard for Phase 4 citations).

Pure functions — fully unit-tested without paddle/Groq.
"""

import re
from difflib import SequenceMatcher
from typing import Any

NUMERIC_KEYS = {"subtotal", "gst", "total", "qty", "rate", "amount"}

OVERLAP_IOU_THRESH = 0.05  # small vision boxes vs word boxes → lenient


def iou(a: dict[str, float], b: dict[str, float]) -> float:
    ax1, ay1 = a["x"], a["y"]
    ax2, ay2 = a["x"] + a["w"], a["y"] + a["h"]
    bx1, by1 = b["x"], b["y"]
    bx2, by2 = b["x"] + b["w"], b["y"] + b["h"]
    ix, iy = max(0, min(ax2, bx2) - max(ax1, bx1)), max(0, min(ay2, by2) - max(ay1, by1))
    inter = ix * iy
    union = a["w"] * a["h"] + b["w"] * b["h"] - inter
    return inter / union if union > 0 else 0.0


def _norm_num(text: str) -> float | None:
    s = re.sub(r"[₹$,\s]", "", text.replace("Rs.", "").replace("Rs", ""))
    s = s.rstrip("/-")
    try:
        return float(s)
    except ValueError:
        return None


def _norm_text(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.lower())


def numbers_agree(vision_val: str, ocr_text: str) -> bool:
    v, o = _norm_num(vision_val), _norm_num(ocr_text)
    if v is None or o is None:
        return False
    return abs(v - o) <= max(0.5, abs(v) * 0.01)


def texts_agree(vision_val: str, ocr_text: str) -> bool:
    a, b = _norm_text(vision_val), _norm_text(ocr_text)
    if not a or not b:
        return False
    if a in b or b in a:
        return True
    return SequenceMatcher(None, a, b).ratio() >= 0.8


def overlapping_words(
    bbox: dict[str, float] | None, words: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    if not bbox:
        return []
    hits = [(iou(bbox, wd["bbox"]), wd) for wd in words]
    return [wd for score, wd in sorted(hits, reverse=True) if score >= OVERLAP_IOU_THRESH]


def fuse_field(
    field: dict[str, Any], words: list[dict[str, Any]]
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Fuse one vision field. Returns (fused_field, check)."""
    key = field.get("key", "")
    value = str(field.get("value", ""))
    conf = float(field.get("confidence", 0.5))
    hits = overlapping_words(field.get("bbox"), words)
    ocr_text = " ".join(w["text"] for w in hits).strip()

    check: dict[str, Any] = {
        "key": key,
        "vision_value": value,
        "ocr_value": ocr_text or None,
        "agree": False,
        "ocr_support": bool(hits),
        "note": "",
    }
    fused = dict(field)

    if not hits:
        fused["confidence"] = round(conf * 0.5, 3)
        fused["ocr_support"] = False
        check["note"] = "no OCR overlap — unverified, confidence halved"
        return fused, check

    is_numeric = key in NUMERIC_KEYS
    agree = numbers_agree(value, ocr_text) if is_numeric else texts_agree(value, ocr_text)
    check["agree"] = agree
    ocr_conf = max((w.get("conf", 0.0) for w in hits), default=0.0)

    if agree:
        fused["confidence"] = round(max(conf, ocr_conf), 3)
        fused["ocr_support"] = True
        check["note"] = "vision and OCR agree"
        return fused, check

    # Disagreement — OCR wins for numbers; for text only when OCR is confident.
    if is_numeric and _norm_num(ocr_text) is not None:
        fused["value"] = ocr_text
        fused["confidence"] = round(ocr_conf * 0.9, 3)
        fused["corrected_by_ocr"] = True
        fused["ocr_support"] = True
        check["note"] = f"OCR corrected {value!r} → {ocr_text!r}"
    elif not is_numeric and ocr_conf >= 0.8 and conf < 0.9:
        fused["value"] = ocr_text
        fused["confidence"] = round(ocr_conf, 3)
        fused["corrected_by_ocr"] = True
        fused["ocr_support"] = True
        check["note"] = f"OCR text preferred ({ocr_conf:.2f} conf)"
    else:
        fused["confidence"] = round(conf * 0.7, 3)
        fused["ocr_support"] = True
        check["note"] = "disagree but vision kept (OCR uncertain)"
    return fused, check


def fuse(
    vision_fields: list[dict[str, Any]], ocr_words: list[dict[str, Any]], ocr_available: bool
) -> dict[str, Any]:
    """Fuse all vision fields. Returns {fields, checks, ocr_support_rate}."""
    if not ocr_available:
        fields = [{**f, "ocr_support": False} for f in vision_fields]
        return {
            "fields": fields,
            "checks": [
                {
                    "key": f.get("key", ""),
                    "vision_value": str(f.get("value", "")),
                    "ocr_value": None,
                    "agree": False,
                    "ocr_support": False,
                    "note": "OCR unavailable — vision-only",
                }
                for f in vision_fields
            ],
            "ocr_support_rate": 0.0,
            "ocr_available": False,
        }
    fused_fields, checks = [], []
    for f in vision_fields:
        ff, check = fuse_field(f, ocr_words)
        ff["source"] = "fusion"
        fused_fields.append(ff)
        checks.append(check)
    supported = sum(1 for c in checks if c["ocr_support"])
    return {
        "fields": fused_fields,
        "checks": checks,
        "ocr_support_rate": round(supported / len(checks), 3) if checks else 1.0,
        "ocr_available": True,
    }
