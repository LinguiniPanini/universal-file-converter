# Universal File Converter — Design Document

**Date:** 2026-02-15
**Status:** Approved

## Overview

Web application that converts files between formats (images and documents), deployed on AWS EC2 with S3 for temporary storage.

## Decisions

| Aspect | Decision |
|---|---|
| Backend | Python + FastAPI |
| Frontend | React + Vite + Tailwind CSS |
| Web server | Nginx (reverse proxy + serves React build) |
| Images | Pillow (PNG, JPEG, WebP — convert and resize) |
| Word → PDF | LibreOffice headless (`libreoffice --headless --convert-to pdf`) |
| Markdown → PDF | `markdown` lib → HTML → WeasyPrint |
| PDF → Word | pdf2docx |
| PDF → Markdown | pdfplumber |
| Storage | AWS S3 — single bucket, `uploads/` and `converted/` prefixes |
| Data flow | Approach A pure: Client → EC2 → S3, EC2 → Client |
| Security | python-magic MIME validation, whitelist, UUID filenames, rate limiting, minimal IAM |
| EC2 instance | t3.small minimum (LibreOffice requires RAM) |
| Extra features V1 | Image compression, file preview, metadata stripping |
| Scale | 1-10 concurrent users, synchronous processing |
| Max file size | 50 MB |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      EC2 Instance                       │
│                                                         │
│  ┌──────────┐    ┌──────────────────┐    ┌──────────┐  │
│  │  React   │    │   FastAPI         │    │  boto3   │  │
│  │  (Vite   │───▶│                   │───▶│  S3      │  │
│  │  build)  │    │  /api/upload      │    │  Client  │  │
│  │  served  │    │  /api/convert     │    │          │  │
│  │  by      │    │  /api/download/id │    └──────────┘  │
│  │  Nginx)  │    │                   │          │       │
│  └──────────┘    │  ┌─────────────┐  │          ▼       │
│                  │  │ Conversion  │  │    ┌──────────┐  │
│                  │  │ Engine      │  │    │   AWS     │  │
│                  │  └─────────────┘  │    │   S3     │  │
│                  └──────────────────┘    │  Bucket  │  │
│                                          └──────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Data Flow

1. User drags file → React sends POST multipart to `/api/upload`
2. FastAPI validates real MIME type (python-magic), size ≤ 50MB
3. Original file uploaded to S3 at `uploads/{uuid}/{filename}`
4. User selects target format → POST `/api/convert` → engine downloads from S3, processes, uploads result to `converted/{uuid}/`
5. GET `/api/download/{job_id}` → FastAPI reads from S3 and streams to client
6. S3 Lifecycle Policy deletes all files after 24 hours; cron job cleans files older than 1 hour

## S3 Bucket Structure

```
file-converter-bucket/
├── uploads/{uuid}/{original-filename}
└── converted/{uuid}/{converted-filename}
```

### Lifecycle Policy

- All objects expire after 1 day (S3 minimum)
- Supplementary cron job on EC2 deletes objects older than 1 hour via boto3

## Supported Conversions

### Images (Pillow)
- PNG ↔ JPEG ↔ WebP (any direction)
- Resize (custom dimensions)
- Compression (quality parameter)
- Metadata stripping (EXIF removal)

### Documents
- Word (DOCX) → PDF (LibreOffice headless)
- Markdown → PDF (markdown → HTML → WeasyPrint)
- PDF → Word (pdf2docx)
- PDF → Markdown (pdfplumber)

## Security

| Layer | Protection | Implementation |
|---|---|---|
| MIME validation | Verify real file type, not extension | python-magic reads magic bytes |
| Strict whitelist | Only allow specific MIME types | Reject anything not in allowed list |
| Size limit | Prevent DoS via large files | 50MB limit in FastAPI + Nginx `client_max_body_size` |
| Filename sanitization | Prevent path traversal | Rename to UUID, never use user-provided names for paths |
| Isolated processing | Prevent code execution from embedded content | Process in `tempfile` directory, delete immediately after |
| Rate limiting | Prevent abuse | `slowapi` — 10 conversions/minute per IP |
| Minimal IAM | Least privilege | EC2 Instance Role: only `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on specific bucket |
| No file execution | Prevent RCE | Never execute or interpret file content — only read with conversion libraries |
| Nginx headers | Prevent MIME sniffing and clickjacking | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` |

## Tech Stack

### Backend (Python)
- FastAPI
- Pillow
- LibreOffice (headless, via subprocess)
- WeasyPrint
- pdf2docx
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
- AWS EC2 (t3.small minimum)
- AWS S3 (single bucket)
- Nginx (reverse proxy)
- IAM Instance Role

## V1 Extra Features

1. **Image compression** — Pillow quality parameter, user selects compression level
2. **File preview** — Thumbnail generation before conversion (Pillow for images, pdf2image for PDFs)
3. **Metadata stripping** — Remove EXIF data from images (GPS, camera info, etc.)

## Future (V2)

- OCR (Tesseract / pytesseract)
- PDF watermarks (PyPDF2)
- Batch conversion (ZIP upload)
- Drag & drop multiple files
