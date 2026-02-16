from moto import mock_aws

from app.services.s3 import S3Service
import pytest


@mock_aws
def test_upload_and_download(s3_client):
    svc = S3Service(client=s3_client)
    content = b"hello world"

    key = svc.upload(content, "test-uuid", "hello.txt")
    assert "uploads/test-uuid/hello.txt" in key

    downloaded = svc.download(key)
    assert downloaded == content


@mock_aws
def test_upload_converted(s3_client):
    svc = S3Service(client=s3_client)
    content = b"converted content"

    key = svc.upload_converted(content, "test-uuid", "output.pdf")
    assert "converted/test-uuid/output.pdf" in key

    downloaded = svc.download(key)
    assert downloaded == content


@mock_aws
def test_delete(s3_client):
    svc = S3Service(client=s3_client)
    key = svc.upload(b"temp", "test-uuid", "temp.txt")

    svc.delete(key)

    with pytest.raises(Exception):
        svc.download(key)
