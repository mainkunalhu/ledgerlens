"""Lightweight OpenCV preprocessing (Phase 0/2). Full layout detect lands in Phase 3."""

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


def detect_zones_stub() -> dict[str, Any]:
    """Phase 3: contour/MSER header-table-footer split. Stub for Phase 0."""
    return {"zones": [], "note": "Phase 3: OpenCV layout detect"}
