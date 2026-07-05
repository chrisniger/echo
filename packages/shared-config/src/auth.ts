export const JWT = {
  DEFAULT_SECRET: 'dev-secret-change-in-production',
  DEFAULT_ACCESS_EXPIRES_IN: '15m',
  DEFAULT_REFRESH_EXPIRES_IN: '7d',
  ACCESS_EXPIRES_SECONDS: 15 * 60,
  REFRESH_EXPIRES_SECONDS: 7 * 24 * 60 * 60,
  ALGORITHM: 'HS256',
} as const;

export const MFA = {
  ISSUER: 'Echo GPT',
  CODE_LENGTH: 6,
  CODE_INTERVAL_SECONDS: 30,
} as const;

export const RATE_LIMIT = {
  AUTH: {
    WINDOW_MS: 15 * 60 * 1000,
    MAX_REQUESTS: 20,
  },
  API: {
    WINDOW_MS: 60 * 1000,
    MAX_REQUESTS: 100,
  },
} as const;

export const PASSWORD = {
  MIN_LENGTH: 8,
  REQUIRE_UPPERCASE: true,
  REQUIRE_LOWERCASE: true,
  REQUIRE_NUMBER: true,
  REQUIRE_SYMBOL: false,
} as const;

export const DEVICE = {
  PAIRING_CODE_LENGTH: 6,
  PAIRING_CODE_EXPIRY_SECONDS: 5 * 60,
  PAIRING_TOKEN_EXPIRY_SECONDS: 5 * 60,
  MAX_TRUSTED_DEVICES: 10,
} as const;
