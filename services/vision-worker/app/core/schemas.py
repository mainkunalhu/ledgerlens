"""Pydantic contracts for Groq vision output.

Groq VL models often return numbers as formatted strings ("₹1,250.00")
and bboxes slightly out of range — coerce/clamp everything here so
downstream code (fields mapping, API storage) sees clean types.
"""

from typing import Any

from pydantic import BaseModel, field_validator


def _to_float(v: Any) -> float | None:
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip()
    # Strip currency symbols, commas, spaces, trailing "/-" etc.
    s = (
        s.replace("₹", "")
        .replace("Rs.", "")
        .replace("Rs", "")
        .replace(",", "")
        .replace("/-", "")
        .strip()
    )
    # Tolerate "1,250.00 INR" style trailing codes
    parts = s.split()
    s = parts[0] if parts else ""
    try:
        return float(s)
    except ValueError:
        return None


class BBox(BaseModel):
    """Normalized 0-1000 box: top-left x,y + width/height."""

    x: float = 0
    y: float = 0
    w: float = 0
    h: float = 0

    @field_validator("x", "y", "w", "h", mode="before")
    @classmethod
    def _coerce_num(cls, v: Any) -> float:
        try:
            return float(v)
        except (TypeError, ValueError):
            return 0.0

    @field_validator("x", "y", "w", "h")
    @classmethod
    def _clamp(cls, v: float) -> float:
        return max(0.0, min(1000.0, v))


class VisionField(BaseModel):
    key: str = ""
    value: str = ""
    bbox: BBox | None = None
    confidence: float = 0.0

    @field_validator("value", mode="before")
    @classmethod
    def _str(cls, v: Any) -> str:
        return "" if v is None else str(v)

    @field_validator("confidence", mode="before")
    @classmethod
    def _conf(cls, v: Any) -> float:
        try:
            f = float(v)
        except (TypeError, ValueError):
            return 0.0
        # Accept 0-100 percent scale too
        if f > 1.0 and f <= 100.0:
            f /= 100.0
        return max(0.0, min(1.0, f))


class VisionLineItem(BaseModel):
    desc: str = ""
    qty: float | None = None
    rate: float | None = None
    amount: float | None = None
    bbox: BBox | None = None

    @field_validator("qty", "rate", "amount", mode="before")
    @classmethod
    def _num(cls, v: Any) -> float | None:
        return _to_float(v)


class VisionInvoice(BaseModel):
    vendor: str | None = None
    invoice_no: str | None = None
    date: str | None = None
    line_items: list[VisionLineItem] = []
    subtotal: float | None = None
    gst: float | None = None
    total: float | None = None
    fields: list[VisionField] = []

    @field_validator("subtotal", "gst", "total", mode="before")
    @classmethod
    def _money(cls, v: Any) -> float | None:
        return _to_float(v)

    def to_field_rows(self) -> list[dict[str, Any]]:
        """Flatten to DB-ready fields rows (source=vision)."""
        rows: list[dict[str, Any]] = []
        for key in ("vendor", "invoice_no", "date", "subtotal", "gst", "total"):
            val = getattr(self, key)
            if val is None or val == "":
                continue
            # Prefer model-supplied fields entry (has bbox/confidence)
            match = next((f for f in self.fields if f.key == key), None)
            rows.append(
                {
                    "key": key,
                    "value": str(val),
                    "bbox": match.bbox.model_dump() if match and match.bbox else None,
                    "confidence": match.confidence if match else 0.5,
                    "source": "vision",
                }
            )
        # Extra model-supplied fields not in the core set
        core = {"vendor", "invoice_no", "date", "subtotal", "gst", "total"}
        for f in self.fields:
            if f.key and f.key not in core and f.value != "":
                rows.append(
                    {
                        "key": f.key,
                        "value": f.value,
                        "bbox": f.bbox.model_dump() if f.bbox else None,
                        "confidence": f.confidence,
                        "source": "vision",
                    }
                )
        return rows
