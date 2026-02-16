"""Delete S3 objects older than 1 hour. Run via cron every 15 minutes."""
import boto3
from datetime import datetime, timezone, timedelta

BUCKET = "file-converter-bucket"
MAX_AGE = timedelta(hours=1)


def cleanup():
    s3 = boto3.client("s3")
    now = datetime.now(timezone.utc)

    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=BUCKET):
        for obj in page.get("Contents", []):
            age = now - obj["LastModified"]
            if age > MAX_AGE:
                s3.delete_object(Bucket=BUCKET, Key=obj["Key"])
                print(f"Deleted: {obj['Key']} (age: {age})")


if __name__ == "__main__":
    cleanup()
