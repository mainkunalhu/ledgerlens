"""Groq vision extraction — qwen3.8-27b with JSON mode + fallback.

Docs: https://console.groq.com/docs/vision
- qwen/qwen3.8-27b: 131K ctx, max 3 images/req, 20MB limit, 2048 tok/image.
"""

import base64
import json
import time
from typing import Any

from groq import Groq

from app.core.config import settings
from app.core.schemas import VisionInvoice

INVOICE_PROMPT = """You are a precise invoice parser. Look at the image and return STRICT JSON only — no markdown, no commentary.

Schema (all bboxes normalized 0-1000 as {"x":<left>,"y":<top>,"w":<width>,"h":<height>}):
{
  "vendor": string | null,
  "invoice_no": string | null,
  "date": string | null,
  "line_items": [{"desc": string, "qty": number | null, "rate": number | null, "amount": number | null, "bbox": bbox | null}],
  "subtotal": number | null,
  "gst": number | null,
  "total": number | null,
  "fields": [{"key": one of vendor|invoice_no|date|subtotal|gst|total, "value": string, "bbox": bbox | null, "confidence": 0-1}]
}

Rules:
- numbers must be plain (1250.5), never "₹1,250.00" or with currency text.
- bbox must tightly surround the VALUE digits/letters only, not the label and not the whole row:
  x starts at the value's FIRST visible character, w ends at its LAST character.
- confidence < 0.5 when the value is blurry, cropped, or guessed from context.
- null for anything not clearly visible. NEVER invent numbers, names, or line items.
- line_items: one entry per printed row; merge/split rows conservatively (one entry per visual row)."""


class GroqVisionError(RuntimeError):
    pass


def _client() -> Groq:
    if not settings.groq_api_key:
        raise GroqVisionError("GROQ_API_KEY is not set")
    return Groq(api_key=settings.groq_api_key)


def _strip_fences(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        # Drop ```json ... ``` wrapper if the model adds one despite instructions
        lines = t.split("\n")
        lines = [ln for ln in lines if not ln.strip().startswith("```")]
        t = "\n".join(lines).strip()
    return t


def _call(model: str, data_url: str) -> tuple[str, int]:
    client = _client()
    start = time.perf_counter()
    completion = client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": INVOICE_PROMPT},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            }
        ],
        response_format={"type": "json_object"},
        temperature=0,
        max_tokens=2048,
    )
    latency_ms = int((time.perf_counter() - start) * 1000)
    content = completion.choices[0].message.content or ""
    return content, latency_ms


def extract_invoice(image_jpeg: bytes) -> dict[str, Any]:
    """Run Groq vision on preprocessed JPEG bytes. Returns normalized result dict."""
    b64 = base64.b64encode(image_jpeg).decode("ascii")
    data_url = f"data:image/jpeg;base64,{b64}"

    models = [settings.groq_vision_model]
    fallback = getattr(settings, "groq_vision_fallback", "")
    if fallback and fallback not in models:
        models.append(fallback)

    last_err: Exception | None = None
    for model in models:
        try:
            raw_text, latency_ms = _call(model, data_url)
            invoice = VisionInvoice.model_validate(json.loads(_strip_fences(raw_text)))
            return {
                "vision_json": invoice.model_dump(),
                "fields": invoice.to_field_rows(),
                "model": model,
                "latency_ms": latency_ms,
            }
        except GroqVisionError:
            raise
        except Exception as e:  # noqa: BLE001 — model retired / bad JSON / SDK error → fallback
            last_err = e
            continue
    raise GroqVisionError(f"all vision models failed: {last_err}")
