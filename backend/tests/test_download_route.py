from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

VALID_UUID = "01234567-abcd-abcd-abcd-0123456789ab"


@patch("app.routes.download.s3_service")
def test_download_converted_file(mock_s3):
    mock_s3.client.list_objects_v2.return_value = {
        "Contents": [{"Key": f"converted/{VALID_UUID}/output.pdf"}]
    }
    mock_s3.download.return_value = b"%PDF-1.4 fake content"

    response = client.get(f"/api/download/{VALID_UUID}")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/octet-stream"
    assert b"%PDF-1.4" in response.content


@patch("app.routes.download.s3_service")
def test_download_not_found(mock_s3):
    mock_s3.client.list_objects_v2.return_value = {}

    response = client.get(f"/api/download/{VALID_UUID}")
    assert response.status_code == 404


def test_download_rejects_invalid_job_id():
    response = client.get("/api/download/not-a-valid-uuid")
    assert response.status_code == 400
