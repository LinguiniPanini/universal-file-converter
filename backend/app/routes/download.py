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
