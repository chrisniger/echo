export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface LoginRequest {
  email: string;
  password: string;
  deviceId?: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  passwordConfirmation: string;
}

export interface AuthResponse {
  user: UserProfile;
  tokens: AuthTokens;
  requiresMfa?: boolean;
  mfaToken?: string;
}

export interface MfaVerifyRequest {
  mfaToken: string;
  code: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  emailVerifiedAt: string | null;
  avatarUrl: string | null;
  role: 'user' | 'admin';
  createdAt: string;
  updatedAt: string;
}

export interface DeviceInfo {
  id: string;
  name: string;
  platform: string;
  lastIp: string;
  lastUsedAt: string;
  isCurrentDevice: boolean;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetConfirm {
  token: string;
  email: string;
  password: string;
  passwordConfirmation: string;
}
