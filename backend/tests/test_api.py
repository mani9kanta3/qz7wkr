from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_info():
    data = client.get("/api/info").json()
    assert len(data["decision_dates"]) == 31
    assert data["default_decision_time"] == "09:00"


def test_forecast_default_time():
    response = client.get("/api/forecast", params={"decision_date": "2026-01-10"})
    assert response.status_code == 200
    data = response.json()
    assert data["delivery_date"] == "2026-01-11"
    assert data["decision_time"] == "09:00"
    assert len(data["points"]) == 24
    assert data["forecast_publish_times"] == ["2026-01-10T07:30:00Z"]


def test_forecast_rejects_date_outside_january():
    response = client.get("/api/forecast", params={"decision_date": "2026-02-05"})
    assert response.status_code == 400


def test_forecast_rejects_bad_time():
    response = client.get("/api/forecast", params={"decision_date": "2026-01-10", "decision_time": "25:00"})
    assert response.status_code == 422


def test_accuracy():
    response = client.get("/api/accuracy", params={"decision_time": "09:00"})
    assert response.status_code == 200
    data = response.json()
    assert data["overall"]["count"] > 0
    assert len(data["horizon"]) > 0
