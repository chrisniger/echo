import type { Request, Response } from 'express';
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getDb } from '../db/index.js';

const router = Router();

function requireAdmin(req: Request, res: Response, next: () => void): void {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

router.get('/', requireAuth, requireAdmin, (_req: Request, res: Response) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all() as any[];
  res.json(rows.map(r => ({
    id: r.id,
    name: r.name,
    email: r.email,
    emailVerifiedAt: r.email_verified_at,
    avatarUrl: r.avatar_url,
    role: r.role,
    mfaEnabled: !!r.mfa_enabled,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  })));
});

router.get('/:id', requireAuth, requireAdmin, (req: Request, res: Response) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as any;
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
    mfaEnabled: !!row.mfa_enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
});

router.put('/:id', requireAuth, requireAdmin, (req: Request, res: Response) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id) as any;
  if (!existing) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const { role } = req.body;
  if (role && !['user', 'admin'].includes(role)) {
    res.status(400).json({ error: 'Invalid role' });
    return;
  }

  const now = new Date().toISOString();
  if (role) {
    db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(role, now, req.params.id);
  }

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

export default router;
