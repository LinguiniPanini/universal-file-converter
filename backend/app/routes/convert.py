import re

import magic  # fallback only
from fastapi import APIRouter, HTTPException

from starlette.requests import Request

from app.limiter import limiter
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
from app.services.s3 import s3_service

router = APIRouter()

UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
)

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
@limiter.limit("10/minute")
async def convert_file(request: Request, req: ConvertRequest):
    if not UUID_PATTERN.match(req.job_id):
        raise HTTPException(status_code=400, detail="Invalid job ID format")

    # Download original from S3
    try:
        key = f"uploads/{req.job_id}/"
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

    metadata = s3_service.get_metadata(file_key)
    source_mime = metadata.get("mime-type")
    if not source_mime:
        # Fallback to magic detection if metadata is missing
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
