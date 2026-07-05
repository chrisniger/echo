import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { config } from '../config.js';
import { getDb } from '../db/index.js';
import type {
  AuthTokens,
  AuthResponse,
  UserProfile,
  RegisterRequest,
} from '@echo-gpt/shared-types';

interface UserRow {
  id: string;
  name: string;
  email: string;
  password: string;
  email_verified_at: string | null;
  avatar_url: string | null;
  role: string;
  mfa_secret: string | null;
  mfa_enabled: number;
  created_at: string;
  updated_at: string;
}

function toProfile(row: UserRow): UserProfile {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerifiedAt: row.email_verified_at,
    avatarUrl: row.avatar_url,
    role: row.role as 'user' | 'admin',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) return 15 * 60 * 1000;
  const value = parseInt(match[1], 10);
  switch (match[2]) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      return 15 * 60 * 1000;
  }
}

function generateAccessToken(userId: string, email: string, role: string): string {
  return jwt.sign({ userId, email, role }, config.JWT_SECRET, {
    expiresIn: Math.floor(parseDuration(config.JWT_EXPIRES_IN) / 1000),
  });
}

function generateRefreshJwt(userId: string, tokenId: string): string {
  return jwt.sign({ userId, tokenId }, config.JWT_SECRET, {
    expiresIn: Math.floor(parseDuration(config.JWT_REFRESH_EXPIRES_IN) / 1000),
  });
}

