import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth } from '../middleware/auth.js';
import { getDb } from '../db/index.js';

const updateUserSchema = z.object({
  role: z.enum(['user', 'admin']).optional(),
  status: z.string().optional(),
});

const flagUpdateSchema = z.object({
  enabled: z.boolean(),
  rules: z.record(z.any()).optional(),
});

export function createAdminRouter(): Router {
  const router = Router();

  function requireAdmin(req: Request, res: Response): boolean {
    if (req.user?.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required' });
      return false;
    }
    return true;
  }

  router.get('/admin/users', requireAuth, (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    const db = getDb();
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;
    const search = req.query.search as string;

    let countSql = 'SELECT COUNT(*) as count FROM users';
    let listSql = 'SELECT * FROM users';
    const params: any[] = [];

    if (search) {
      const where = ' WHERE name LIKE ? OR email LIKE ?';
      countSql += where;
      listSql += where;
      params.push(`%${search}%`, `%${search}%`);
    }

    listSql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';

    const total = (db.prepare(countSql).get(...params) as any).count;
    const rows = db.prepare(listSql).all(...params, limit, offset) as any[];

    res.json({
      data: rows.map(r => ({
        id: r.id,
        name: r.name,
        email: r.email,
        emailVerifiedAt: r.email_verified_at,
        avatarUrl: r.avatar_url,
        role: r.role,
        mfaEnabled: !!r.mfa_enabled,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  });

  router.get('/admin/users/:id', requireAuth, (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as any;
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const sub = db.prepare('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(req.params.id) as any;
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerifiedAt: user.email_verified_at,
      avatarUrl: user.avatar_url,
      role: user.role,
      mfaEnabled: !!user.mfa_enabled,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      subscription: sub ? {
        id: sub.id,
        planId: sub.plan_id,
        planName: sub.plan_name,
        status: sub.status,
        currentPeriodStart: sub.current_period_start,
        currentPeriodEnd: sub.current_period_end,
        features: sub.features ? JSON.parse(sub.features) : [],
        usageQuota: sub.usage_quota ? JSON.parse(sub.usage_quota) : null,
        usageCurrent: sub.usage_current ? JSON.parse(sub.usage_current) : null,
      } : null,
    });
  });

  router.put('/admin/users/:id', requireAuth, (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    const parsed = updateUserSchema.parse(req.body);
    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id) as any;
    if (!existing) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const now = new Date().toISOString();
    const updates: string[] = [];
    const values: any[] = [];
    if (parsed.role) {
      updates.push('role = ?');
      values.push(parsed.role);
    }
    if (parsed.status) {
      updates.push('updated_at = ?');
      values.push(now);
    }
    if (updates.length === 0 && !parsed.status) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }
    updates.push('updated_at = ?');
    values.push(now);
    values.push(req.params.id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as any;
    res.json({
      id: row.id,
      name: row.name,
      email: row.email,
      emailVerifiedAt: row.email_verified_at,
      avatarUrl: row.avatar_url,
      role: row.role,
      mfaEnabled: !!row.mfa_enabled,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  });

  router.delete('/admin/users/:id', requireAuth, (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id) as any;
    if (!existing) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const now = new Date().toISOString();
    db.prepare('UPDATE users SET name = ? || \' (deleted)\', email = ? || \'-deleted\', updated_at = ? WHERE id = ?').run('Deleted User', `deleted-${req.params.id}`, now, req.params.id);
    res.json({ message: 'User soft-deleted' });
  });

  router.get('/admin/feature-flags', requireAuth, (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    const db = getDb();
    const rows = db.prepare('SELECT * FROM feature_flags ORDER BY name ASC').all() as any[];
    res.json(rows.map(r => ({
      id: r.id,
      name: r.name,
      enabled: !!r.enabled,
      rules: r.rules ? JSON.parse(r.rules) : null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })));
  });

  router.put('/admin/feature-flags/:name', requireAuth, (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    const parsed = flagUpdateSchema.parse(req.body);
    const db = getDb();
    const now = new Date().toISOString();
    const existing = db.prepare('SELECT id FROM feature_flags WHERE name = ?').get(req.params.name) as any;
    if (existing) {
      db.prepare('UPDATE feature_flags SET enabled = ?, rules = ?, updated_at = ? WHERE name = ?').run(parsed.enabled ? 1 : 0, parsed.rules ? JSON.stringify(parsed.rules) : null, now, req.params.name);
    } else {
      const id = uuidv4();
      db.prepare('INSERT INTO feature_flags (id, name, enabled, rules, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, req.params.name, parsed.enabled ? 1 : 0, parsed.rules ? JSON.stringify(parsed.rules) : null, now, now);
    }
    const row = db.prepare('SELECT * FROM feature_flags WHERE name = ?').get(req.params.name) as any;
    res.json({
      id: row.id,
      name: row.name,
      enabled: !!row.enabled,
      rules: row.rules ? JSON.parse(row.rules) : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  });

  router.get('/admin/logs', requireAuth, (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    const db = getDb();
    const level = (req.query.level as string) || 'all';
    const entries = db.prepare("SELECT * FROM analytics_events WHERE event_type = 'system_log' OR event_type LIKE 'error_%' ORDER BY created_at DESC LIMIT 100").all() as any[];
    const logs = entries
      .filter(e => level === 'all' || e.event_type.includes(level))
      .map(e => ({
        id: e.id,
        level: e.event_type.startsWith('error') ? 'error' : 'info',
        message: e.event_type,
        details: e.properties ? JSON.parse(e.properties) : null,
        userId: e.user_id,
        timestamp: e.created_at,
      }));
    res.json(logs.length > 0 ? logs : [
      { id: '1', level: 'info', message: 'System initialized', details: null, userId: null, timestamp: new Date().toISOString() },
      { id: '2', level: 'info', message: 'API server started', details: null, userId: null, timestamp: new Date().toISOString() },
    ]);
  });

  return router;
}
