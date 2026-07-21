import { config } from '../config.js';

/**
 * Centralized internal API client for the AI Gateway.
 *
 * Use this helper when one AI Gateway route needs to call another AI Gateway
 * endpoint internally. It automatically attaches the shared API key so the
 * request passes the `requireAuth` middleware.
 *
 * Note: Where possible, prefer calling the underlying service/router directly
 * (e.g. `AiRouter.chat()`) to avoid an extra HTTP hop. This client is useful
 * when direct invocation is impractical or when sharing logic with external
 * callers.
 */
export class InternalApiClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    // Allow override via env var for Docker/non-localhost deployments.
    const defaultUrl = process.env.AI_GATEWAY_INTERNAL_URL || `http://127.0.0.1:${config.port}`;
    this.baseUrl = (baseUrl ?? defaultUrl).replace(/\/$/, '');
  }

  private headers(): Record<string, string> {
    if (!config.apiKey) {
      throw new Error(
        '[InternalApiClient] AI_GATEWAY_API_KEY is not configured. Internal API calls cannot be authenticated.',
      );
    }

    return {
      'Content-Type': 'application/json',
      'X-API-Key': config.apiKey,
    };
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(url, {
        ...init,
        // Always preserve the internal API key; allow extra headers but never
        // let a caller accidentally remove authentication.
        headers: { ...init.headers, ...this.headers() },
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `Internal API ${init.method || 'GET'} ${path} failed: ${response.status} ${response.statusText} — ${body}`,
        );
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'GET' });
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'POST', body: JSON.stringify(body) });
  }
}

export const internalApi = new InternalApiClient();
