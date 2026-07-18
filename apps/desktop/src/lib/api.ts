import { getAccessToken, getRefreshToken, storeTokens, clearTokens, isTokenExpired } from './auth';

const CLOUD_BASE_URL = import.meta.env.VITE_CLOUD_API_URL || '/api/cloud';
const GATEWAY_BASE_URL = import.meta.env.VITE_GATEWAY_API_URL || '/api/gateway';

// Callbacks for global state changes triggered by auth
type AuthEventHandler = () => void;
const authEventHandlers: Set<AuthEventHandler> = new Set();

export function onAuthRefresh(handler: AuthEventHandler): () => void {
  authEventHandlers.add(handler);
  return () => authEventHandlers.delete(handler);
}

function notifyAuthRefreshed() {
  for (const h of authEventHandlers) {
    try { h(); } catch { /* ignore */ }
  }
}

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
      notifyAuthRefreshed();
      return true;
    } catch {
      return false;
    }
  }

  private async request<T>(path: string, options: RequestOptions = {}, isRetry = false): Promise<T> {
    const { body, params, ...init } = options;

    // Proactively refresh if we know the access token is expired (saves a 401 round-trip)
    if (!isRetry && isTokenExpired() && getRefreshToken()) {
      const ok = await this.refreshAuth();
      if (!ok) {
        // Refresh failed — let the request try once with the stale token; if the
        // server rejects it, we'll handle 401 below.
      }
    }

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

    if (response.status === 401 && !isRetry) {
      const refreshed = await this.refreshAuth();
      if (refreshed) {
        return this.request<T>(path, options, true);
      }
      // Refresh failed: surface the error so the caller can decide. Do NOT
      // force a redirect to /login — the background timer in App.tsx handles
      // logout decisions.
      const errorBody = await response.json().catch(() => ({}));
      throw new ApiError(401, errorBody.message || 'Session expired', errorBody);
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

  /**
   * PATCH — used for partial-resource updates like PATCH /api/sessions/:id
   * where we only send the field(s) being changed. Same auth/refresh contract
   * as POST/PUT; shares the JSON-body serialization path.
   */
  async patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'PATCH', body });
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
