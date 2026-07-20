import type { AuthTokens } from '@echo-gpt/shared-types';

const ACCESS_TOKEN_KEY = 'echo_access_token';
const REFRESH_TOKEN_KEY = 'echo_refresh_token';
const EXPIRES_AT_KEY = 'echo_expires_at';

export function storeTokens(tokens: AuthTokens): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  localStorage.setItem(EXPIRES_AT_KEY, String(tokens.expiresAt));
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(EXPIRES_AT_KEY);
}

export function isTokenExpired(): boolean {
  const expiresAt = localStorage.getItem(EXPIRES_AT_KEY);
  if (!expiresAt) return true;
  // Treat the token as expired a few seconds before the actual expiry so we
  // never send a request that the server is about to reject. This also gives
  // the background refresh a small safety margin against clock skew.
  return Date.now() > Number(expiresAt) - 5000;
}

export function getExpiresAt(): number {
  const expiresAt = localStorage.getItem(EXPIRES_AT_KEY);
  if (!expiresAt) return 0;
  return Number(expiresAt);
}
