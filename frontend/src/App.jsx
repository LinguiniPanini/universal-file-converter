import { useState } from 'react';
import FileUploader from './components/FileUploader';
import ConversionPanel from './components/ConversionPanel';

export default function App() {
  const [uploadResult, setUploadResult] = useState(null);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto py-16 px-4">
        <h1 className="text-3xl font-bold text-gray-900 text-center">
          Universal File Converter
        </h1>
        <p className="mt-2 text-center text-gray-500">
          Convert images and documents between formats
        </p>

        <div className="mt-10">
          <FileUploader onUploadComplete={(result) => {
            setUploadResult(result);
          }} />
        </div>

        {uploadResult && (
          <ConversionPanel uploadResult={uploadResult} />
        )}
      </div>
    </div>
  );
}
