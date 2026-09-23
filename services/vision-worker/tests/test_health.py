from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_root():
    r = client.get("/")
    assert r.status_code == 200
    assert r.json()["name"] == "ledgerlens-worker"


def test_health():
    r = client.get("/health/")
    assert r.status_code == 200
    assert r.json()["ok"] is True
