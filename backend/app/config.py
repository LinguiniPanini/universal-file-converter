import os


class Settings:
    S3_BUCKET: str = os.getenv("S3_BUCKET", "file-converter-bucket")
    AWS_REGION: str = os.getenv("AWS_REGION", "us-east-1")
    MAX_FILE_SIZE: int = 50 * 1024 * 1024  # 50 MB
    ALLOWED_MIME_TYPES: dict[str, list[str]] = {
        "image/png": [".png"],
        "image/jpeg": [".jpg", ".jpeg"],
        "image/webp": [".webp"],
        "application/pdf": [".pdf"],
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
        "text/markdown": [".md"],
        "text/plain": [".md"],
    }
    UPLOAD_PREFIX: str = "uploads"
    CONVERTED_PREFIX: str = "converted"


settings = Settings()
