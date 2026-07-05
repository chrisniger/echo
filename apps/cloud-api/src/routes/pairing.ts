import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuid, validate as isUuid } from 'uuid';
import { requireAuth } from '../middleware/auth.js';
import { getDb } from '../db/index.js';
import { DEVICE } from '@echo-gpt/shared-config';

const router = Router();

const pairingCodeSchema = z.object({
  deviceName: z.string().min(1).max(100),
  platform: z.string().max(50).optional(),
});

const approveSchema = z.object({
  token: z.string().min(1),
});

const verifySchema = z.object({
  code: z.string().length(DEVICE.PAIRING_CODE_LENGTH),
});

const registerDeviceSchema = z.object({
  name: z.string().min(1).max(100),
  platform: z.string().max(50).optional(),
});

router.post('/pairing/request', requireAuth, (req: Request, res: Response) => {
  const parsed = pairingCodeSchema.parse(req.body);
  const db = getDb();
  const now = new Date().toISOString();

  // Generate unique pairing code
  const code = generatePairingCode();
  const token = uuid();
  const expiresAt = new Date(Date.now() + DEVICE.PAIRING_CODE_EXPIRY_SECONDS * 1000).toISOString();

  db.prepare(
    `
    INSERT INTO pairing_codes (id, user_id, code, token, device_name, platform, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    uuid(),
    req.user!.id,
    code,
    token,
    parsed.deviceName,
    parsed.platform || 'unknown',
    expiresAt,
    now,
  );

  res.status(201).json({
    code,
    token,
    expiresAt,
    deviceName: parsed.deviceName,
  });
});

router.post('/pairing/approve', requireAuth, (req: Request, res: Response) => {
  const parsed = approveSchema.parse(req.body);
  const db = getDb();
  const now = new Date().toISOString();

  const pairing = db
    .prepare(
      `
    SELECT * FROM pairing_codes WHERE token = ? AND user_id = ? AND status = 'pending'
  `,
    )
    .get(parsed.token, req.user!.id) as any;

  if (!pairing) {
    res.status(404).json({ error: 'Pairing request not found' });
    return;
  }

  if (new Date(pairing.expires_at) < new Date()) {
    db.prepare('UPDATE pairing_codes SET status = ? WHERE id = ?').run('expired', pairing.id);
    res.status(400).json({ error: 'Pairing code has expired' });
    return;
  }

  const deviceId = uuid();
  db.prepare(
    `
    INSERT INTO devices (id, user_id, name, platform, last_ip, last_used_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  ).run(deviceId, req.user!.id, pairing.device_name, pairing.platform, req.ip || 'unknown', now);

  db.prepare('UPDATE pairing_codes SET status = ?, device_id = ? WHERE id = ?').run(
    'approved',
    deviceId,
    pairing.id,
  );

  res.json({
    deviceId,
    deviceName: pairing.device_name,
    message: 'Device approved',
    platform: pairing.platform,
  });
});

router.post('/pairing/reject', requireAuth, (req: Request, res: Response) => {
  const parsed = approveSchema.parse(req.body);
  const db = getDb();

  db.prepare(
    `
    UPDATE pairing_codes SET status = 'rejected' WHERE token = ? AND user_id = ?
  `,
  ).run(parsed.token, req.user!.id);

  res.json({ message: 'Pairing request rejected' });
});

router.post('/pairing/verify', (req: Request, res: Response) => {
  const parsed = verifySchema.parse(req.body);
  const db = getDb();
  const now = new Date().toISOString();

  const pairing = db
    .prepare(
      `
    SELECT * FROM pairing_codes WHERE code = ? AND status = 'pending'
  `,
    )
    .get(parsed.code) as any;

  if (!pairing) {
    res.status(404).json({ error: 'Invalid pairing code' });
    return;
  }

  if (new Date(pairing.expires_at) < new Date()) {
    db.prepare('UPDATE pairing_codes SET status = ? WHERE id = ?').run('expired', pairing.id);
    res.status(400).json({ error: 'Pairing code has expired' });
    return;
  }

  const user = db
    .prepare('SELECT id, name, email FROM users WHERE id = ?')
    .get(pairing.user_id) as any;

  res.json({
    userId: pairing.user_id,
    userName: user?.name || 'Unknown',
    deviceName: pairing.device_name,
    token: pairing.token,
    status: 'pending_approval',
    message: 'Waiting for desktop approval',
    approved: false,
  });
});

router.get('/devices', requireAuth, (req: Request, res: Response) => {
  const db = getDb();
  const devices = db
    .prepare('SELECT * FROM devices WHERE user_id = ? ORDER BY last_used_at DESC')
    .all(req.user!.id) as any[];
  res.json(
    devices.map((d) => ({
      id: d.id,
      name: d.name,
      platform: d.platform,
      lastIp: d.last_ip,
      lastUsedAt: d.last_used_at,
      isCurrentDevice: false,
    })),
  );
});

router.put('/devices/:id', requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isUuid(id)) {
    res.status(400).json({ error: 'Invalid device ID' });
    return;
  }
  const schema = z.object({ name: z.string().min(1).max(100) });
  const parsed = schema.parse(req.body);
  const db = getDb();
  const now = new Date().toISOString();
  const result = db
    .prepare('UPDATE devices SET name = ?, last_used_at = ? WHERE id = ? AND user_id = ?')
    .run(parsed.name, now, id, req.user!.id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }
  res.json({ message: 'Device updated', name: parsed.name });
});

router.delete('/devices/:id', requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const db = getDb();
  const result = db
    .prepare('DELETE FROM devices WHERE id = ? AND user_id = ?')
    .run(id, req.user!.id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }
  res.json({ message: 'Device removed' });
});

function generatePairingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < DEVICE.PAIRING_CODE_LENGTH; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export default router;
