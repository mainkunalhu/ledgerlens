from typing import Any

from fastapi import APIRouter

from app.core.config import settings

router = APIRouter()


@router.get("/")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "vision-worker",
        "phase": 2,
        "vision_model": settings.groq_vision_model,
        "groq_configured": bool(settings.groq_api_key),
    }
