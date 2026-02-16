# Universal File Converter — Design Document

**Date:** 2026-02-15
**Status:** Implemented and deployed

## Overview

Web application that converts files between formats (images and documents), deployed on AWS EC2 with S3 for temporary storage.

## Decisions

| Aspect | Decision |
|---|---|
| Backend | Python + FastAPI |
| Frontend | React + Vite + Tailwind CSS |
| Web server | Nginx (reverse proxy + serves React build) |
| Images | Pillow (PNG, JPEG, WebP — convert, compress, resize, strip metadata) |
| Word -> PDF | LibreOffice headless (`libreoffice --headless --convert-to pdf`) |
| Markdown -> PDF | `markdown` lib -> HTML -> WeasyPrint |
| PDF -> Markdown | pdfplumber (text extraction) |
| Storage | AWS S3 — single bucket, `uploads/` and `converted/` prefixes |
| Data flow | Approach A pure: Client -> EC2 -> S3, EC2 -> Client |
| Security | python-magic MIME validation, whitelist, UUID filenames, rate limiting, minimal IAM |
| EC2 instance | t3.small minimum (LibreOffice requires RAM) |
| Extra features V1 | Image compression, metadata stripping |
| Scale | 1-10 concurrent users, synchronous processing |
| Max file size | 50 MB |
| Deployment | 2-script approach: `01-setup-aws.sh` (infrastructure) + `02-setup-server.sh` (server config) |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      EC2 Instance                       │
│                                                         │
│  ┌──────────┐    ┌──────────────────┐    ┌──────────┐  │
│  │  React   │    │   FastAPI         │    │  boto3   │  │
│  │  (Vite   │───>│                   │───>│  S3      │  │
│  │  build)  │    │  /api/upload      │    │  Client  │  │
│  │  served  │    │  /api/convert     │    │          │  │
│  │  by      │    │  /api/download/id │    └──────────┘  │
│  │  Nginx)  │    │                   │          │       │
│  └──────────┘    │  ┌─────────────┐  │          v       │
│                  │  │ Conversion  │  │    ┌──────────┐  │
│                  │  │ Engine      │  │    │   AWS     │  │
│                  │  └─────────────┘  │    │   S3     │  │
│                  └──────────────────┘    │  Bucket  │  │
│                                          └──────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    AWS us-east-1                         │
│                                                         │
│  ┌──────────────────┐    ┌──────────────────────────┐  │
│  │  Security Group   │    │  IAM Instance Profile    │  │
│  │  SSH:22, HTTP:80  │    │  S3 permissions only     │  │
│  └────────┬─────────┘    └────────────┬─────────────┘  │
│           │                           │                 │
│           v                           v                 │
│  ┌─────────────────────────────────────┐                │
│  │        EC2 (t3.small)               │                │
│  │  ┌──────────┐  ┌────────────────┐   │                │
│  │  │  Nginx   │  │ systemd svc    │   │                │
│  │  │  :80     │──│ uvicorn :8000  │   │                │
│  │  └──────────┘  └────────────────┘   │                │
│  │  ┌──────────────────────────────┐   │                │
│  │  │  Cron: cleanup_s3.py /15min  │   │                │
│  │  └──────────────────────────────┘   │                │
│  └─────────────────────────────────────┘                │
│                                                         │
│  ┌──────────────────────────────────────┐               │
│  │  S3 Bucket                           │               │
│  │  - Public access blocked             │               │
│  │  - Lifecycle: auto-delete 24h        │               │
│  │  - Cron: cleanup objects > 1h        │               │
│  └──────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────┘
```

## Data Flow

1. User drags file -> React sends POST multipart to `/api/upload`
2. FastAPI validates real MIME type (python-magic), size <= 50MB
3. Original file uploaded to S3 at `uploads/{uuid}/{filename}`
4. User selects target format -> POST `/api/convert` -> engine downloads from S3, processes, uploads result to `converted/{uuid}/`
5. GET `/api/download/{job_id}` -> FastAPI reads from S3 and streams to client
6. S3 Lifecycle Policy deletes all files after 24 hours; cron job cleans files older than 1 hour

## S3 Bucket Structure

```
file-converter-bucket-{account-id}/
├── uploads/{uuid}/{original-filename}
└── converted/{uuid}/{converted-filename}
```

### Lifecycle Policy

- All objects expire after 1 day (S3 minimum)
- Supplementary cron job on EC2 deletes objects older than 1 hour via boto3

## Supported Conversions

### Images (Pillow)
- PNG <-> JPEG <-> WebP (any direction)
- Compression (quality parameter)
- Metadata stripping (EXIF removal)
- Resize (custom dimensions — backend only, no UI)

### Documents
- Word (DOCX) -> PDF (LibreOffice headless)
- Markdown -> PDF (markdown -> HTML -> WeasyPrint)
- PDF -> Markdown (pdfplumber text extraction)

## Security

| Layer | Protection | Implementation |
|---|---|---|
| MIME validation | Verify real file type, not extension | python-magic reads magic bytes |
| Strict whitelist | Only allow specific MIME types | Reject anything not in allowed list |
| Size limit | Prevent DoS via large files | 50MB limit in FastAPI + Nginx `client_max_body_size` |
| Filename sanitization | Prevent path traversal | `os.path.basename()` before S3 key construction |
| UUID validation | Prevent injection in job_id | Regex check before S3 operations |
| Isolated processing | Prevent code execution from embedded content | Process in `tempfile` directory, delete immediately after |
| Rate limiting | Prevent abuse | `slowapi` — 10 requests/minute per IP on upload and convert |
| Minimal IAM | Least privilege | EC2 Instance Profile: only S3 operations on specific bucket |
| No access keys | Prevent credential leaks | IAM Instance Profile provides credentials automatically |
| S3 public block | Prevent data exposure | All 4 public access block settings enabled |
| Nginx headers | Prevent MIME sniffing and clickjacking | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` |
| CORS | Prevent cross-origin abuse | Configurable via `CORS_ORIGINS` env var, never `"*"` |

## Tech Stack

### Backend (Python)
- FastAPI
- Pillow
- LibreOffice (headless, via subprocess)
- WeasyPrint
- pdfplumber
- python-magic
- boto3
- slowapi
- uvicorn

### Frontend (React)
- Vite
- Axios
- react-dropzone
- Tailwind CSS

### Infrastructure
- AWS EC2 (t3.small)
- AWS S3 (single bucket with lifecycle policy)
- Nginx (reverse proxy)
- IAM Instance Profile (no access keys)
- systemd (process management)
- Cron (S3 cleanup every 15 min)

### Deployment
- `deploy/01-setup-aws.sh` — Infrastructure creation (Key Pair, Security Group, IAM Role, Instance Profile, S3 Bucket, EC2 Instance)
- `deploy/02-setup-server.sh` — Server setup (Python, Node.js, Nginx, systemd, cron)

## V1 Extra Features

1. **Image compression** — Pillow quality parameter, user selects compression level
2. **Metadata stripping** — Remove EXIF data from images (GPS, camera info, etc.)

## Future (V2)

- PDF -> DOCX conversion
- OCR (Tesseract / pytesseract)
- PDF watermarks (PyPDF2)
- Batch conversion (ZIP upload)
- HTTPS/SSL (Let's Encrypt + certbot)
- File preview / thumbnails
