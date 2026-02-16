from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
FIXTURES = Path(__file__).parent.parent / "test_fixtures"


@patch("app.routes.upload.s3_service")
def test_upload_valid_png(mock_s3):
    mock_s3.upload.return_value = "uploads/some-uuid/sample.png"

    with open(FIXTURES / "sample.png", "rb") as f:
        response = client.post("/api/upload", files={"file": ("sample.png", f, "image/png")})

    assert response.status_code == 200
    data = response.json()
    assert data["filename"] == "sample.png"
    assert data["mime_type"] == "image/png"
    assert "job_id" in data


def test_upload_rejects_no_file():
    response = client.post("/api/upload")
    assert response.status_code == 422


@patch("app.routes.upload.s3_service")
def test_upload_rejects_invalid_type(mock_s3):
    response = client.post(
        "/api/upload",
        files={"file": ("script.sh", b"#!/bin/bash\necho hi", "text/x-shellscript")},
    )
    assert response.status_code == 400
