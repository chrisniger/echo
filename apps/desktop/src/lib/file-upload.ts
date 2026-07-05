import { api, gatewayApi } from './api';

export interface UploadResult {
  url: string;
  id: string;
  name: string;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

const CHUNK_SIZE = 5 * 1024 * 1024;

async function uploadChunked(
  file: File,
  url: string,
  onProgress?: (progress: UploadProgress) => void,
): Promise<UploadResult> {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const uploadId = crypto.randomUUID();

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);

    const chunkFormData = new FormData();
    chunkFormData.append('chunk', chunk);
    chunkFormData.append('uploadId', uploadId);
    chunkFormData.append('chunkIndex', String(i));
    chunkFormData.append('totalChunks', String(totalChunks));
    chunkFormData.append('fileName', file.name);

    await api.post('/files/upload/chunk', chunkFormData);

    if (onProgress) {
      const loaded = Math.min((i + 1) * CHUNK_SIZE, file.size);
      onProgress({ loaded, total: file.size, percent: Math.round((loaded / file.size) * 100) });
    }
  }

  const result = await api.post<UploadResult>('/files/upload/complete', {
    uploadId,
    fileName: file.name,
  });

  return result;
}

export async function uploadFile(
  file: File,
  sessionId?: string,
  type: 'cv' | 'document' | 'screenshot' | 'image' = 'document',
  onProgress?: (progress: UploadProgress) => void,
): Promise<UploadResult> {
  if (file.size > CHUNK_SIZE) {
    return uploadChunked(file, '/files/upload', onProgress);
  }

  const formData = new FormData();
  formData.append('file', file);
  if (sessionId) formData.append('sessionId', sessionId);
  formData.append('type', type);

  const isVision = type === 'screenshot' || type === 'image';

  const client = isVision ? gatewayApi : api;

  const result = await client.post<UploadResult>('/files/upload', formData);

  if (onProgress) {
    onProgress({ loaded: file.size, total: file.size, percent: 100 });
  }

  return result;
}

export async function generateThumbnail(file: File): Promise<string | null> {
  if (!file.type.startsWith('image/')) return null;

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxSize = 200;
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        } else {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}
