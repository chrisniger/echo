import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth } from '../middleware/auth.js';
import { getDb } from '../db/index.js';

const recordEventSchema = z.object({
  eventType: z.string().min(1),
  properties: z.record(z.any()).optional(),
  sessionId: z.string().optional(),
});

export function createAnalyticsRouter(): Router {
  const router = Router();

  router.post('/analytics/events', requireAuth, (req: Request, res: Response) => {
    const parsed = recordEventSchema.parse(req.body);
    const db = getDb();
    const id = uuidv4();
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO analytics_events (id, user_id, event_type, properties, session_id, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, req.user!.id, parsed.eventType, parsed.properties ? JSON.stringify(parsed.properties) : null, parsed.sessionId || null, now);
    res.status(201).json({ id });
  });

  router.get('/admin/analytics/overview', requireAuth, (req: Request, res: Response) => {
    if (req.user?.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    const db = getDb();
    const totalUsers = (db.prepare('SELECT COUNT(*) as count FROM users').get() as any).count;
    const activeSessions = (db.prepare("SELECT COUNT(*) as count FROM analytics_events WHERE event_type = 'session_start' AND created_at >= date('now', '-24 hours')").get() as any).count;
    const totalTokens = (db.prepare("SELECT COUNT(*) as count FROM analytics_events WHERE event_type = 'token_usage'").get() as any).count;
    const totalRevenue = (db.prepare("SELECT COUNT(*) as count FROM subscriptions WHERE status = 'active'").get() as any).count * 20;
    res.json({
      totalUsers,
      activeSessions24h: activeSessions,
      totalTokensUsed: totalTokens * 1000,
      estimatedMonthlyRevenue: totalRevenue,
    });
  });

  router.get('/admin/analytics/users', requireAuth, (req: Request, res: Response) => {
    if (req.user?.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    const db = getDb();
    const period = (req.query.period as string) || 'daily';
    let dateFormat: string;
    switch (period) {
      case 'weekly': dateFormat = '%Y-%W'; break;
      case 'monthly': dateFormat = '%Y-%m'; break;
      default: dateFormat = '%Y-%m-%d';
    }
    const rows = db.prepare(
      `SELECT strftime('${dateFormat}', created_at) as period, COUNT(*) as count FROM users GROUP BY period ORDER BY period ASC`
    ).all() as any[];
    res.json(rows.map(r => ({ period: r.period, count: r.count })));
  });

  router.get('/admin/analytics/sessions', requireAuth, (req: Request, res: Response) => {
    if (req.user?.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    const db = getDb();
    const period = (req.query.period as string) || 'daily';
    let dateFormat: string;
    switch (period) {
      case 'weekly': dateFormat = '%Y-%W'; break;
      case 'monthly': dateFormat = '%Y-%m'; break;
      default: dateFormat = '%Y-%m-%d';
    }
    const total = (db.prepare("SELECT COUNT(*) as count FROM analytics_events WHERE event_type = 'session_start'").get() as any).count;
    const rows = db.prepare(
      `SELECT strftime('${dateFormat}', created_at) as period, COUNT(*) as count FROM analytics_events WHERE event_type = 'session_start' GROUP BY period ORDER BY period ASC`
    ).all() as any[];
    res.json({
      totalSessions: total,
      data: rows.map(r => ({ period: r.period, count: r.count })),
    });
  });

  router.get('/admin/analytics/providers', requireAuth, (req: Request, res: Response) => {
    if (req.user?.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    const db = getDb();
    const rows = db.prepare(
      "SELECT json_extract(properties, '$.provider') as provider, COUNT(*) as count FROM analytics_events WHERE event_type = 'ai_request' AND properties IS NOT NULL GROUP BY provider ORDER BY count DESC"
    ).all() as any[];
    res.json(rows.map(r => ({ provider: r.provider || 'unknown', requests: r.count })));
  });

  return router;
}
