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
