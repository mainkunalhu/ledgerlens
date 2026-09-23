from typing import Any

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.core.config import settings
from app.core.groq_client import GroqVisionError, extract_invoice
from app.core.layout_opencv import detect_zones_stub, preprocess

router = APIRouter()

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}


@router.post("/infer")
async def infer(file: UploadFile = File(...)) -> dict[str, Any]:
    raw = await file.read()
    max_bytes = settings.max_image_mb * 1024 * 1024
    if not raw:
        raise HTTPException(status_code=400, detail="empty file")
    if len(raw) > max_bytes:
        raise HTTPException(
            status_code=413, detail=f"file too large (max {settings.max_image_mb}MB)"
        )
    if file.content_type and file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail=f"unsupported type {file.content_type}")

    try:
        processed = preprocess(raw)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid image") from None

    try:
        result = extract_invoice(processed)
    except GroqVisionError as e:
        raise HTTPException(status_code=502, detail=f"vision failed: {e}") from e

    return {
        "ok": True,
        "filename": file.filename,
        "bytes_in": len(raw),
        "bytes_processed": len(processed),
        "layout": detect_zones_stub(),
        **result,
    }
