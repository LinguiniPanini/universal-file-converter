import os
import uuid

from fastapi import APIRouter, File, HTTPException, UploadFile
from starlette.requests import Request

from app.config import settings
from app.limiter import limiter
from app.models.schemas import UploadResponse
from app.services.s3 import s3_service
from app.services.validator import validate_file

router = APIRouter()


@router.post("/api/upload", response_model=UploadResponse)
@limiter.limit("10/minute")
async def upload_file(request: Request, file: UploadFile = File(...)):
    # Read up to MAX_FILE_SIZE + 1 to detect oversized files without loading everything
    data = await file.read(settings.MAX_FILE_SIZE + 1)
    if len(data) > settings.MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File size exceeds {settings.MAX_FILE_SIZE // (1024 * 1024)}MB limit",
        )

    safe_filename = os.path.basename(file.filename or "unknown")

    result = validate_file(data, safe_filename)
    if not result.is_valid:
        raise HTTPException(status_code=400, detail=result.error)

    job_id = str(uuid.uuid4())
    s3_service.upload(data, job_id, safe_filename, metadata={"mime-type": result.mime_type})

    return UploadResponse(
        job_id=job_id,
        filename=safe_filename,
        mime_type=result.mime_type,
        size=len(data),
    )
