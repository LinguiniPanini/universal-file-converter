import io

from PIL import Image

MIME_TO_FORMAT = {
    "image/png": "PNG",
    "image/jpeg": "JPEG",
    "image/webp": "WEBP",
}

MIME_TO_EXT = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
}


def convert_image(data: bytes, source_mime: str, target_mime: str) -> bytes:
    """Convert image from one format to another."""
    img = Image.open(io.BytesIO(data))

    if target_mime == "image/jpeg" and img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGB")

    target_format = MIME_TO_FORMAT[target_mime]
    buffer = io.BytesIO()
    img.save(buffer, format=target_format)
    return buffer.getvalue()


def compress_image(data: bytes, quality: int = 70) -> bytes:
    """Compress image by reducing quality. Returns JPEG."""
    img = Image.open(io.BytesIO(data))
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGB")
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG", quality=quality, optimize=True)
    return buffer.getvalue()


def resize_image(data: bytes, width: int, height: int) -> bytes:
    """Resize image to exact dimensions."""
    img = Image.open(io.BytesIO(data))
    img = img.resize((width, height), Image.LANCZOS)
    buffer = io.BytesIO()
    img.save(buffer, format=img.format or "PNG")
    return buffer.getvalue()


def strip_metadata(data: bytes) -> bytes:
    """Remove all EXIF/metadata from image."""
    img = Image.open(io.BytesIO(data))
    clean = Image.new(img.mode, img.size)
    clean.putdata(list(img.getdata()))
    buffer = io.BytesIO()
    clean.save(buffer, format=img.format or "PNG")
    return buffer.getvalue()
