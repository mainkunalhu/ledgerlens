from typing import Any

from fastapi import APIRouter

router = APIRouter()


@router.get("/")
def health() -> dict[str, Any]:
    return {"ok": True, "service": "vision-worker", "phase": 0}
