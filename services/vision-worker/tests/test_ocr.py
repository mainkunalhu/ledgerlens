from app.core.ocr_paddle import ocr_available, parse_paddle_result, run_ocr


def _poly(x0, y0, x1, y1):
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]


def test_parse_v2_result_normalizes_coords():
    raw = [[[_poly(0, 0, 200, 40), ("TOTAL 2171", 0.95)]]]
    words = parse_paddle_result(raw, width=1000, height=500)
    assert len(words) == 1
    assert words[0]["bbox"] == {"x": 0.0, "y": 0.0, "w": 200.0, "h": 80.0}
    assert words[0]["conf"] == 0.95


def test_parse_skips_empty_and_bad_boxes():
    raw = [
        [
            [_poly(0, 0, 10, 10), ("", 0.9)],  # empty text
            [_poly(50, 50, 50, 50), ("x", 0.9)],  # zero area
            "garbage",
            [_poly(0, 0, 100, 20), ("GSTIN", 0.8)],
        ]
    ]
    words = parse_paddle_result(raw, width=1000, height=1000)
    assert [w["text"] for w in words] == ["GSTIN"]


def test_parse_v3_dict_style():
    raw = {
        "boxes": [_poly(10, 20, 110, 50)],
        "rec_texts": ["Sharma"],
        "rec_scores": [0.9],
    }
    words = parse_paddle_result(raw, width=1000, height=1000)
    assert words[0]["text"] == "Sharma"
    assert words[0]["bbox"]["x"] == 10.0


def test_run_ocr_degrades_without_paddle():
    if ocr_available():
        return  # Docker with OCR extra — live path covered by e2e
    out = run_ocr(b"whatever")
    assert out["available"] is False
    assert out["words"] == []


def test_unavailable_envelope_shape():
    out = run_ocr(b"whatever")
    if out["available"]:
        return  # live OCR path — covered by Docker e2e
    assert set(out) >= {"available", "words", "count", "latency_ms", "error"}
    assert out["count"] == 0
