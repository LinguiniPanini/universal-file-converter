from dataclasses import dataclass

import magic

from app.config import settings


@dataclass
class ValidationResult:
    is_valid: bool
    mime_type: str = ""
    error: str = ""


def validate_file(data: bytes, filename: str) -> ValidationResult:
    """Validate file by real MIME type (magic bytes) and size."""
    if len(data) > settings.MAX_FILE_SIZE:
        return ValidationResult(
            is_valid=False,
            error=f"File size exceeds {settings.MAX_FILE_SIZE // (1024 * 1024)}MB limit",
        )

    mime_type = magic.from_buffer(data, mime=True)

    if mime_type not in settings.ALLOWED_MIME_TYPES:
        return ValidationResult(
            is_valid=False,
            mime_type=mime_type,
            error=f"File type '{mime_type}' is not allowed",
        )

    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    allowed_extensions = settings.ALLOWED_MIME_TYPES[mime_type]
    if ext not in allowed_extensions:
        return ValidationResult(
            is_valid=False,
            mime_type=mime_type,
            error=f"Extension '{ext}' does not match detected type '{mime_type}'",
        )

    return ValidationResult(is_valid=True, mime_type=mime_type)
