from app.core.fusion import fuse, fuse_field, iou, numbers_agree, texts_agree


def _box(x, y, w=100, h=30):
    return {"x": x, "y": y, "w": w, "h": h}


def _word(text, x, y, conf=0.95, w=100, h=30):
    return {"text": text, "bbox": _box(x, y, w, h), "conf": conf}


def test_iou_identical_and_disjoint():
    assert iou(_box(0, 0), _box(0, 0)) == 1.0
    assert iou(_box(0, 0, 10, 10), _box(500, 500, 10, 10)) == 0.0


def test_numbers_agree_with_formatting():
    assert numbers_agree("2171.2", "₹2,171.20")
    assert numbers_agree("1840.0", "1840")
    assert not numbers_agree("2171.2", "2711.2")
    assert not numbers_agree("abc", "2171")


def test_texts_agree_fuzzy():
    assert texts_agree("SHARMA TRADERS", "sharma traders")
    assert texts_agree("INV-2026-0042", "INV 2026 0042")
    assert not texts_agree("Sharma Traders", "Gupta Sons")


def test_agreeing_numeric_keeps_vision_value():
    field = {"key": "total", "value": "2171.2", "bbox": _box(100, 100), "confidence": 0.9}
    fused, check = fuse_field(field, [_word("2,171.20", 105, 102)])
    assert fused["value"] == "2171.2"
    assert check["agree"] is True
    assert fused["ocr_support"] is True


def test_disagreeing_numeric_corrected_by_ocr():
    # VL hallucinated 2711.2, glyphs clearly read 2171.20 → OCR wins
    field = {"key": "total", "value": "2711.2", "bbox": _box(100, 100), "confidence": 0.85}
    fused, check = fuse_field(field, [_word("2,171.20", 105, 102)])
    assert fused["value"] == "2,171.20"
    assert fused["corrected_by_ocr"] is True
    assert check["agree"] is False


def test_no_overlap_halves_confidence_and_flags():
    field = {"key": "gst", "value": "331.2", "bbox": _box(100, 100), "confidence": 0.9}
    fused, check = fuse_field(field, [_word("hello", 800, 800)])
    assert fused["confidence"] == 0.45
    assert fused["ocr_support"] is False
    assert check["ocr_support"] is False


def test_fuse_marks_sources_and_rate():
    fields = [
        {"key": "total", "value": "100", "bbox": _box(10, 10), "confidence": 0.9},
        {"key": "vendor", "value": "Acme", "bbox": _box(900, 900), "confidence": 0.9},
    ]
    out = fuse(fields, [_word("100", 12, 12)], ocr_available=True)
    assert out["fields"][0]["source"] == "fusion"
    assert out["ocr_support_rate"] == 0.5
    assert out["checks"][1]["ocr_support"] is False


def test_fuse_without_ocr_keeps_vision():
    fields = [{"key": "total", "value": "100", "bbox": None, "confidence": 0.7}]
    out = fuse(fields, [], ocr_available=False)
    assert out["fields"][0]["value"] == "100"
    assert out["fields"][0]["ocr_support"] is False
    assert out["ocr_available"] is False
