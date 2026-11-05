from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_root() -> None:
	response = client.get("/")
	assert response.status_code == 200
	assert response.json() == {"message": "Hello from {{projectName}}"}


def test_health() -> None:
	assert client.get("/health").json() == {"status": "ok"}
