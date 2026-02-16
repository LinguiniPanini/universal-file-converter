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

    try:
        lines = []
        with pdfplumber.open(tmp_path) as pdf:
            for i, page in enumerate(pdf.pages):
                text = page.extract_text()
                if text:
                    if i > 0:
                        lines.append("\n---\n")
                    lines.append(text)
        return "\n\n".join(lines).encode("utf-8")
    finally:
        Path(tmp_path).unlink(missing_ok=True)
