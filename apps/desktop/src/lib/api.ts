import { getAccessToken, getRefreshToken, storeTokens, clearTokens } from './auth';

const CLOUD_BASE_URL = '/api/cloud';
const GATEWAY_BASE_URL = '/api/gateway';

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  params?: Record<string, string>;
}

class ApiClient {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  private buildUrl(path: string, params?: Record<string, string>): string {
    const url = new URL(`${this.baseURL}${path}`, window.location.origin);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }
    return url.toString();
  }

  private async refreshAuth(): Promise<boolean> {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;

    try {
      const res = await fetch(`${CLOUD_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) return false;

      const data = await res.json();
      storeTokens(data.tokens);
      return true;
    } catch {
      return false;
    }
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { body, params, ...init } = options;

    const accessToken = getAccessToken();

    const headers: Record<string, string> = {
      ...(init.headers as Record<string, string>),
    };

    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    if (body && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(this.buildUrl(path, params), {
      ...init,
      headers,
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    });

    if (response.status === 401) {
      const refreshed = await this.refreshAuth();
      if (refreshed) {
        const newToken = getAccessToken();
        headers['Authorization'] = `Bearer ${newToken}`;
        const retryResponse = await fetch(this.buildUrl(path, params), {
          ...init,
          headers,
          body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
        });
        if (!retryResponse.ok) {
          const errorBody = await retryResponse.json().catch(() => ({}));
          throw new ApiError(retryResponse.status, errorBody.message || retryResponse.statusText, errorBody);
        }
        return retryResponse.json();
      }
      clearTokens();
      window.location.href = '/login';
      throw new ApiError(401, 'Unauthorized');
    }

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new ApiError(response.status, errorBody.message || response.statusText, errorBody);
    }

    return response.json();
  }

  async get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  async post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }

  async put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'PUT', body });
  }

  async delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }
}

export class ApiError extends Error {
  status: number;
  body: Record<string, unknown>;

  constructor(status: number, message: string, body: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export const api = new ApiClient(CLOUD_BASE_URL);
export const gatewayApi = new ApiClient(GATEWAY_BASE_URL);
