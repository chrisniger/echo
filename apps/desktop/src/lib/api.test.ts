import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { refreshAuthToken } from './api';

function mockFetch(response: Partial<Response>) {
  globalThis.fetch = vi.fn().mockResolvedValue(response);
}

function setRefreshToken(value: string | null) {
  if (value === null) {
    localStorage.removeItem('echo_refresh_token');
  } else {
    localStorage.setItem('echo_refresh_token', value);
  }
}

function storedAccessToken() {
  return localStorage.getItem('echo_access_token');
}

function storedRefreshToken() {
  return localStorage.getItem('echo_refresh_token');
}

function storedExpiresAt() {
  return localStorage.getItem('echo_expires_at');
}

describe('refreshAuthToken', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns success=false, isDead=true when no refresh token is stored', async () => {
    const result = await refreshAuthToken();
    expect(result).toEqual({ success: false, isDead: true });
  });

  it('stores new tokens when the server returns a wrapped response', async () => {
    setRefreshToken('old-refresh');
    mockFetch({
      ok: true,
      status: 200,
      json: async () => ({
        tokens: {
          accessToken: 'new-access',
          refreshToken: 'new-refresh',
          expiresAt: 1234567890,
        },
      }),
    } as Partial<Response>);

    const result = await refreshAuthToken();

    expect(result).toEqual({ success: true, isDead: false });
    expect(storedAccessToken()).toBe('new-access');
    expect(storedRefreshToken()).toBe('new-refresh');
    expect(storedExpiresAt()).toBe('1234567890');
  });

  it('stores new tokens when the server returns an unwrapped (legacy) response', async () => {
    setRefreshToken('old-refresh');
    mockFetch({
      ok: true,
      status: 200,
      json: async () => ({
        accessToken: 'legacy-access',
        refreshToken: 'legacy-refresh',
        expiresAt: 9876543210,
      }),
    } as Partial<Response>);

    const result = await refreshAuthToken();

    expect(result).toEqual({ success: true, isDead: false });
    expect(storedAccessToken()).toBe('legacy-access');
    expect(storedRefreshToken()).toBe('legacy-refresh');
    expect(storedExpiresAt()).toBe('9876543210');
  });

  it('treats a 401 from the refresh endpoint as a dead session', async () => {
    setRefreshToken('old-refresh');
    mockFetch({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid refresh token' }),
    } as Partial<Response>);

    const result = await refreshAuthToken();

    expect(result).toEqual({ success: false, isDead: true });
  });

  it('treats a non-401 server error as transient (session not dead)', async () => {
    setRefreshToken('old-refresh');
    mockFetch({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal server error' }),
    } as Partial<Response>);

    const result = await refreshAuthToken();

    expect(result).toEqual({ success: false, isDead: false });
  });

  it('treats a network failure as transient (session not dead)', async () => {
    setRefreshToken('old-refresh');
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

    const result = await refreshAuthToken();

    expect(result).toEqual({ success: false, isDead: false });
  });

  it('throws when the refresh response is missing required token fields', async () => {
    setRefreshToken('old-refresh');
    mockFetch({
      ok: true,
      status: 200,
      json: async () => ({ tokens: { accessToken: 'only-access' } }),
    } as Partial<Response>);

    await expect(refreshAuthToken()).rejects.toThrow('Token refresh returned an invalid payload');
  });

  it('deduplicates concurrent refresh attempts (single-flight)', async () => {
    vi.useFakeTimers();
    setRefreshToken('old-refresh');
    let resolveFetch: (value: Response) => void;
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    globalThis.fetch = fetchMock;

    const p1 = refreshAuthToken();
    const p2 = refreshAuthToken();

    // Run microtasks so the first refresh starts and registers the active promise.
    await Promise.resolve();

    resolveFetch!({
      ok: true,
      status: 200,
      json: async () => ({ tokens: { accessToken: 'a', refreshToken: 'b', expiresAt: 1 } }),
    } as Response);

    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1).toEqual({ success: true, isDead: false });
    expect(r2).toEqual({ success: true, isDead: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('aborts a refresh that takes longer than 10 seconds', async () => {
    vi.useFakeTimers();
    setRefreshToken('old-refresh');
    const fetchMock = vi.fn().mockImplementation((_input, init) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        signal?.addEventListener('abort', () => {
          reject(new Error('AbortError'));
        });
      });
    });
    globalThis.fetch = fetchMock;

    const promise = refreshAuthToken();
    vi.advanceTimersByTime(10_001);
    const result = await promise;

    expect(result).toEqual({ success: false, isDead: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
