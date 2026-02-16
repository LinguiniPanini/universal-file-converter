from pydantic import BaseModel


class UploadResponse(BaseModel):
    job_id: str
    filename: str
    mime_type: str
    size: int


class ConvertRequest(BaseModel):
    job_id: str
    target_format: str
    options: dict = {}


class ConvertResponse(BaseModel):
    job_id: str
    download_filename: str
    size: int


class ErrorResponse(BaseModel):
    detail: str
