import { useState, useCallback, useRef } from 'react';
import { Upload, FileText, X, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { Progress } from './ui/progress';

const ACCEPTED_TYPES = ['.pdf', '.docx', '.doc'];
const MAX_SIZE = 10 * 1024 * 1024;

interface CvUploadZoneProps {
  onUpload: (file: File) => void;
  isUploading: boolean;
  progress: number;
}

export default function CvUploadZone({ onUpload, isUploading, progress }: CvUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback((file: File): boolean => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ACCEPTED_TYPES.includes(ext)) {
      setError(`Invalid file type. Accepted: ${ACCEPTED_TYPES.join(', ')}`);
      return false;
    }
    if (file.size > MAX_SIZE) {
      setError(`File too large. Maximum size: ${Math.round(MAX_SIZE / 1024 / 1024)}MB`);
      return false;
    }
    setError(null);
    return true;
  }, []);

  const handleFile = useCallback(
    (file: File) => {
      if (validateFile(file)) {
        setSelectedFile(file);
      }
    },
    [validateFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleUpload = () => {
    if (selectedFile) {
      onUpload(selectedFile);
    }
  };

  const clearSelection = () => {
    setSelectedFile(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  function formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  return (
    <div className="space-y-3">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors',
          isDragging
            ? 'border-indigo-500 bg-indigo-500/10'
            : 'border-zinc-300 dark:border-zinc-700 bg-zinc-100/50 dark:bg-zinc-900/50 hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-zinc-900',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          onChange={handleInputChange}
          className="hidden"
        />
        <Upload className="mb-3 h-10 w-10 text-zinc-500" />
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Drop your CV here or click to browse
        </p>
        <p className="mt-1 text-xs text-zinc-500">Accepted: PDF, DOCX, DOC (max 10MB)</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md bg-red-600/10 p-3 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {selectedFile && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <div className="flex items-center gap-3">
            <FileText className="h-8 w-8 text-indigo-500" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                {selectedFile.name}
              </p>
              <p className="text-xs text-zinc-500">{formatSize(selectedFile.size)}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={clearSelection} disabled={isUploading}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {isUploading && (
            <div className="mt-3">
              <Progress value={progress} variant={progress === 100 ? 'success' : 'default'} />
              <p className="mt-1 text-right text-xs text-zinc-500">{progress}%</p>
            </div>
          )}

          {!isUploading && (
            <Button className="mt-3 w-full" onClick={handleUpload}>
              Upload CV
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
