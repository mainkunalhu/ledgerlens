from typing import Any

from fastapi import APIRouter

from app.core.config import settings
from app.core.ocr_paddle import ocr_available

router = APIRouter()


@router.get("/")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "vision-worker",
        "phase": 3,
        "vision_model": settings.groq_vision_model,
        "groq_configured": bool(settings.groq_api_key),
        "ocr_available": ocr_available(),
    }
