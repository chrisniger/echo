export const CLOUD_API = {
  DEFAULT_PORT: 4000,
  DEFAULT_URL: 'http://localhost:4000',
} as const;

export const AI_GATEWAY = {
  DEFAULT_PORT: 4001,
  DEFAULT_URL: 'http://localhost:4001',
} as const;

export const DESKTOP = {
  DEV_PORT: 5173,
  DEV_URL: 'http://localhost:5173',
} as const;

export const API_PATHS = {
  AUTH: {
    LOGIN: '/api/auth/login',
    REGISTER: '/api/auth/register',
    LOGOUT: '/api/auth/logout',
    VERIFY_EMAIL: '/api/auth/verify-email',
    PASSWORD_RESET_REQUEST: '/api/auth/password-reset',
    PASSWORD_RESET_CONFIRM: '/api/auth/password-reset/confirm',
    MFA_SETUP: '/api/auth/mfa/setup',
    MFA_VERIFY: '/api/auth/mfa/verify',
    DEVICES: '/api/auth/devices',
  },
  USERS: {
    ME: '/api/me',
    ADMIN_USERS: '/api/admin/users',
  },
  GATEWAY: {
    CHAT: '/api/chat',
    CHAT_STREAM: '/api/chat/stream',
    HEALTH: '/api/health',
  },
  SUBSCRIPTIONS: {
    BASE: '/api/subscriptions',
    PLANS: '/api/plans',
  },
  LICENSING: {
    BASE: '/api/licenses',
    VALIDATE: '/api/licenses/validate',
  },
  NOTIFICATIONS: {
    BASE: '/api/notifications',
    PREFERENCES: '/api/notifications/preferences',
  },
  ANALYTICS: {
    EVENTS: '/api/analytics/events',
    OVERVIEW: '/api/analytics/overview',
  },
  ADMIN: {
    USERS: '/api/admin/users',
    FEATURE_FLAGS: '/api/admin/feature-flags',
    LOGS: '/api/admin/logs',
  },
  UPDATES: '/api/updates',
  PAIRING: {
    REQUEST: '/api/pairing/request',
    APPROVE: '/api/pairing/approve',
    REJECT: '/api/pairing/reject',
    VERIFY: '/api/pairing/verify',
    DEVICES: '/api/devices',
  },
} as const;
