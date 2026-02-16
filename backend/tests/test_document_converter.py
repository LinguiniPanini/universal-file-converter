from pathlib import Path

import pytest

from app.services.document_converter import (
    markdown_to_pdf,
    pdf_to_markdown,
)

FIXTURES = Path(__file__).parent.parent / "test_fixtures"


def test_markdown_to_pdf():
    data = (FIXTURES / "sample.md").read_bytes()
    result = markdown_to_pdf(data)
    assert result[:5] == b"%PDF-"


def test_pdf_to_markdown():
    md_data = b"# Hello World\n\nThis is a test paragraph."
    pdf_data = markdown_to_pdf(md_data)
    result = pdf_to_markdown(pdf_data)
    assert isinstance(result, bytes)
    assert len(result) > 0
