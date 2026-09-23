import cv2
import numpy as np

from app.core.layout_opencv import detect_zones


def _ruled_invoice() -> bytes:
    """White page with horizontal ruling lines = synthetic table grid."""
    img = np.full((800, 600, 3), 255, np.uint8)
    for y in [300, 340, 380, 420, 460, 500]:
        cv2.line(img, (40, y), (560, y), (0, 0, 0), 2)
    cv2.putText(img, "SHARMA TRADERS", (40, 80), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 0), 2)
    ok, buf = cv2.imencode(".png", img)
    assert ok
    return buf.tobytes()


def _blank() -> bytes:
    img = np.full((400, 400, 3), 255, np.uint8)
    ok, buf = cv2.imencode(".png", img)
    assert ok
    return buf.tobytes()


def test_ruled_table_detected_by_rulings():
    layout = detect_zones(_ruled_invoice())
    assert layout["method"] == "rulings"
    kinds = [z["kind"] for z in layout["zones"]]
    assert kinds == ["header", "table", "footer"]
    table = layout["table_bbox"]
    # Rulings span y=300..500 of 800px → 375..625 in 0-1000 space
    assert 300 <= table["y"] <= 450
    assert 550 <= table["y"] + table["h"] <= 700


def test_blank_falls_back_without_crash():
    layout = detect_zones(_blank())
    assert layout["method"] == "contours"
    assert len(layout["zones"]) == 3
    for z in layout["zones"]:
        for k in ("x", "y", "w", "h"):
            assert 0 <= z["bbox"][k] <= 1000


def test_invalid_bytes_raise():
    import pytest

    with pytest.raises(ValueError):
        detect_zones(b"not-an-image")
