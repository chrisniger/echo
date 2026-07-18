export interface OllamaModel {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
  details?: {
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

export interface OllamaStatus {
  connected: boolean;
  models: OllamaModel[];
  error?: string;
}

const OLLAMA_BASE_URL = 'http://localhost:11434';

export async function checkOllamaStatus(): Promise<OllamaStatus> {
  try {
    // Test connection
    const healthResponse = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });

    if (!healthResponse.ok) {
      return {
        connected: false,
        models: [],
        error: `Ollama returned status ${healthResponse.status}`,
      };
    }

    // Fetch models
    const modelsResponse = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });

    if (!modelsResponse.ok) {
      return {
        connected: false,
        models: [],
        error: 'Failed to fetch models',
      };
    }

    const data = await modelsResponse.json();
    const models: OllamaModel[] = data.models || [];

    return {
      connected: true,
      models,
    };
  } catch (error) {
    return {
      connected: false,
      models: [],
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

export async function pullOllamaModel(
  modelName: string,
  onProgress?: (progress: number) => void
): Promise<boolean> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/pull`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: modelName, stream: true }),
    });

    if (!response.ok) {
      return false;
    }

    const reader = response.body?.getReader();
    if (!reader) return false;

    const decoder = new TextDecoder();
    let totalSize = 0;
    let downloadedSize = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          
          if (data.total && data.completed !== undefined) {
            totalSize = data.total;
            downloadedSize = data.completed;
            const progress = totalSize > 0 ? (downloadedSize / totalSize) * 100 : 0;
            onProgress?.(progress);
          }
        } catch {
          // Ignore parse errors
        }
      }
    }

    return true;
  } catch (error) {
    console.error('Failed to pull model:', error);
    return false;
  }
}

export async function deleteOllamaModel(modelName: string): Promise<boolean> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/delete`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: modelName }),
    });

    return response.ok;
  } catch (error) {
    console.error('Failed to delete model:', error);
    return false;
  }
}

export function formatModelSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
