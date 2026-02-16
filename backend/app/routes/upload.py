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
