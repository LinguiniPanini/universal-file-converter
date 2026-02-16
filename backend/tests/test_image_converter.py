from pathlib import Path

from PIL import Image
import io

from app.services.image_converter import convert_image, compress_image, strip_metadata, resize_image

FIXTURES = Path(__file__).parent.parent / "test_fixtures"


def test_png_to_jpeg():
    data = (FIXTURES / "sample.png").read_bytes()
    result = convert_image(data, "image/png", "image/jpeg")
    img = Image.open(io.BytesIO(result))
    assert img.format == "JPEG"


def test_jpeg_to_webp():
    data = (FIXTURES / "sample.jpg").read_bytes()
    result = convert_image(data, "image/jpeg", "image/webp")
    img = Image.open(io.BytesIO(result))
    assert img.format == "WEBP"


def test_webp_to_png():
    data = (FIXTURES / "sample.webp").read_bytes()
    result = convert_image(data, "image/webp", "image/png")
    img = Image.open(io.BytesIO(result))
    assert img.format == "PNG"


def test_compress_image():
    data = (FIXTURES / "sample.png").read_bytes()
    result = compress_image(data, quality=30)
    # Verify output is valid JPEG
    img = Image.open(io.BytesIO(result))
    assert img.format == "JPEG"
    # Verify output is non-empty
    assert len(result) > 0


def test_resize_image():
    data = (FIXTURES / "sample.png").read_bytes()
    result = resize_image(data, width=50, height=50)
    img = Image.open(io.BytesIO(result))
    assert img.size == (50, 50)


def test_strip_metadata():
    data = (FIXTURES / "sample.jpg").read_bytes()
    result = strip_metadata(data)
    img = Image.open(io.BytesIO(result))
    exif = img.getexif()
    assert len(exif) == 0
