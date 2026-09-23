"""OpenCV layout: preprocessing + header/table/footer zone detection.

No heavy deps — pure cv2/numpy. All bboxes normalized 0-1000 to match
the vision model's coordinate space.
"""

from typing import Any

import cv2
import numpy as np


def preprocess(image_bytes: bytes) -> bytes:
    """Deskew-lite + CLAHE + resize for Groq vision. Returns JPEG bytes."""
    arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("invalid image bytes")

    # Cap longest side at 1600px (Groq 20MB limit, 2048 tok/image)
    h, w = img.shape[:2]
    scale = min(1.0, 1600 / max(h, w))
    if scale < 1.0:
        img = cv2.resize(img, (int(w * scale), int(h * scale)))

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    img = cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)

    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 90])
    if not ok:
        raise RuntimeError("jpeg encode failed")
    return buf.tobytes()


def _to_1000(px: float, total: int) -> float:
    return max(0.0, min(1000.0, px / total * 1000.0))


def detect_zones(image_bytes: bytes) -> dict[str, Any]:
    """Split page into header/table/footer zones.

    Method: horizontal ruling-line profile (morphology) locates the
    line-items grid; text-contour density is the fallback. Returns
    zones + table_bbox in 0-1000 coords with per-zone confidence.
    """
    arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise ValueError("invalid image bytes")
    h, w = img.shape

    binary = cv2.adaptiveThreshold(
        img, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 21, 10
    )

    # Long horizontal rulings: wide-short open kernel, scaled to page width.
    kern_w = max(20, w // 18)
    h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kern_w, 1))
    h_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, h_kernel)
    row_profile = (h_lines > 0).sum(axis=1) / w  # fraction of row covered by rulings

    # Candidate table band: rows where rulings cover >= 30% of width.
    mask = row_profile >= 0.30
    table_top, table_bottom = _table_band(mask, h)

    method = "rulings"
    confidence = 0.85
    if table_top is None:
        # Fallback: densest text-contour band becomes the table zone.
        method = "contours"
        confidence = 0.45
        table_top, table_bottom = _contour_band(binary, h, w)

    zones = [
        {
            "kind": "header",
            "bbox": {
                "x": 0.0,
                "y": 0.0,
                "w": 1000.0,
                "h": _to_1000(table_top, h),
            },
            "confidence": confidence,
        },
        {
            "kind": "table",
            "bbox": {
                "x": 0.0,
                "y": _to_1000(table_top, h),
                "w": 1000.0,
                "h": _to_1000(table_bottom - table_top, h),
            },
            "confidence": confidence,
        },
        {
            "kind": "footer",
            "bbox": {
                "x": 0.0,
                "y": _to_1000(table_bottom, h),
                "w": 1000.0,
                "h": 1000.0 - _to_1000(table_bottom, h),
            },
            "confidence": confidence,
        },
    ]
    return {
        "zones": zones,
        "table_bbox": zones[1]["bbox"],
        "line_rows": int(mask.sum()),
        "method": method,
    }


def _table_band(mask: "np.ndarray", h: int) -> tuple[int | None, int]:
    """Table band from ruling rows, bridging gaps between grid lines.

    Ruled tables produce separated line rows, so close the mask vertically
    (window ~8% of height) before taking the largest run, then trim the
    run edges back to actual ruling rows.
    """
    col = (mask.astype(np.uint8) * 255).reshape(-1, 1)
    window = max(3, h // 12)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, window))
    closed = (cv2.morphologyEx(col, cv2.MORPH_CLOSE, kernel) > 0).flatten()
    top, bottom = _largest_run(closed, h)
    if top is None:
        return None, h
    true_rows = np.flatnonzero(mask[top:bottom]) + top
    if len(true_rows) == 0:
        return None, h
    return int(true_rows[0]), int(true_rows[-1] + 1)


def _largest_run(mask: "np.ndarray", h: int) -> tuple[int | None, int]:
    """Largest contiguous True run; None top when no run >= 1% of height."""
    best_start: int | None = None
    best_len = 0
    start: int | None = None
    for i, on in enumerate(mask):
        if on and start is None:
            start = i
        elif not on and start is not None:
            if i - start > best_len:
                best_len, best_start = i - start, start
            start = None
    if start is not None and h - start > best_len:
        best_len, best_start = h - start, start
    if best_start is None or best_len < h * 0.01:
        return None, h
    return best_start, best_start + best_len


def _contour_band(binary: "np.ndarray", h: int, w: int) -> tuple[int, int]:
    """Vertical band holding the most text-sized contours (fallback)."""
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    boxes = [cv2.boundingRect(c) for c in contours if 8 < cv2.contourArea(c) < (w * h * 0.05)]
    if not boxes:
        return h // 3, 2 * h // 3
    bands = 12
    hist = [0] * bands
    for _, y, _, bh in boxes:
        hist[min(bands - 1, (y + bh // 2) * bands // h)] += 1
    peak = max(range(bands), key=lambda i: hist[i])
    return peak * h // bands, (peak + 4) * h // bands


def detect_zones_stub() -> dict[str, Any]:
    """Kept for backward compat — prefer detect_zones()."""
    return {"zones": [], "note": "deprecated: use detect_zones()"}
