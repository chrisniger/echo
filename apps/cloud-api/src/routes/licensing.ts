import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth } from '../middleware/auth.js';
import { getDb } from '../db/index.js';

const validateLicenseSchema = z.object({
  key: z.string().min(1),
});

const activateLicenseSchema = z.object({
  key: z.string().min(1),
  deviceId: z.string().min(1),
  deviceName: z.string().min(1),
});

const deactivateLicenseSchema = z.object({
  key: z.string().min(1),
  deviceId: z.string().min(1),
});

const generateLicenseSchema = z.object({
  planId: z.string().min(1),
  userId: z.string().min(1),
  seats: z.number().int().min(1).optional(),
  expiresInDays: z.number().int().min(1).optional(),
});

export function createLicensingRouter(): Router {
  const router = Router();

  router.post('/licenses/generate', requireAuth, (req: Request, res: Response) => {
    if (req.user?.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    const parsed = generateLicenseSchema.parse(req.body);
    const db = getDb();
    const plan = db.prepare('SELECT id FROM subscription_plans WHERE id = ?').get(parsed.planId) as any;
    if (!plan) {
      res.status(404).json({ error: 'Plan not found' });
      return;
    }
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(parsed.userId) as any;
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const id = uuidv4();
    const key = `LIC-${uuidv4().toUpperCase()}`;
    const now = new Date().toISOString();
    const expiresAt = parsed.expiresInDays ? new Date(Date.now() + parsed.expiresInDays * 24 * 60 * 60 * 1000).toISOString() : null;
    db.prepare(
      'INSERT INTO licenses (id, user_id, key, plan_id, status, seats, seats_used, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, parsed.userId, key, parsed.planId, 'active', parsed.seats || 1, 0, expiresAt, now, now);
    const row = db.prepare('SELECT * FROM licenses WHERE id = ?').get(id) as any;
    res.status(201).json({
      id: row.id,
      userId: row.user_id,
      key: row.key,
      planId: row.plan_id,
      status: row.status,
      seats: row.seats,
      seatsUsed: row.seats_used,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  });

  router.post('/licenses/validate', (req: Request, res: Response) => {
    const parsed = validateLicenseSchema.parse(req.body);
    const db = getDb();
    const license = db.prepare('SELECT * FROM licenses WHERE key = ?').get(parsed.key) as any;
    if (!license) {
      res.status(404).json({ error: 'License not found' });
      return;
    }
    const expired = license.expires_at && new Date(license.expires_at) < new Date();
    if (license.status !== 'active' || expired) {
      res.json({ valid: false, status: expired ? 'expired' : license.status });
      return;
    }
    res.json({
      valid: true,
      status: license.status,
      seats: license.seats,
      seatsUsed: license.seats_used,
      seatsAvailable: license.seats - license.seats_used,
      expiresAt: license.expires_at,
    });
  });

  router.post('/licenses/activate', (req: Request, res: Response) => {
    const parsed = activateLicenseSchema.parse(req.body);
    const db = getDb();
    const license = db.prepare('SELECT * FROM licenses WHERE key = ?').get(parsed.key) as any;
    if (!license) {
      res.status(404).json({ error: 'License not found' });
      return;
    }
    if (license.status !== 'active') {
      res.status(400).json({ error: 'License is not active' });
      return;
    }
    if (license.expires_at && new Date(license.expires_at) < new Date()) {
      res.status(400).json({ error: 'License has expired' });
      return;
    }
    if (license.seats_used >= license.seats) {
      res.status(400).json({ error: 'No seats available' });
      return;
    }
    const existingActivation = db.prepare('SELECT id FROM license_activations WHERE license_id = ? AND device_id = ?').get(license.id, parsed.deviceId) as any;
    if (existingActivation) {
      res.json({ message: 'Already activated on this device' });
      return;
    }
    const id = uuidv4();
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO license_activations (id, license_id, device_id, device_name, activated_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, license.id, parsed.deviceId, parsed.deviceName, now);
    db.prepare('UPDATE licenses SET seats_used = seats_used + 1, updated_at = ? WHERE id = ?').run(now, license.id);
    const updated = db.prepare('SELECT * FROM licenses WHERE id = ?').get(license.id) as any;
    res.json({
      activationId: id,
      seatsUsed: updated.seats_used,
      seatsAvailable: updated.seats - updated.seats_used,
    });
  });

  router.post('/licenses/deactivate', (req: Request, res: Response) => {
    const parsed = deactivateLicenseSchema.parse(req.body);
    const db = getDb();
    const license = db.prepare('SELECT * FROM licenses WHERE key = ?').get(parsed.key) as any;
    if (!license) {
      res.status(404).json({ error: 'License not found' });
      return;
    }
    const activation = db.prepare('SELECT id FROM license_activations WHERE license_id = ? AND device_id = ?').get(license.id, parsed.deviceId) as any;
    if (!activation) {
      res.status(404).json({ error: 'Activation not found for this device' });
      return;
    }
    const now = new Date().toISOString();
    db.prepare('UPDATE license_activations SET deactivated_at = ? WHERE id = ?').run(now, activation.id);
    db.prepare('UPDATE licenses SET seats_used = MAX(0, seats_used - 1), updated_at = ? WHERE id = ?').run(now, license.id);
    const updated = db.prepare('SELECT * FROM licenses WHERE id = ?').get(license.id) as any;
    res.json({
      seatsUsed: updated.seats_used,
      seatsAvailable: updated.seats - updated.seats_used,
    });
  });

  router.get('/licenses/my', requireAuth, (req: Request, res: Response) => {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM licenses WHERE user_id = ? ORDER BY created_at DESC').all(req.user!.id) as any[];
    res.json(rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      key: r.key,
      planId: r.plan_id,
      status: r.status,
      seats: r.seats,
      seatsUsed: r.seats_used,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })));
  });

  router.get('/admin/licenses', requireAuth, (req: Request, res: Response) => {
    if (req.user?.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    const db = getDb();
    const rows = db.prepare('SELECT * FROM licenses ORDER BY created_at DESC').all() as any[];
    res.json(rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      key: r.key,
      planId: r.plan_id,
      status: r.status,
      seats: r.seats,
      seatsUsed: r.seats_used,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })));
  });

  return router;
}
