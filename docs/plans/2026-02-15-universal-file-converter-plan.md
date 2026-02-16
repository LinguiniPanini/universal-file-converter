# Universal File Converter — Implementation Plan

> **Status:** COMPLETED (2026-02-16). All 18 tasks implemented, code reviewed, and deployed to AWS EC2.

**Goal:** Build a web app that converts files between image formats (PNG/JPEG/WebP) and document formats (PDF/DOCX/Markdown), deployed on AWS EC2 with S3 storage.

**Architecture:** Python FastAPI backend handles uploads, validation, and conversion. React frontend provides drag-and-drop UI. Nginx serves the React build and proxies API calls to FastAPI. All files flow through EC2 to/from S3. Single S3 bucket with lifecycle policy for auto-cleanup.

**Tech Stack:** FastAPI, Pillow, LibreOffice headless, WeasyPrint, pdfplumber, python-magic, boto3, React, Vite, Tailwind CSS, Axios, react-dropzone, Nginx.

**Design Doc:** `docs/plans/2026-02-15-universal-file-converter-design.md`

### Post-Implementation Changes
- `pdf2docx` removed from requirements (PDF->DOCX not implemented in V1)
- `app/limiter.py` created to avoid circular imports between `main.py` and routes
- CORS changed from `allow_origins=["*"]` to configurable `CORS_ORIGINS` env var
- S3Service uses module-level singleton instead of per-route instances
- Upload route sanitizes filenames with `os.path.basename()`
- Convert route reads MIME from S3 metadata instead of re-detecting
- Download/convert routes validate job_id as UUID format
- Upload route caps reads at `MAX_FILE_SIZE + 1` for early rejection
- Deploy scripts added: `deploy/01-setup-aws.sh` + `deploy/02-setup-server.sh`
- Extensive educational comments added to all source files (in Spanish)

---

## Project Structure

```
universal-file-converter/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py              # FastAPI app entry point
│   │   ├── config.py            # Settings (S3 bucket, limits, etc.)
│   │   ├── routes/
│   │   │   ├── __init__.py
│   │   │   ├── upload.py        # POST /api/upload
│   │   │   ├── convert.py       # POST /api/convert
│   │   │   └── download.py      # GET /api/download/{job_id}
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── s3.py            # S3 upload/download/delete
│   │   │   ├── validator.py     # MIME validation, size check
│   │   │   ├── image_converter.py   # Pillow-based conversions
│   │   │   └── document_converter.py # LibreOffice, WeasyPrint, pdf2docx
│   │   └── models/
│   │       ├── __init__.py
│   │       └── schemas.py       # Pydantic models
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── conftest.py          # Fixtures (test files, mock S3)
│   │   ├── test_validator.py
│   │   ├── test_image_converter.py
│   │   ├── test_document_converter.py
│   │   ├── test_upload_route.py
│   │   ├── test_convert_route.py
│   │   └── test_download_route.py
│   ├── test_fixtures/           # Small test files for each format
│   │   ├── sample.png
│   │   ├── sample.jpg
│   │   ├── sample.webp
│   │   ├── sample.pdf
│   │   ├── sample.docx
│   │   └── sample.md
│   ├── requirements.txt
│   └── pytest.ini
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   ├── components/
│   │   │   ├── FileUploader.jsx
│   │   │   ├── ConversionPanel.jsx
│   │   │   ├── FilePreview.jsx
│   │   │   └── DownloadButton.jsx
│   │   ├── api/
│   │   │   └── client.js
│   │   └── index.css
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── postcss.config.js
├── nginx/
│   └── file-converter.conf
├── scripts/
│   └── cleanup_s3.py
└── docs/
    └── plans/
```

---

## Task 1: Backend scaffolding

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/pytest.ini`
- Create: `backend/app/__init__.py`
- Create: `backend/app/config.py`
- Create: `backend/app/main.py`
- Create: `backend/tests/__init__.py`

**Step 1: Create requirements.txt**

```txt
fastapi==0.115.6
uvicorn[standard]==0.34.0
python-multipart==0.0.20
boto3==1.36.4
python-magic==0.4.27
Pillow==11.1.0
WeasyPrint==63.1
markdown==3.7
pdf2docx==0.5.8
pdfplumber==0.11.4
slowapi==0.1.9
pytest==8.3.4
httpx==0.28.1
moto[s3]==5.0.27
pytest-asyncio==0.25.0
```

**Step 2: Create pytest.ini**

```ini
[pytest]
testpaths = tests
asyncio_mode = auto
```

**Step 3: Create config.py**

```python
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
        "text/plain": [".md"],  # Some systems detect .md as text/plain
    }
    UPLOAD_PREFIX: str = "uploads"
    CONVERTED_PREFIX: str = "converted"


