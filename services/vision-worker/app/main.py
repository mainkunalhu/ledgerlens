from typing import Any

from fastapi import FastAPI

from app.routers.health import router as health_router
from app.routers.infer import router as infer_router

app = FastAPI(title="ledgerlens-worker", version="0.3.0")

app.include_router(health_router, prefix="/health", tags=["health"])
app.include_router(infer_router, tags=["infer"])


@app.get("/")
def root() -> dict[str, Any]:
    return {"name": "ledgerlens-worker", "phase": 3}
