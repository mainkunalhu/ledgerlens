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
