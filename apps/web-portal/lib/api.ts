import { CLOUD_API } from '@echo-gpt/shared-config';

const BASE_URL = process.env.NEXT_PUBLIC_CLOUD_API_URL || CLOUD_API.DEFAULT_URL;

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  params?: Record<string, string>;
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('echo_access_token');
}

function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('echo_refresh_token');
}

function storeTokens(tokens: {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}): void {
  localStorage.setItem('echo_access_token', tokens.accessToken);
  localStorage.setItem('echo_refresh_token', tokens.refreshToken);
  localStorage.setItem('echo_expires_at', String(tokens.expiresAt));
}

function clearTokens(): void {
  localStorage.removeItem('echo_access_token');
  localStorage.removeItem('echo_refresh_token');
  localStorage.removeItem('echo_expires_at');
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

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, params, ...init } = options;
  const token = getToken();

  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  let url = `${BASE_URL}${path}`;
  if (params) {
    const searchParams = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) searchParams.set(k, v);
    url += `?${searchParams.toString()}`;
  }

  const response = await fetch(url, {
    ...init,
    headers,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401) {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (refreshRes.ok) {
        const data = await refreshRes.json();
        storeTokens(data.tokens);
        headers['Authorization'] = `Bearer ${data.tokens.accessToken}`;
        const retry = await fetch(url, {
          ...init,
          headers,
          body: body ? JSON.stringify(body) : undefined,
        });
        if (!retry.ok) throw new ApiError(retry.status, await retry.text());
        return retry.json();
      }
    }
    clearTokens();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    throw new ApiError(401, 'Unauthorized');
  }

  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(response.status, text || response.statusText);
  }

  return response.json();
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};

export { getToken, storeTokens, clearTokens };
