import io

import cv2
import numpy as np
from fastapi.testclient import TestClient

import app.routers.infer as infer_module
from app.main import app

client = TestClient(app)


def _valid_png() -> bytes:
    img = np.full((120, 200, 3), 255, dtype=np.uint8)  # white receipt-like stub
    ok, buf = cv2.imencode(".png", img)
    assert ok
    return buf.tobytes()


def _png_file():
    return ("file", ("t.png", io.BytesIO(_valid_png()), "image/png"))


def test_infer_success_with_mocked_groq(monkeypatch):
    def fake_extract(image_jpeg: bytes):
        assert len(image_jpeg) > 0  # preprocessed JPEG bytes
        return {
            "vision_json": {"vendor": "Mock", "total": 100.0},
            "fields": [
                {
                    "key": "vendor",
                    "value": "Mock",
                    "bbox": None,
                    "confidence": 0.9,
                    "source": "vision",
                }
            ],
            "model": "mock-model",
            "latency_ms": 1,
        }

    monkeypatch.setattr(infer_module, "extract_invoice", fake_extract)
    r = client.post("/infer", files=[_png_file()])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["vision_json"]["vendor"] == "Mock"
    assert body["model"] == "mock-model"
    # Phase 3 envelope: layout + ocr + fused always present
    assert len(body["layout"]["zones"]) == 3
    assert set(body["ocr"]) >= {"available", "words", "count"}
    assert body["fused"]["ocr_available"] is False  # no paddle in CI
    assert body["fields"][0]["ocr_support"] is False


def test_infer_ocr_correction_wiring(monkeypatch):
    """Vision says 2711.2, OCR reads 2171.20 at same spot → fused corrects."""

    def fake_extract(_: bytes):
        return {
            "vision_json": {"total": 2711.2},
            "fields": [
                {
                    "key": "total",
                    "value": "2711.2",
                    "bbox": {"x": 100, "y": 100, "w": 120, "h": 30},
                    "confidence": 0.85,
                    "source": "vision",
                }
            ],
            "model": "mock-model",
            "latency_ms": 1,
        }

    def fake_ocr(_: bytes):
        return {
            "available": True,
            "words": [
                {
                    "text": "2,171.20",
                    "bbox": {"x": 105, "y": 102, "w": 110, "h": 26},
                    "conf": 0.96,
                }
            ],
            "count": 1,
            "latency_ms": 2,
        }

    monkeypatch.setattr(infer_module, "extract_invoice", fake_extract)
    monkeypatch.setattr(infer_module, "run_ocr", fake_ocr)
    r = client.post("/infer", files=[_png_file()])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["fields"][0]["value"] == "2,171.20"
    assert body["fields"][0]["source"] == "fusion"
    assert body["fields"][0]["corrected_by_ocr"] is True
    assert body["fused"]["checks"][0]["agree"] is False


def test_infer_groq_failure_is_502(monkeypatch):
    from app.core.groq_client import GroqVisionError

    def boom(_: bytes):
        raise GroqVisionError("no key")

    monkeypatch.setattr(infer_module, "extract_invoice", boom)
    r = client.post("/infer", files=[_png_file()])
    assert r.status_code == 502


def test_infer_invalid_image_is_400():
    r = client.post(
        "/infer",
        files=[("file", ("x.png", io.BytesIO(b"not-an-image"), "image/png"))],
    )
    assert r.status_code == 400
