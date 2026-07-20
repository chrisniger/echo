import { getAccessToken, getRefreshToken, storeTokens, isTokenExpired } from './auth';

const CLOUD_BASE_URL = import.meta.env.VITE_CLOUD_API_URL || 'http://localhost:4000/api';
const GATEWAY_BASE_URL = import.meta.env.VITE_GATEWAY_API_URL || 'http://localhost:4001/api';

// Callbacks for global state changes triggered by auth
type AuthEventHandler = () => void;
const authEventHandlers: Set<AuthEventHandler> = new Set();

export function onAuthRefresh(handler: AuthEventHandler): () => void {
  authEventHandlers.add(handler);
  return () => authEventHandlers.delete(handler);
}

function notifyAuthRefreshed() {
  for (const h of authEventHandlers) {
    try {
      h();
    } catch {
      /* ignore */
    }
  }
}

export interface RefreshAuthResult {
  success: boolean;
  isDead: boolean;
}

let activeRefreshPromise: Promise<RefreshAuthResult> | null = null;

/**
 * Refresh the access token using the stored refresh token.
 *
 * Single-flight: concurrent callers share the same in-flight promise so the
 * refresh token is only consumed once. This prevents race conditions where
 * multiple API calls hit 401 simultaneously and each tries to rotate the same
 * single-use refresh token, leaving the others with a rejected session.
 */
export async function refreshAuthToken(): Promise<RefreshAuthResult> {
  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  activeRefreshPromise = (async (): Promise<RefreshAuthResult> => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      return { success: false, isDead: true };
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch(`${CLOUD_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
        signal: controller.signal,
      });

      if (res.ok) {
        const data = await res.json();
        storeTokens(data.tokens);
        notifyAuthRefreshed();
        return { success: true, isDead: false };
      }

      if (res.status === 401) {
        // Refresh token itself is invalid/expired.
        return { success: false, isDead: true };
      }

      // Transient server error — don't treat the session as dead.
      return { success: false, isDead: false };
    } catch {
      // Network blip — caller can retry later.
      return { success: false, isDead: false };
    } finally {
      window.clearTimeout(timeoutId);
    }
  })();

  try {
    return await activeRefreshPromise;
  } finally {
    activeRefreshPromise = null;
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  params?: Record<string, string>;
  /**
   * Request timeout in milliseconds. Defaults to 15000 (15s).
   * Set to 0 to disable the timeout.
   */
  timeoutMs?: number;
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

  private async request<T>(
    path: string,
    options: RequestOptions = {},
    isRetry = false,
  ): Promise<T> {
    const { body, params, timeoutMs = 15000, ...init } = options;

    // Proactively refresh if we know the access token is expired (saves a 401 round-trip)
    if (!isRetry && isTokenExpired() && getRefreshToken()) {
      await refreshAuthToken();
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

    const controller = new AbortController();
    let timeoutId: number | null = null;
    if (timeoutMs > 0) {
      timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    }

    try {
      const response = await fetch(this.buildUrl(path, params), {
        ...init,
        headers,
        signal: controller.signal,
        body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
      });

      if (response.status === 401 && !isRetry) {
        const refreshed = await refreshAuthToken();
        if (refreshed.success) {
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
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ApiError(408, 'Request timed out. Please check your network and try again.', {});
      }
      // fetch() throws a TypeError when the request cannot complete because the
      // server is unreachable (e.g. Cloud API is not running). Replace the
      // browser's generic "Failed to fetch" message with something actionable.
      if (err instanceof TypeError) {
        throw new ApiError(
          0,
          `Cannot connect to the Cloud API at ${this.baseURL}. Please make sure the server is running.`,
          {},
        );
      }
      throw err;
    } finally {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    }
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
