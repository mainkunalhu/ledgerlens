from app.core.schemas import BBox, VisionField, VisionInvoice


def test_money_coercion_strips_formatting():
    inv = VisionInvoice.model_validate(
        {
            "vendor": "Sharma Traders",
            "total": "₹1,250.00",
            "gst": "Rs. 225.00",
            "subtotal": "1025",
        }
    )
    assert inv.total == 1250.00
    assert inv.gst == 225.00
    assert inv.subtotal == 1025.0


def test_money_invalid_becomes_none():
    inv = VisionInvoice.model_validate({"total": "not visible", "gst": ""})
    assert inv.total is None
    assert inv.gst is None


def test_bbox_clamped_to_0_1000():
    b = BBox.model_validate({"x": -5, "y": 1200, "w": "abc", "h": 50})
    assert b.x == 0
    assert b.y == 1000
    assert b.w == 0
    assert b.h == 50


def test_confidence_percent_scale():
    f = VisionField.model_validate({"key": "total", "value": "100", "confidence": 87})
    assert f.confidence == 0.87


def test_to_field_rows_prefers_bbox_from_fields():
    inv = VisionInvoice.model_validate(
        {
            "vendor": "Sharma Traders",
            "total": 1250.0,
            "fields": [
                {
                    "key": "total",
                    "value": "1250",
                    "bbox": {"x": 700, "y": 800, "w": 200, "h": 40},
                    "confidence": 0.9,
                },
                {
                    "key": "gst_no",
                    "value": "07ABCDE1234F1Z5",
                    "confidence": 0.8,
                },
            ],
        }
    )
    rows = inv.to_field_rows()
    by_key = {r["key"]: r for r in rows}
    assert by_key["vendor"]["value"] == "Sharma Traders"
    assert by_key["vendor"]["confidence"] == 0.5  # no bbox supplied → default
    assert by_key["total"]["bbox"] == {"x": 700.0, "y": 800.0, "w": 200.0, "h": 40.0}
    assert by_key["total"]["confidence"] == 0.9
    assert by_key["gst_no"]["value"] == "07ABCDE1234F1Z5"  # extra key preserved
    assert all(r["source"] == "vision" for r in rows)


def test_to_field_rows_skips_missing():
    inv = VisionInvoice.model_validate({})
    assert inv.to_field_rows() == []
