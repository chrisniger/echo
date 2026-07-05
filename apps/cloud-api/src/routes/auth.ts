import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { auth } from '../services/auth.js';
import { requireAuth } from '../middleware/auth.js';
import { getDb } from '../db/index.js';

const router = Router();

const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  passwordConfirmation: z.string(),
}).refine(data => data.password === data.passwordConfirmation, {
  message: 'Passwords do not match',
  path: ['passwordConfirmation'],
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  deviceId: z.string().optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const logoutSchema = z.object({
  refreshToken: z.string().min(1),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  passwordConfirmation: z.string(),
}).refine(data => data.password === data.passwordConfirmation, {
  message: 'Passwords do not match',
  path: ['passwordConfirmation'],
});

const mfaVerifySchema = z.object({
  code: z.string().length(6),
  mfaToken: z.string().optional(),
});

const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().url().optional().nullable(),
});

router.post('/register', async (req: Request, res: Response) => {
  const parsed = registerSchema.parse(req.body);
  const result = await auth.register(parsed);
  res.status(201).json(result);
});

router.post('/login', async (req: Request, res: Response) => {
  const parsed = loginSchema.parse(req.body);
  const result = await auth.login(parsed.email, parsed.password, parsed.deviceId);
  res.json(result);
});

router.post('/refresh', async (req: Request, res: Response) => {
  const parsed = refreshSchema.parse(req.body);
  const tokens = await auth.refreshToken(parsed.refreshToken);
  res.json(tokens);
});

router.post('/logout', requireAuth, async (req: Request, res: Response) => {
  const parsed = logoutSchema.parse(req.body);
  await auth.logout(req.user!.id, parsed.refreshToken);
  res.json({ message: 'Logged out successfully' });
});

router.post('/verify-email', (_req: Request, res: Response) => {
  res.json({ message: 'Email verification not yet implemented' });
});

router.post('/forgot-password', async (req: Request, res: Response) => {
  const parsed = forgotPasswordSchema.parse(req.body);
  await auth.sendPasswordReset(parsed.email);
  res.json({ message: 'If the email exists, a reset link has been sent' });
});

router.post('/reset-password', async (req: Request, res: Response) => {
  const parsed = resetPasswordSchema.parse(req.body);
  await auth.confirmPasswordReset(parsed.token, parsed.email, parsed.password);
  res.json({ message: 'Password has been reset successfully' });
});

router.post('/mfa/setup', requireAuth, async (req: Request, res: Response) => {
  const result = auth.setupMfa(req.user!.id);
  res.json(result);
});

router.post('/mfa/verify', async (req: Request, res: Response) => {
  const parsed = mfaVerifySchema.parse(req.body);

  if (parsed.mfaToken) {
    const result = await auth.verifyMfaChallenge(parsed.mfaToken, parsed.code);
    res.json(result);
    return;
  }

  const user = req.user;
  if (!user) {
    res.status(401).json({ error: 'Authentication required for MFA setup verification' });
    return;
  }

  const valid = auth.verifyMfa(user.id, parsed.code);
  if (!valid) {
    res.status(400).json({ error: 'Invalid MFA code' });
    return;
  }

  res.json({ message: 'MFA enabled successfully' });
});

router.get('/me', requireAuth, (req: Request, res: Response) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as any;
  if (!row) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerifiedAt: row.email_verified_at,
    avatarUrl: row.avatar_url,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
});

router.put('/me', requireAuth, async (req: Request, res: Response) => {
  const parsed = updateProfileSchema.parse(req.body);
  const db = getDb();
  const now = new Date().toISOString();

  const updates: string[] = [];
  const values: any[] = [];

  if (parsed.name !== undefined) {
    updates.push('name = ?');
    values.push(parsed.name);
  }
  if (parsed.avatarUrl !== undefined) {
    updates.push('avatar_url = ?');
    values.push(parsed.avatarUrl);
  }

  if (updates.length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  updates.push('updated_at = ?');
  values.push(now);
  values.push(req.user!.id);

  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as any;
  res.json({
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerifiedAt: row.email_verified_at,
    avatarUrl: row.avatar_url,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
});

router.get('/devices', requireAuth, (req: Request, res: Response) => {
  const db = getDb();
  const devices = db.prepare('SELECT * FROM devices WHERE user_id = ?').all(req.user!.id) as any[];
  res.json(devices.map(d => ({
    id: d.id,
    name: d.name,
    platform: d.platform,
    lastIp: d.last_ip,
    lastUsedAt: d.last_used_at,
    isCurrentDevice: false,
  })));
});

router.delete('/devices/:id', requireAuth, (req: Request, res: Response) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM devices WHERE id = ? AND user_id = ?').run(req.params.id, req.user!.id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }
  res.json({ message: 'Device removed' });
});

export default router;