function generateTokens(userId: string, deviceId?: string): AuthTokens {
  const db = getDb();
  const user = db.prepare('SELECT id, email, role FROM users WHERE id = ?').get(userId) as
    { id: string; email: string; role: string } | undefined;
  if (!user) throw new Error('User not found');

  const accessToken = generateAccessToken(user.id, user.email, user.role);

  const tokenId = uuidv4();
  const refreshToken = generateRefreshJwt(user.id, tokenId);

  const refreshExpiresMs = parseDuration(config.JWT_REFRESH_EXPIRES_IN);
  const expiresAt = new Date(Date.now() + refreshExpiresMs).toISOString();
  const now = new Date().toISOString();

  db.prepare(
    'INSERT INTO refresh_tokens (id, user_id, token, device_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(tokenId, userId, refreshToken, deviceId || null, expiresAt, now);

  const accessExpiresMs = parseDuration(config.JWT_EXPIRES_IN);

  return {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + accessExpiresMs,
  };
}

export const auth = {
  async register(data: RegisterRequest): Promise<AuthResponse> {
    const db = getDb();
    const id = uuidv4();
    const now = new Date().toISOString();
    const hashedPassword = await bcrypt.hash(data.password, 12);

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(data.email);
    if (existing) {
      throw new Error('Email already registered');
    }

    db.prepare(
      'INSERT INTO users (id, name, email, password, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(id, data.name, data.email, hashedPassword, 'user', now, now);

    const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow;
    const tokens = generateTokens(id);

    return { user: toProfile(userRow), tokens };
  },

  async login(email: string, password: string, deviceId?: string): Promise<AuthResponse> {
    const db = getDb();
    const userRow = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as
      UserRow | undefined;
    if (!userRow) throw new Error('Invalid email or password');

    const valid = await bcrypt.compare(password, userRow.password);
    if (!valid) throw new Error('Invalid email or password');

    if (userRow.mfa_enabled && userRow.mfa_secret) {
      const mfaToken = jwt.sign({ userId: userRow.id }, config.JWT_SECRET, { expiresIn: '5m' });
      return {
        user: toProfile(userRow),
        tokens: { accessToken: '', refreshToken: '', expiresAt: 0 },
        requiresMfa: true,
        mfaToken,
      };
    }

    const tokens = generateTokens(userRow.id, deviceId);
    return { user: toProfile(userRow), tokens };
  },

  async refreshToken(token: string): Promise<AuthTokens> {
    const db = getDb();
    let payload: { userId: string; tokenId: string };
    try {
      payload = jwt.verify(token, config.JWT_SECRET) as { userId: string; tokenId: string };
    } catch {
      throw new Error('Invalid refresh token');
    }

    const stored = db
      .prepare('SELECT * FROM refresh_tokens WHERE id = ? AND user_id = ?')
      .get(payload.tokenId, payload.userId) as
      { id: string; user_id: string; expires_at: string } | undefined;

    if (!stored) throw new Error('Refresh token not found');

    if (new Date(stored.expires_at) < new Date()) {
      db.prepare('DELETE FROM refresh_tokens WHERE id = ?').run(stored.id);
      throw new Error('Refresh token expired');
    }

    db.prepare('DELETE FROM refresh_tokens WHERE id = ?').run(stored.id);

    return generateTokens(payload.userId);
  },

  async logout(userId: string, refreshToken: string): Promise<void> {
    const db = getDb();
    let payload: { tokenId?: string };
    try {
      payload = jwt.verify(refreshToken, config.JWT_SECRET) as { tokenId?: string };
    } catch {
      return;
    }
    if (payload.tokenId) {
      db.prepare('DELETE FROM refresh_tokens WHERE id = ? AND user_id = ?').run(
        payload.tokenId,
        userId,
      );
    }
  },

  generateTokens,

  async verifyEmail(_token: string): Promise<void> {
    // stub — will implement with email service in Phase 2
    throw new Error('Not implemented');
  },

  async sendPasswordReset(email: string): Promise<string> {
    const db = getDb();
    const userRow = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as
      { id: string } | undefined;
    if (!userRow) return '';

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    db.prepare(
      'INSERT INTO password_resets (email, token, expires_at, created_at) VALUES (?, ?, ?, ?)',
    ).run(email, token, expiresAt, now);

    return token;
  },

  async confirmPasswordReset(token: string, email: string, password: string): Promise<void> {
    const db = getDb();
    const row = db
      .prepare('SELECT * FROM password_resets WHERE email = ? AND token = ?')
      .get(email, token) as { expires_at: string } | undefined;

    if (!row) throw new Error('Invalid reset token');
    if (new Date(row.expires_at) < new Date()) throw new Error('Reset token expired');

    const hashedPassword = await bcrypt.hash(password, 12);
    const now = new Date().toISOString();

    db.prepare('UPDATE users SET password = ?, updated_at = ? WHERE email = ?').run(
      hashedPassword,
      now,
      email,
    );
    db.prepare('DELETE FROM password_resets WHERE email = ?').run(email);
  },

  setupMfa(userId: string): { secret: string; qrCodeUrl: string } {
    const db = getDb();
    const secret = crypto.randomBytes(20).toString('hex');
    const qrCodeUrl = `otpauth://totp/EchoGPT:${userId}?secret=${secret}&issuer=EchoGPT`;

    db.prepare('UPDATE users SET mfa_secret = ? WHERE id = ?').run(secret, userId);

    return { secret, qrCodeUrl };
  },

  verifyMfa(userId: string, code: string): boolean {
    const db = getDb();
    const row = db.prepare('SELECT mfa_secret, mfa_enabled FROM users WHERE id = ?').get(userId) as
      { mfa_secret: string | null; mfa_enabled: number } | undefined;
    if (!row || !row.mfa_secret) return false;

    const valid = verifyTotp(row.mfa_secret, code);
    if (valid && !row.mfa_enabled) {
      db.prepare('UPDATE users SET mfa_enabled = 1 WHERE id = ?').run(userId);
    }

    return valid;
  },

  async verifyMfaChallenge(mfaToken: string, code: string): Promise<AuthResponse> {
    let payload: { userId: string };
    try {
      payload = jwt.verify(mfaToken, config.JWT_SECRET) as { userId: string };
    } catch {
      throw new Error('Invalid MFA token');
    }

    const db = getDb();
    const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.userId) as
      UserRow | undefined;
    if (!userRow) throw new Error('User not found');
    if (!userRow.mfa_secret) throw new Error('MFA not configured');

    const valid = verifyTotp(userRow.mfa_secret, code);
    if (!valid) throw new Error('Invalid MFA code');

    const tokens = generateTokens(userRow.id);
    return { user: toProfile(userRow), tokens };
  },
};

function verifyTotp(secret: string, token: string): boolean {
  const time = Math.floor(Date.now() / 30000);
  for (let i = -1; i <= 1; i++) {
    const counter = time + i;
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(BigInt(counter));
    const hmac = crypto
      .createHmac('sha1', Buffer.from(secret, 'hex'))
      .update(counterBuffer)
      .digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code =
      ((hmac[offset] & 0x7f) << 24) |
      (hmac[offset + 1] << 16) |
      (hmac[offset + 2] << 8) |
      hmac[offset + 3];
    const otp = String(code % 1000000).padStart(6, '0');
    if (otp === token) return true;
  }
  return false;
}
