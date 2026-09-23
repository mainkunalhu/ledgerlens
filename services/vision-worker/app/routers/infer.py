from typing import Any

from fastapi import APIRouter, File, UploadFile

from app.core.layout_opencv import detect_zones_stub, preprocess

router = APIRouter()


@router.post("/infer")
async def infer(file: UploadFile = File(...)) -> dict[str, Any]:
    """Phase 0 stub — Phase 2 adds Groq qwen3.8-27b call + JSON structuring."""
    raw = await file.read()
    try:
        processed = preprocess(raw)
    except ValueError:
        return {"ok": False, "error": "invalid image"}
    return {
        "ok": True,
        "phase": 0,
        "filename": file.filename,
        "bytes_in": len(raw),
        "bytes_processed": len(processed),
        "layout": detect_zones_stub(),
        "note": "Phase 2: Groq vision + fusion + table recon",
    }
