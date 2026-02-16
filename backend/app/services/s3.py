import boto3

from app.config import settings


class S3Service:
    def __init__(self, client=None):
        self.client = client or boto3.client("s3", region_name=settings.AWS_REGION)
        self.bucket = settings.S3_BUCKET

    def upload(self, data: bytes, job_id: str, filename: str, metadata: dict | None = None) -> str:
        """Upload original file. Returns the S3 key."""
        key = f"{settings.UPLOAD_PREFIX}/{job_id}/{filename}"
        params = {"Bucket": self.bucket, "Key": key, "Body": data}
        if metadata:
            params["Metadata"] = metadata
        self.client.put_object(**params)
        return key

    def upload_converted(self, data: bytes, job_id: str, filename: str) -> str:
        """Upload converted file. Returns the S3 key."""
        key = f"{settings.CONVERTED_PREFIX}/{job_id}/{filename}"
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data)
        return key

    def get_metadata(self, key: str) -> dict:
        """Get object metadata from S3."""
        response = self.client.head_object(Bucket=self.bucket, Key=key)
        return response.get("Metadata", {})

    def download(self, key: str) -> bytes:
        """Download file from S3. Returns bytes."""
        response = self.client.get_object(Bucket=self.bucket, Key=key)
        return response["Body"].read()

    def delete(self, key: str) -> None:
        """Delete file from S3."""
        self.client.delete_object(Bucket=self.bucket, Key=key)


s3_service = S3Service()