settings = Settings()
```

**Step 4: Create main.py with health check**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Universal File Converter")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tighten in production
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health_check():
    return {"status": "ok"}
```

**Step 5: Create empty __init__.py files**

```python
# backend/app/__init__.py — empty
# backend/tests/__init__.py — empty
```

**Step 6: Install dependencies and verify**

Run:
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```
Expected: All packages install without errors.

**Step 7: Write test for health check**

Create `backend/tests/test_health.py`:

```python
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

**Step 8: Run test**

Run: `cd backend && python -m pytest tests/test_health.py -v`
Expected: PASS

**Step 9: Commit**

```bash
git add backend/
git commit -m "feat: scaffold backend with FastAPI, config, and health check"
```

---

## Task 2: File validator service

**Files:**
- Create: `backend/app/services/__init__.py`
- Create: `backend/app/services/validator.py`
- Create: `backend/tests/test_validator.py`
- Create: `backend/test_fixtures/sample.md`

**Step 1: Create test fixtures directory with a sample markdown file**

Create `backend/test_fixtures/sample.md`:

```markdown
# Test Document

This is a **test** markdown file.
```

**Step 2: Generate binary test fixtures**

Create `backend/tests/generate_fixtures.py` (run once, then delete):

```python
"""Run this script once to generate test fixture files."""
from pathlib import Path
from PIL import Image
from docx import Document

fixtures = Path(__file__).parent.parent / "test_fixtures"
fixtures.mkdir(exist_ok=True)

# Images
for fmt, ext in [("PNG", "png"), ("JPEG", "jpg"), ("WEBP", "webp")]:
    img = Image.new("RGB", (100, 100), color="red")
    img.save(fixtures / f"sample.{ext}", format=fmt)

# DOCX
doc = Document()
doc.add_paragraph("Test document content")
doc.save(fixtures / "sample.docx")

# PDF — create minimal valid PDF
pdf_bytes = (
    b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
    b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
    b"3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\n"
    b"xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n"
    b"0000000058 00000 n \n0000000115 00000 n \n"
    b"trailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF"
)
(fixtures / "sample.pdf").write_bytes(pdf_bytes)

print("Fixtures generated successfully.")
```

Run: `cd backend && python tests/generate_fixtures.py`
Expected: Files created in `test_fixtures/`.

**Step 3: Write failing tests for validator**

Create `backend/tests/test_validator.py`:

```python
from pathlib import Path

import pytest

from app.services.validator import validate_file

FIXTURES = Path(__file__).parent.parent / "test_fixtures"


def test_valid_png():
    data = (FIXTURES / "sample.png").read_bytes()
    result = validate_file(data, "photo.png")
    assert result.is_valid is True
    assert result.mime_type == "image/png"


def test_valid_jpeg():
    data = (FIXTURES / "sample.jpg").read_bytes()
    result = validate_file(data, "photo.jpg")
    assert result.is_valid is True
    assert result.mime_type == "image/jpeg"


def test_valid_docx():
    data = (FIXTURES / "sample.docx").read_bytes()
    result = validate_file(data, "document.docx")
    assert result.is_valid is True


def test_valid_markdown():
    data = (FIXTURES / "sample.md").read_bytes()
    result = validate_file(data, "readme.md")
    assert result.is_valid is True


def test_rejects_unknown_type():
    data = b"#!/bin/bash\nrm -rf /"
    result = validate_file(data, "script.sh")
    assert result.is_valid is False
    assert "not allowed" in result.error.lower()


def test_rejects_oversized_file():
    data = b"x" * (50 * 1024 * 1024 + 1)  # 50MB + 1 byte
    result = validate_file(data, "huge.png")
    assert result.is_valid is False
    assert "size" in result.error.lower()


def test_rejects_fake_extension():
    """A PNG file with a .exe extension should be rejected."""
    data = (FIXTURES / "sample.png").read_bytes()
    result = validate_file(data, "malware.exe")
    assert result.is_valid is False
```

**Step 4: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_validator.py -v`
Expected: FAIL — `ImportError: cannot import name 'validate_file'`

**Step 5: Implement validator**

Create `backend/app/services/__init__.py` (empty).

Create `backend/app/services/validator.py`:

```python
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
    # Check size
    if len(data) > settings.MAX_FILE_SIZE:
        return ValidationResult(
            is_valid=False,
            error=f"File size exceeds {settings.MAX_FILE_SIZE // (1024 * 1024)}MB limit",
        )

    # Detect real MIME type from magic bytes
    mime_type = magic.from_buffer(data, mime=True)

    # Check if MIME type is allowed
    if mime_type not in settings.ALLOWED_MIME_TYPES:
        return ValidationResult(
            is_valid=False,
            mime_type=mime_type,
            error=f"File type '{mime_type}' is not allowed",
        )

    # Check extension matches MIME type
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    allowed_extensions = settings.ALLOWED_MIME_TYPES[mime_type]
    if ext not in allowed_extensions:
        return ValidationResult(
            is_valid=False,
            mime_type=mime_type,
            error=f"Extension '{ext}' does not match detected type '{mime_type}'",
        )

    return ValidationResult(is_valid=True, mime_type=mime_type)
