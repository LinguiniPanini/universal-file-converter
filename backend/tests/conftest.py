import boto3
import pytest
from moto import mock_aws

from app.config import settings


@pytest.fixture
def s3_client():
    """Provide a mocked S3 client with a test bucket."""
    with mock_aws():
        client = boto3.client("s3", region_name=settings.AWS_REGION)
        client.create_bucket(Bucket=settings.S3_BUCKET)
        yield client
