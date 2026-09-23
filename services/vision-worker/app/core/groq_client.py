"""Groq vision client — qwen3.8-27b (JSON mode). Phase 2 wires real calls."""


def build_invoice_prompt() -> str:
    return """You are an invoice parser. Return STRICT JSON only:
{vendors, invoice_no, date, line_items[{desc,qty,rate,amount,bbox}], subtotal, gst, total, bboxes[{key,value,bbox_0_1000,confidence}]}
Rules: bboxes normalized 0-1000. If unsure, confidence<0.5. Never invent numbers without visible evidence."""
