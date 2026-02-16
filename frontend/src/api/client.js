import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

export async function uploadFile(file, onProgress) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await api.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded * 100) / e.total));
      }
    },
  });

  return response.data;
}

export async function convertFile(jobId, targetFormat, options = {}) {
  const response = await api.post('/convert', {
    job_id: jobId,
    target_format: targetFormat,
    options,
  });

  return response.data;
}

export function getDownloadUrl(jobId) {
  return `/api/download/${jobId}`;
}
