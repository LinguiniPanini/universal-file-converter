import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { uploadFile } from '../api/client';

const ACCEPTED_TYPES = {
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'text/markdown': ['.md'],
};

export default function FileUploader({ onUploadComplete }) {
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const onDrop = useCallback(async (acceptedFiles) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    setUploading(true);
    setError(null);
    setProgress(0);

    try {
      const result = await uploadFile(file, setProgress);
      onUploadComplete(result);
    } catch (err) {
      setError(err.response?.data?.detail || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [onUploadComplete]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: 50 * 1024 * 1024,
    multiple: false,
  });

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors
        ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
        ${uploading ? 'pointer-events-none opacity-60' : ''}`}
    >
      <input {...getInputProps()} />
      {uploading ? (
        <div>
          <p className="text-lg font-medium text-gray-700">Uploading... {progress}%</p>
          <div className="mt-4 w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : isDragActive ? (
        <p className="text-lg text-blue-600">Drop the file here...</p>
      ) : (
        <div>
          <p className="text-lg text-gray-600">
            Drag & drop a file here, or <span className="text-blue-500 underline">click to browse</span>
          </p>
          <p className="mt-2 text-sm text-gray-400">
            PNG, JPEG, WebP, PDF, DOCX, Markdown — Max 50MB
          </p>
        </div>
      )}
      {error && <p className="mt-4 text-red-500 text-sm">{error}</p>}
    </div>
  );
}
