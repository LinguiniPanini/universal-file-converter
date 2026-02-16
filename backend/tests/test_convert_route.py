from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
FIXTURES = Path(__file__).parent.parent / "test_fixtures"


@patch("app.routes.convert.s3_service")
def test_convert_png_to_jpeg(mock_s3):
    png_data = (FIXTURES / "sample.png").read_bytes()
    mock_s3.download.return_value = png_data
    mock_s3.client.list_objects_v2.return_value = {
        "Contents": [{"Key": "uploads/test-uuid/sample.png"}]
    }
    mock_s3.upload_converted.return_value = "converted/test-uuid/converted.jpg"

    response = client.post("/api/convert", json={
        "job_id": "test-uuid",
        "target_format": "image/jpeg",
    })

    assert response.status_code == 200
    data = response.json()
    assert data["download_filename"].endswith(".jpg")


@patch("app.routes.convert.s3_service")
def test_convert_markdown_to_pdf(mock_s3):
    md_data = (FIXTURES / "sample.md").read_bytes()
    mock_s3.download.return_value = md_data
    mock_s3.client.list_objects_v2.return_value = {
        "Contents": [{"Key": "uploads/test-uuid/sample.md"}]
    }
    mock_s3.upload_converted.return_value = "converted/test-uuid/converted.pdf"

    response = client.post("/api/convert", json={
        "job_id": "test-uuid",
        "target_format": "application/pdf",
    })

    assert response.status_code == 200


def test_convert_missing_job_id():
    response = client.post("/api/convert", json={
        "target_format": "image/jpeg",
    })
    assert response.status_code == 422