```

**Step 6: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_validator.py -v`
Expected: All PASS

**Step 7: Commit**

```bash
git add backend/app/services/ backend/tests/test_validator.py backend/test_fixtures/ backend/tests/generate_fixtures.py
git commit -m "feat: add file validator with MIME type checking and size limits"
```

---

## Task 3: S3 service

**Files:**
- Create: `backend/app/services/s3.py`
- Create: `backend/tests/test_s3.py`
- Create: `backend/tests/conftest.py`

**Step 1: Write conftest with mocked S3**

Create `backend/tests/conftest.py`:

```python
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
```

**Step 2: Write failing tests for S3 service**

Create `backend/tests/test_s3.py`:

```python
from moto import mock_aws

from app.services.s3 import S3Service


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

    # Attempting to download deleted file should raise
    import pytest
    with pytest.raises(Exception):
        svc.download(key)
```

**Step 3: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_s3.py -v`
Expected: FAIL — `ImportError`

**Step 4: Implement S3 service**

Create `backend/app/services/s3.py`:

```python
import boto3

from app.config import settings


class S3Service:
    def __init__(self, client=None):
        self.client = client or boto3.client("s3", region_name=settings.AWS_REGION)
        self.bucket = settings.S3_BUCKET

    def upload(self, data: bytes, job_id: str, filename: str) -> str:
        """Upload original file. Returns the S3 key."""
        key = f"{settings.UPLOAD_PREFIX}/{job_id}/{filename}"
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data)
        return key

    def upload_converted(self, data: bytes, job_id: str, filename: str) -> str:
        """Upload converted file. Returns the S3 key."""
        key = f"{settings.CONVERTED_PREFIX}/{job_id}/{filename}"
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data)
        return key

    def download(self, key: str) -> bytes:
        """Download file from S3. Returns bytes."""
        response = self.client.get_object(Bucket=self.bucket, Key=key)
        return response["Body"].read()

    def delete(self, key: str) -> None:
        """Delete file from S3."""
        self.client.delete_object(Bucket=self.bucket, Key=key)
```

**Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_s3.py -v`
Expected: All PASS

**Step 6: Commit**

```bash
git add backend/app/services/s3.py backend/tests/test_s3.py backend/tests/conftest.py
git commit -m "feat: add S3 service with upload, download, and delete operations"
```

---

## Task 4: Image converter service

**Files:**
- Create: `backend/app/services/image_converter.py`
- Create: `backend/tests/test_image_converter.py`

**Step 1: Write failing tests**

Create `backend/tests/test_image_converter.py`:

```python
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
    assert len(result) < len(data)


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
```

**Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_image_converter.py -v`
Expected: FAIL — `ImportError`

**Step 3: Implement image converter**

Create `backend/app/services/image_converter.py`:

```python
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

    # JPEG doesn't support alpha channel
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
```

**Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_image_converter.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add backend/app/services/image_converter.py backend/tests/test_image_converter.py
git commit -m "feat: add image converter with format conversion, compression, resize, metadata strip"
```

---

## Task 5: Document converter service

**Files:**
- Create: `backend/app/services/document_converter.py`
- Create: `backend/tests/test_document_converter.py`

**Prerequisites:** LibreOffice must be installed on the system. On Ubuntu/Debian:
```bash
sudo apt-get install -y libreoffice-writer
```

**Step 1: Write failing tests**

Create `backend/tests/test_document_converter.py`:

```python
from pathlib import Path

import pytest

from app.services.document_converter import (
    markdown_to_pdf,
    docx_to_pdf,
    pdf_to_markdown,
)

FIXTURES = Path(__file__).parent.parent / "test_fixtures"


def test_markdown_to_pdf():
    data = (FIXTURES / "sample.md").read_bytes()
    result = markdown_to_pdf(data)
    assert result[:5] == b"%PDF-"


def test_docx_to_pdf():
    data = (FIXTURES / "sample.docx").read_bytes()
    result = docx_to_pdf(data)
    assert result[:5] == b"%PDF-"


def test_pdf_to_markdown():
    # Use a PDF with actual text content for this test.
    # We'll generate one from markdown first, then convert back.
    md_data = b"# Hello World\n\nThis is a test paragraph."
    pdf_data = markdown_to_pdf(md_data)
    result = pdf_to_markdown(pdf_data)
    assert isinstance(result, bytes)
    assert len(result) > 0
```

**Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_document_converter.py -v`
Expected: FAIL — `ImportError`

**Step 3: Implement document converter**

Create `backend/app/services/document_converter.py`:

```python
import subprocess
import tempfile
from pathlib import Path

import markdown as md_lib
import pdfplumber
from weasyprint import HTML


def markdown_to_pdf(data: bytes) -> bytes:
    """Convert Markdown bytes to PDF via HTML intermediate."""
    md_text = data.decode("utf-8")
    html_content = md_lib.markdown(md_text, extensions=["tables", "fenced_code"])

    styled_html = f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8">
    <style>
        body {{ font-family: sans-serif; margin: 40px; line-height: 1.6; }}
        code {{ background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }}
        pre {{ background: #f4f4f4; padding: 16px; border-radius: 6px; }}
        table {{ border-collapse: collapse; width: 100%; }}
        th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
    </style>
    </head>
    <body>{html_content}</body>
    </html>
    """

    return HTML(string=styled_html).write_pdf()


def docx_to_pdf(data: bytes) -> bytes:
    """Convert DOCX to PDF using LibreOffice headless."""
    with tempfile.TemporaryDirectory() as tmpdir:
        input_path = Path(tmpdir) / "input.docx"
        input_path.write_bytes(data)

        subprocess.run(
            [
                "libreoffice",
                "--headless",
                "--convert-to", "pdf",
                "--outdir", tmpdir,
                str(input_path),
            ],
            check=True,
            capture_output=True,
            timeout=60,
        )

        output_path = Path(tmpdir) / "input.pdf"
        if not output_path.exists():
            raise RuntimeError("LibreOffice conversion failed: output file not found")

        return output_path.read_bytes()


def pdf_to_markdown(data: bytes) -> bytes:
    """Extract text from PDF and format as Markdown."""
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(data)
        f.flush()
        tmp_path = f.name

    lines = []
    with pdfplumber.open(tmp_path) as pdf:
        for i, page in enumerate(pdf.pages):
            text = page.extract_text()
            if text:
                if i > 0:
                    lines.append("\n---\n")
                lines.append(text)

    Path(tmp_path).unlink(missing_ok=True)
    return "\n\n".join(lines).encode("utf-8")
```

**Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_document_converter.py -v`
Expected: All PASS (requires LibreOffice installed)

**Step 5: Commit**

```bash
git add backend/app/services/document_converter.py backend/tests/test_document_converter.py
git commit -m "feat: add document converter (markdown->pdf, docx->pdf, pdf->markdown)"
```

---

## Task 6: Pydantic schemas

**Files:**
- Create: `backend/app/models/__init__.py`
- Create: `backend/app/models/schemas.py`

**Step 1: Create schemas**

Create `backend/app/models/__init__.py` (empty).

Create `backend/app/models/schemas.py`:

```python
from pydantic import BaseModel


class UploadResponse(BaseModel):
    job_id: str
    filename: str
    mime_type: str
    size: int


class ConvertRequest(BaseModel):
    job_id: str
    target_format: str  # e.g. "image/jpeg", "application/pdf"
    options: dict = {}   # e.g. {"width": 800, "height": 600, "quality": 70}


class ConvertResponse(BaseModel):
    job_id: str
    download_filename: str
    size: int


class ErrorResponse(BaseModel):
    detail: str
```

**Step 2: Commit**

```bash
git add backend/app/models/
git commit -m "feat: add Pydantic schemas for API request/response models"
```

---

## Task 7: Upload route

**Files:**
- Create: `backend/app/routes/__init__.py`
- Create: `backend/app/routes/upload.py`
- Create: `backend/tests/test_upload_route.py`
- Modify: `backend/app/main.py` — register router

**Step 1: Write failing tests**

Create `backend/app/routes/__init__.py` (empty).

Create `backend/tests/test_upload_route.py`:

```python
from pathlib import Path
from unittest.mock import patch, MagicMock

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
FIXTURES = Path(__file__).parent.parent / "test_fixtures"


@patch("app.routes.upload.s3_service")
def test_upload_valid_png(mock_s3):
    mock_s3.upload.return_value = "uploads/some-uuid/sample.png"

    with open(FIXTURES / "sample.png", "rb") as f:
        response = client.post("/api/upload", files={"file": ("sample.png", f, "image/png")})

    assert response.status_code == 200
    data = response.json()
    assert data["filename"] == "sample.png"
    assert data["mime_type"] == "image/png"
    assert "job_id" in data


def test_upload_rejects_no_file():
    response = client.post("/api/upload")
    assert response.status_code == 422


@patch("app.routes.upload.s3_service")
def test_upload_rejects_invalid_type(mock_s3):
    response = client.post(
        "/api/upload",
        files={"file": ("script.sh", b"#!/bin/bash\necho hi", "text/x-shellscript")},
    )
    assert response.status_code == 400
```

**Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_upload_route.py -v`
Expected: FAIL

**Step 3: Implement upload route**

Create `backend/app/routes/upload.py`:

```python
import uuid

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.models.schemas import UploadResponse
from app.services.s3 import S3Service
from app.services.validator import validate_file

router = APIRouter()
s3_service = S3Service()


@router.post("/api/upload", response_model=UploadResponse)
async def upload_file(file: UploadFile = File(...)):
    data = await file.read()

    result = validate_file(data, file.filename or "unknown")
    if not result.is_valid:
        raise HTTPException(status_code=400, detail=result.error)

    job_id = str(uuid.uuid4())
    s3_service.upload(data, job_id, file.filename)

    return UploadResponse(
        job_id=job_id,
        filename=file.filename,
        mime_type=result.mime_type,
        size=len(data),
    )
```

**Step 4: Register router in main.py**

Modify `backend/app/main.py` — add after the health check:

```python
from app.routes.upload import router as upload_router

app.include_router(upload_router)
```

**Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_upload_route.py -v`
Expected: All PASS

**Step 6: Commit**

```bash
git add backend/app/routes/ backend/tests/test_upload_route.py backend/app/main.py
git commit -m "feat: add upload route with validation and S3 storage"
```

---

## Task 8: Convert route

**Files:**
- Create: `backend/app/routes/convert.py`
- Create: `backend/tests/test_convert_route.py`
- Modify: `backend/app/main.py` — register router

**Step 1: Write failing tests**

Create `backend/tests/test_convert_route.py`:

```python
from pathlib import Path
from unittest.mock import patch, MagicMock

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
FIXTURES = Path(__file__).parent.parent / "test_fixtures"


@patch("app.routes.convert.s3_service")
def test_convert_png_to_jpeg(mock_s3):
    png_data = (FIXTURES / "sample.png").read_bytes()
    mock_s3.download.return_value = png_data
    mock_s3.upload_converted.return_value = "converted/uuid/output.jpg"

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
    mock_s3.upload_converted.return_value = "converted/uuid/output.pdf"

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
```

**Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_convert_route.py -v`
Expected: FAIL

**Step 3: Implement convert route**

Create `backend/app/routes/convert.py`:

```python
import magic
from fastapi import APIRouter, HTTPException

from app.models.schemas import ConvertRequest, ConvertResponse
from app.services.image_converter import (
    MIME_TO_EXT,
    compress_image,
    convert_image,
    resize_image,
    strip_metadata,
)
from app.services.document_converter import (
    docx_to_pdf,
    markdown_to_pdf,
    pdf_to_markdown,
)
from app.services.s3 import S3Service

router = APIRouter()
s3_service = S3Service()

IMAGE_MIMES = {"image/png", "image/jpeg", "image/webp"}
DOC_MIMES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/markdown",
    "text/plain",
}

TARGET_EXTENSIONS = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
    "text/markdown": ".md",
}


@router.post("/api/convert", response_model=ConvertResponse)
async def convert_file(req: ConvertRequest):
    # Download original from S3
    try:
        key = f"uploads/{req.job_id}/"
        # List objects with prefix to find the file
        objects = s3_service.client.list_objects_v2(
            Bucket=s3_service.bucket, Prefix=key
        )
        if "Contents" not in objects or not objects["Contents"]:
            raise HTTPException(status_code=404, detail="File not found")

        file_key = objects["Contents"][0]["Key"]
        data = s3_service.download(file_key)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"File not found: {e}")

    source_mime = magic.from_buffer(data, mime=True)
    target_mime = req.target_format
    options = req.options

    # Route to correct converter
    try:
        if source_mime in IMAGE_MIMES and target_mime in IMAGE_MIMES:
            result = convert_image(data, source_mime, target_mime)
        elif source_mime in IMAGE_MIMES and options.get("action") == "compress":
            result = compress_image(data, quality=options.get("quality", 70))
            target_mime = "image/jpeg"
        elif source_mime in IMAGE_MIMES and options.get("action") == "resize":
            result = resize_image(data, options["width"], options["height"])
            target_mime = source_mime
        elif source_mime in IMAGE_MIMES and options.get("action") == "strip_metadata":
            result = strip_metadata(data)
            target_mime = source_mime
        elif source_mime in ("text/markdown", "text/plain") and target_mime == "application/pdf":
            result = markdown_to_pdf(data)
        elif source_mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document" and target_mime == "application/pdf":
            result = docx_to_pdf(data)
        elif source_mime == "application/pdf" and target_mime == "text/markdown":
            result = pdf_to_markdown(data)
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Conversion from '{source_mime}' to '{target_mime}' is not supported",
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Conversion failed: {e}")

    ext = TARGET_EXTENSIONS.get(target_mime, ".bin")
    output_filename = f"converted{ext}"

    s3_service.upload_converted(result, req.job_id, output_filename)

    return ConvertResponse(
        job_id=req.job_id,
        download_filename=output_filename,
        size=len(result),
    )
```

**Step 4: Register router in main.py**

Add to `backend/app/main.py`:

```python
from app.routes.convert import router as convert_router

app.include_router(convert_router)
```

**Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_convert_route.py -v`
Expected: All PASS

**Step 6: Commit**

```bash
git add backend/app/routes/convert.py backend/tests/test_convert_route.py backend/app/main.py
git commit -m "feat: add convert route with image and document conversion routing"
```

---

## Task 9: Download route

**Files:**
- Create: `backend/app/routes/download.py`
- Create: `backend/tests/test_download_route.py`
- Modify: `backend/app/main.py` — register router

**Step 1: Write failing tests**

Create `backend/tests/test_download_route.py`:

```python
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


@patch("app.routes.download.s3_service")
def test_download_converted_file(mock_s3):
    mock_s3.client.list_objects_v2.return_value = {
        "Contents": [{"Key": "converted/test-uuid/output.pdf"}]
    }
    mock_s3.download.return_value = b"%PDF-1.4 fake content"

    response = client.get("/api/download/test-uuid")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/octet-stream"
    assert b"%PDF-1.4" in response.content


@patch("app.routes.download.s3_service")
def test_download_not_found(mock_s3):
    mock_s3.client.list_objects_v2.return_value = {}

    response = client.get("/api/download/nonexistent-uuid")
    assert response.status_code == 404
```

**Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_download_route.py -v`
Expected: FAIL

**Step 3: Implement download route**

Create `backend/app/routes/download.py`:

```python
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.services.s3 import S3Service

router = APIRouter()
s3_service = S3Service()


@router.get("/api/download/{job_id}")
async def download_file(job_id: str):
    try:
        key_prefix = f"converted/{job_id}/"
        objects = s3_service.client.list_objects_v2(
            Bucket=s3_service.bucket, Prefix=key_prefix
        )

        if "Contents" not in objects or not objects["Contents"]:
            raise HTTPException(status_code=404, detail="Converted file not found")

        file_key = objects["Contents"][0]["Key"]
        filename = file_key.split("/")[-1]
        data = s3_service.download(file_key)

        return Response(
            content=data,
            media_type="application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Download failed: {e}")
```

**Step 4: Register router in main.py**

Add to `backend/app/main.py`:

```python
from app.routes.download import router as download_router

app.include_router(download_router)
```

**Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_download_route.py -v`
Expected: All PASS

**Step 6: Commit**

```bash
git add backend/app/routes/download.py backend/tests/test_download_route.py backend/app/main.py
git commit -m "feat: add download route for retrieving converted files"
```

---

## Task 10: Rate limiting

**Files:**
- Modify: `backend/app/main.py` — add slowapi middleware

**Step 1: Add rate limiting to main.py**

Add to `backend/app/main.py`:

```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
```

Then add `@limiter.limit("10/minute")` decorator to the upload and convert routes.

**Step 2: Run all tests**

Run: `cd backend && python -m pytest -v`
Expected: All PASS

**Step 3: Commit**

```bash
git add backend/app/main.py backend/app/routes/upload.py backend/app/routes/convert.py
git commit -m "feat: add rate limiting (10 requests/minute per IP)"
```

---

## Task 11: Frontend scaffolding

**Files:**
- Create: `frontend/` — full Vite + React + Tailwind project

**Step 1: Create Vite React project**

```bash
cd /path/to/project
npm create vite@latest frontend -- --template react
cd frontend
npm install
npm install axios react-dropzone
npm install -D tailwindcss @tailwindcss/vite
```

**Step 2: Configure Tailwind**

Replace `frontend/src/index.css`:

```css
@import "tailwindcss";
```

Add to `frontend/vite.config.js`:

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
```

**Step 3: Verify dev server starts**

Run: `cd frontend && npm run dev`
Expected: Vite dev server starts on port 5173.

**Step 4: Commit**

```bash
git add frontend/
git commit -m "feat: scaffold React frontend with Vite and Tailwind CSS"
```

---

## Task 12: Frontend — API client

**Files:**
- Create: `frontend/src/api/client.js`

**Step 1: Create API client**

Create `frontend/src/api/client.js`:

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

export async function uploadFile(file, onProgress) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await api.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded * 100) / e.total));
      }
    },
  });

  return response.data;
}

export async function convertFile(jobId, targetFormat, options = {}) {
  const response = await api.post('/convert', {
    job_id: jobId,
    target_format: targetFormat,
    options,
  });

  return response.data;
}

export function getDownloadUrl(jobId) {
  return `/api/download/${jobId}`;
}
```

**Step 2: Commit**

```bash
git add frontend/src/api/
git commit -m "feat: add API client with upload progress support"
```

---

## Task 13: Frontend — FileUploader component

**Files:**
- Create: `frontend/src/components/FileUploader.jsx`

**Step 1: Implement FileUploader**

> **User contribution opportunity:** The drag & drop UX behavior and visual feedback during upload is a design decision. The structure is provided below — the user should review and customize the visual states (idle, dragging, uploading, complete) to match their desired UX.

Create `frontend/src/components/FileUploader.jsx`:

```jsx
import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { uploadFile } from '../api/client';

const ACCEPTED_TYPES = {
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'text/markdown': ['.md'],
};

export default function FileUploader({ onUploadComplete }) {
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const onDrop = useCallback(async (acceptedFiles) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    setUploading(true);
    setError(null);
    setProgress(0);

    try {
      const result = await uploadFile(file, setProgress);
      onUploadComplete(result);
    } catch (err) {
      setError(err.response?.data?.detail || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [onUploadComplete]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: 50 * 1024 * 1024,
    multiple: false,
  });

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors
        ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
        ${uploading ? 'pointer-events-none opacity-60' : ''}`}
    >
      <input {...getInputProps()} />
      {uploading ? (
        <div>
          <p className="text-lg font-medium text-gray-700">Uploading... {progress}%</p>
          <div className="mt-4 w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : isDragActive ? (
        <p className="text-lg text-blue-600">Drop the file here...</p>
      ) : (
        <div>
          <p className="text-lg text-gray-600">
            Drag & drop a file here, or <span className="text-blue-500 underline">click to browse</span>
          </p>
          <p className="mt-2 text-sm text-gray-400">
            PNG, JPEG, WebP, PDF, DOCX, Markdown — Max 50MB
          </p>
        </div>
      )}
      {error && <p className="mt-4 text-red-500 text-sm">{error}</p>}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/FileUploader.jsx
git commit -m "feat: add FileUploader component with drag & drop and progress bar"
```

---

## Task 14: Frontend — ConversionPanel component

**Files:**
- Create: `frontend/src/components/ConversionPanel.jsx`

**Step 1: Implement ConversionPanel**

> **User contribution opportunity:** The conversion options matrix (which source formats can convert to which targets) is a business logic decision. The routing logic below defines valid conversions — the user should review and adjust if they want different conversion paths.

Create `frontend/src/components/ConversionPanel.jsx`:

```jsx
import { useState } from 'react';
import { convertFile, getDownloadUrl } from '../api/client';

const CONVERSION_OPTIONS = {
  'image/png': [
    { label: 'JPEG', value: 'image/jpeg' },
    { label: 'WebP', value: 'image/webp' },
    { label: 'Compress', value: 'compress' },
    { label: 'Strip Metadata', value: 'strip_metadata' },
  ],
  'image/jpeg': [
    { label: 'PNG', value: 'image/png' },
    { label: 'WebP', value: 'image/webp' },
    { label: 'Compress', value: 'compress' },
    { label: 'Strip Metadata', value: 'strip_metadata' },
  ],
  'image/webp': [
    { label: 'PNG', value: 'image/png' },
    { label: 'JPEG', value: 'image/jpeg' },
    { label: 'Compress', value: 'compress' },
    { label: 'Strip Metadata', value: 'strip_metadata' },
  ],
  'application/pdf': [
    { label: 'Markdown', value: 'text/markdown' },
  ],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    { label: 'PDF', value: 'application/pdf' },
  ],
  'text/markdown': [
    { label: 'PDF', value: 'application/pdf' },
  ],
  'text/plain': [
    { label: 'PDF', value: 'application/pdf' },
  ],
};

export default function ConversionPanel({ uploadResult }) {
  const [selectedFormat, setSelectedFormat] = useState('');
  const [converting, setConverting] = useState(false);
  const [downloadReady, setDownloadReady] = useState(false);
  const [error, setError] = useState(null);

  const options = CONVERSION_OPTIONS[uploadResult.mime_type] || [];

  const handleConvert = async () => {
    setConverting(true);
    setError(null);

    try {
      let targetFormat = selectedFormat;
      let opts = {};

      if (selectedFormat === 'compress') {
        targetFormat = uploadResult.mime_type;
        opts = { action: 'compress', quality: 70 };
      } else if (selectedFormat === 'strip_metadata') {
        targetFormat = uploadResult.mime_type;
        opts = { action: 'strip_metadata' };
      }

      await convertFile(uploadResult.job_id, targetFormat, opts);
      setDownloadReady(true);
    } catch (err) {
      setError(err.response?.data?.detail || 'Conversion failed');
    } finally {
      setConverting(false);
    }
  };

  return (
    <div className="mt-8 p-6 bg-white rounded-xl shadow-sm border border-gray-200">
      <h3 className="text-lg font-semibold text-gray-800">
        {uploadResult.filename}
        <span className="ml-2 text-sm font-normal text-gray-400">
          ({(uploadResult.size / 1024).toFixed(1)} KB)
        </span>
      </h3>

      <div className="mt-4 flex items-center gap-4">
        <select
          value={selectedFormat}
          onChange={(e) => { setSelectedFormat(e.target.value); setDownloadReady(false); }}
          className="border border-gray-300 rounded-lg px-4 py-2 text-gray-700"
        >
          <option value="">Select format...</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <button
          onClick={handleConvert}
          disabled={!selectedFormat || converting}
          className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {converting ? 'Converting...' : 'Convert'}
        </button>
      </div>

      {downloadReady && (
        <a
          href={getDownloadUrl(uploadResult.job_id)}
          download
          className="mt-4 inline-block px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
        >
          Download Converted File
        </a>
      )}

      {error && <p className="mt-4 text-red-500 text-sm">{error}</p>}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/ConversionPanel.jsx
git commit -m "feat: add ConversionPanel with format selection and download"
```

---

## Task 15: Frontend — App assembly

**Files:**
- Modify: `frontend/src/App.jsx`

**Step 1: Assemble App**

Replace `frontend/src/App.jsx`:

```jsx
import { useState } from 'react';
import FileUploader from './components/FileUploader';
import ConversionPanel from './components/ConversionPanel';

export default function App() {
  const [uploadResult, setUploadResult] = useState(null);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto py-16 px-4">
        <h1 className="text-3xl font-bold text-gray-900 text-center">
          Universal File Converter
        </h1>
        <p className="mt-2 text-center text-gray-500">
          Convert images and documents between formats
        </p>

        <div className="mt-10">
          <FileUploader onUploadComplete={(result) => {
            setUploadResult(result);
          }} />
        </div>

        {uploadResult && (
          <ConversionPanel uploadResult={uploadResult} />
        )}
      </div>
    </div>
  );
}
```

**Step 2: Run dev server and verify manually**

Run backend: `cd backend && uvicorn app.main:app --reload`
Run frontend: `cd frontend && npm run dev`

Open `http://localhost:5173`, verify drag & drop zone renders.

**Step 3: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: assemble App with FileUploader and ConversionPanel"
```

---

## Task 16: Nginx configuration

**Files:**
- Create: `nginx/file-converter.conf`

**Step 1: Create Nginx config**

Create `nginx/file-converter.conf`:

```nginx
server {
    listen 80;
    server_name _;

    client_max_body_size 50M;
    proxy_read_timeout 120s;

    # Security headers
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;
    add_header X-XSS-Protection "1; mode=block";

    # Serve React build
    location / {
        root /var/www/file-converter;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Proxy API to FastAPI
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

**Step 2: Commit**

```bash
git add nginx/
git commit -m "feat: add Nginx config for serving frontend and proxying API"
```

---

## Task 17: S3 cleanup script

**Files:**
- Create: `scripts/cleanup_s3.py`

**Step 1: Create cleanup script**

Create `scripts/cleanup_s3.py`:

```python
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
```

Crontab entry (add on EC2):
```
*/15 * * * * /path/to/venv/bin/python /path/to/scripts/cleanup_s3.py
```

**Step 2: Commit**

```bash
git add scripts/
git commit -m "feat: add S3 cleanup script for hourly file expiration"
```

---

## Task 18: Run full test suite and verify

**Step 1: Run all backend tests**

Run: `cd backend && python -m pytest -v`
Expected: All tests PASS.

**Step 2: Build frontend**

Run: `cd frontend && npm run build`
Expected: Build succeeds, output in `frontend/dist/`.

**Step 3: Final commit**

```bash
git add -A
git commit -m "chore: verify full test suite passes and frontend builds"
```

---

## Summary

| Task | Description | Estimated steps |
|---|---|---|
| 1 | Backend scaffolding | 9 |
| 2 | File validator | 7 |
| 3 | S3 service | 6 |
| 4 | Image converter | 5 |
| 5 | Document converter | 5 |
| 6 | Pydantic schemas | 2 |
| 7 | Upload route | 6 |
| 8 | Convert route | 6 |
| 9 | Download route | 6 |
| 10 | Rate limiting | 3 |
| 11 | Frontend scaffolding | 4 |
| 12 | API client | 2 |
| 13 | FileUploader component | 2 |
| 14 | ConversionPanel component | 2 |
| 15 | App assembly | 3 |
| 16 | Nginx config | 2 |
| 17 | S3 cleanup script | 2 |
| 18 | Full verification | 3 |

**Total: 18 tasks, ~68 steps**
