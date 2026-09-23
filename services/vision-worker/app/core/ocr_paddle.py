"""PaddleOCR wrapper — lazy import, graceful degradation.

PaddleOCR (~2GB with paddlepaddle) is Docker-only and unavailable on
ARM Macs. Everything here degrades to `available: False` so /infer
always stays up: vision-only with `ocr_support: False` flags.

All word bboxes are normalized 0-1000 to match the vision coordinate space.
"""

import time
from functools import lru_cache
from typing import Any

import cv2
import numpy as np

_ocr_instance: Any = None
_ocr_error: str | None = None


@lru_cache(maxsize=1)
def ocr_available() -> bool:
    """True when paddleocr imports. Cached — no repeated import cost."""
    try:
        import paddleocr  # noqa: F401

        return True
    except Exception as e:  # noqa: BLE001 — missing/wrong-arch/broken → vision-only mode
        global _ocr_error
        _ocr_error = str(e)[:200]
        return False


def get_ocr() -> Any:
    """Singleton PaddleOCR (English, no angle classifier for speed)."""
    global _ocr_instance
    if _ocr_instance is None:
        from paddleocr import PaddleOCR

        _ocr_instance = PaddleOCR(use_angle_cls=False, lang="en", show_log=False)
    return _ocr_instance


def parse_paddle_result(result: Any, width: int, height: int) -> list[dict[str, Any]]:
    """Parse PaddleOCR output into normalized word dicts.

    Accepts v2 style: [ [box(4x[xy]), (text, conf)], ... ] possibly nested
    per-page, and v3 style dicts with 'boxes'/'rec_texts'/'rec_scores'.
    Pure function — unit-tested without paddle installed.
    """
    words: list[dict[str, Any]] = []
    pages = result if isinstance(result, list) else [result]
    for page in pages:
        items: list[Any] = []
        if isinstance(page, dict):  # v3 style
            boxes = page.get("boxes") or page.get("dt_boxes") or []
            texts = page.get("rec_texts") or []
            scores = page.get("rec_scores") or []
            for i, box in enumerate(boxes):
                items.append(
                    (
                        box,
                        (texts[i] if i < len(texts) else "", scores[i] if i < len(scores) else 0.0),
                    )
                )
        elif isinstance(page, list):
            items = page
        else:
            continue
        for item in items:
            try:
                box, (text, conf) = item[0], item[1]
            except (TypeError, ValueError, IndexError):
                continue
            if not text or not str(text).strip():
                continue
            xs = [p[0] for p in box]
            ys = [p[1] for p in box]
            x0, x1 = max(0, min(xs)), min(width, max(xs))
            y0, y1 = max(0, min(ys)), min(height, max(ys))
            if x1 <= x0 or y1 <= y0:
                continue
            try:
                conf_f = float(conf)
            except (TypeError, ValueError):
                conf_f = 0.0
            words.append(
                {
                    "text": str(text).strip(),
                    "bbox": {
                        "x": x0 / width * 1000.0,
                        "y": y0 / height * 1000.0,
                        "w": (x1 - x0) / width * 1000.0,
                        "h": (y1 - y0) / height * 1000.0,
                    },
                    "conf": max(0.0, min(1.0, conf_f)),
                }
            )
    words.sort(key=lambda wd: (round(wd["bbox"]["y"] / 25), wd["bbox"]["x"]))
    return words


def run_ocr(image_bytes: bytes) -> dict[str, Any]:
    """Run OCR, always returning the same envelope (never raises)."""
    start = time.perf_counter()
    if not ocr_available():
        return {
            "available": False,
            "words": [],
            "count": 0,
            "latency_ms": 0,
            "error": _ocr_error or "paddleocr not installed",
        }
    arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        return {
            "available": False,
            "words": [],
            "count": 0,
            "latency_ms": 0,
            "error": "invalid image",
        }
    h, w = img.shape[:2]
    try:
        ocr = get_ocr()
        if hasattr(ocr, "ocr"):
            raw = ocr.ocr(img)
        else:  # PaddleOCR 3.x
            raw = ocr.predict(img)
        words = parse_paddle_result(raw, w, h)
    except Exception as e:  # noqa: BLE001 — OCR must never take down /infer
        return {
            "available": False,
            "words": [],
            "count": 0,
            "latency_ms": int((time.perf_counter() - start) * 1000),
            "error": str(e)[:300],
        }
    return {
        "available": True,
        "words": words,
        "count": len(words),
        "latency_ms": int((time.perf_counter() - start) * 1000),
    }
