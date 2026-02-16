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
    data = b"x" * (50 * 1024 * 1024 + 1)
    result = validate_file(data, "huge.png")
    assert result.is_valid is False
    assert "size" in result.error.lower()


def test_rejects_fake_extension():
    data = (FIXTURES / "sample.png").read_bytes()
    result = validate_file(data, "malware.exe")
    assert result.is_valid is False
