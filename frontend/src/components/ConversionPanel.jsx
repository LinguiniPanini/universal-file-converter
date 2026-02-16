import { useState } from 'react';
import { convertFile, getDownloadUrl } from '../api/client';

const CONVERSION_OPTIONS = {
  'image/png': [
    { label: 'JPEG', value: 'image/jpeg' },
    { label: 'WebP', value: 'image/webp' },
    { label: 'Compress', value: 'compress' },
    { label: 'Strip Metadata', value: 'strip_metadata' },
  ],
  'image/jpeg': [
    { label: 'PNG', value: 'image/png' },
    { label: 'WebP', value: 'image/webp' },
    { label: 'Compress', value: 'compress' },
    { label: 'Strip Metadata', value: 'strip_metadata' },
  ],
  'image/webp': [
    { label: 'PNG', value: 'image/png' },
    { label: 'JPEG', value: 'image/jpeg' },
    { label: 'Compress', value: 'compress' },
    { label: 'Strip Metadata', value: 'strip_metadata' },
  ],
  'application/pdf': [
    { label: 'Markdown', value: 'text/markdown' },
  ],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    { label: 'PDF', value: 'application/pdf' },
  ],
  'text/markdown': [
    { label: 'PDF', value: 'application/pdf' },
  ],
  'text/plain': [
    { label: 'PDF', value: 'application/pdf' },
  ],
};

export default function ConversionPanel({ uploadResult }) {
  const [selectedFormat, setSelectedFormat] = useState('');
  const [converting, setConverting] = useState(false);
  const [downloadReady, setDownloadReady] = useState(false);
  const [error, setError] = useState(null);

  const options = CONVERSION_OPTIONS[uploadResult.mime_type] || [];

  const handleConvert = async () => {
    setConverting(true);
    setError(null);

    try {
      let targetFormat = selectedFormat;
      let opts = {};

      if (selectedFormat === 'compress') {
        targetFormat = uploadResult.mime_type;
        opts = { action: 'compress', quality: 70 };
      } else if (selectedFormat === 'strip_metadata') {
        targetFormat = uploadResult.mime_type;
        opts = { action: 'strip_metadata' };
      }

      await convertFile(uploadResult.job_id, targetFormat, opts);
      setDownloadReady(true);
    } catch (err) {
      setError(err.response?.data?.detail || 'Conversion failed');
    } finally {
      setConverting(false);
    }
  };

  return (
    <div className="mt-8 p-6 bg-white rounded-xl shadow-sm border border-gray-200">
      <h3 className="text-lg font-semibold text-gray-800">
        {uploadResult.filename}
        <span className="ml-2 text-sm font-normal text-gray-400">
          ({(uploadResult.size / 1024).toFixed(1)} KB)
        </span>
      </h3>

      <div className="mt-4 flex items-center gap-4">
        <select
          value={selectedFormat}
          onChange={(e) => { setSelectedFormat(e.target.value); setDownloadReady(false); }}
          className="border border-gray-300 rounded-lg px-4 py-2 text-gray-700"
        >
          <option value="">Select format...</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <button
          onClick={handleConvert}
          disabled={!selectedFormat || converting}
          className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {converting ? 'Converting...' : 'Convert'}
        </button>
      </div>

      {downloadReady && (
        <a
          href={getDownloadUrl(uploadResult.job_id)}
          download
          className="mt-4 inline-block px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
        >
          Download Converted File
        </a>
      )}

      {error && <p className="mt-4 text-red-500 text-sm">{error}</p>}
    </div>
  );
}
