import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth } from '../middleware/auth.js';
import { getDb } from '../db/index.js';

const sendNotificationSchema = z.object({
  userIds: z.array(z.string().min(1)),
  type: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  data: z.record(z.any()).optional(),
});

const updatePreferencesSchema = z.object({
  emailNotifications: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
  types: z.array(z.string()).optional(),
});

export function createNotificationsRouter(): Router {
  const router = Router();

  router.get('/notifications', requireAuth, (req: Request, res: Response) => {
    const db = getDb();
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;
    const total = (db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ?').get(req.user!.id) as any).count;
    const rows = db.prepare(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(req.user!.id, limit, offset) as any[];
    res.json({
      data: rows.map(r => ({
        id: r.id,
        type: r.type,
        title: r.title,
        body: r.body,
        data: r.data ? JSON.parse(r.data) : null,
        readAt: r.read_at,
        createdAt: r.created_at,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  });

  router.put('/notifications/:id/read', requireAuth, (req: Request, res: Response) => {
    const db = getDb();
    const now = new Date().toISOString();
    const result = db.prepare('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?').run(now, req.params.id, req.user!.id);
    if (result.changes === 0) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }
    res.json({ message: 'Marked as read' });
  });

  router.put('/notifications/read-all', requireAuth, (req: Request, res: Response) => {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').run(now, req.user!.id);
    res.json({ message: 'All notifications marked as read' });
  });

  router.get('/notifications/preferences', requireAuth, (req: Request, res: Response) => {
    const db = getDb();
    let prefs = db.prepare('SELECT * FROM notification_preferences WHERE user_id = ?').get(req.user!.id) as any;
    if (!prefs) {
      const id = uuidv4();
      const now = new Date().toISOString();
      db.prepare(
        'INSERT INTO notification_preferences (id, user_id, created_at) VALUES (?, ?, ?)'
      ).run(id, req.user!.id, now);
      prefs = db.prepare('SELECT * FROM notification_preferences WHERE user_id = ?').get(req.user!.id) as any;
    }
    res.json({
      emailNotifications: !!prefs.email_notifications,
      pushNotifications: !!prefs.push_notifications,
      types: prefs.types ? JSON.parse(prefs.types) : [],
    });
  });

  router.put('/notifications/preferences', requireAuth, (req: Request, res: Response) => {
    const parsed = updatePreferencesSchema.parse(req.body);
    const db = getDb();
    const existing = db.prepare('SELECT id FROM notification_preferences WHERE user_id = ?').get(req.user!.id) as any;
    const now = new Date().toISOString();
    if (!existing) {
      const id = uuidv4();
      db.prepare(
        'INSERT INTO notification_preferences (id, user_id, email_notifications, push_notifications, types, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(id, req.user!.id, parsed.emailNotifications !== false ? 1 : 0, parsed.pushNotifications !== false ? 1 : 0, parsed.types ? JSON.stringify(parsed.types) : '[]', now, now);
    } else {
      const updates: string[] = [];
      const values: any[] = [];
      if (parsed.emailNotifications !== undefined) {
        updates.push('email_notifications = ?');
        values.push(parsed.emailNotifications ? 1 : 0);
      }
      if (parsed.pushNotifications !== undefined) {
        updates.push('push_notifications = ?');
        values.push(parsed.pushNotifications ? 1 : 0);
      }
      if (parsed.types !== undefined) {
        updates.push('types = ?');
        values.push(JSON.stringify(parsed.types));
      }
      updates.push('updated_at = ?');
      values.push(now);
      values.push(req.user!.id);
      db.prepare(`UPDATE notification_preferences SET ${updates.join(', ')} WHERE user_id = ?`).run(...values);
    }
    const prefs = db.prepare('SELECT * FROM notification_preferences WHERE user_id = ?').get(req.user!.id) as any;
    res.json({
      emailNotifications: !!prefs.email_notifications,
      pushNotifications: !!prefs.push_notifications,
      types: prefs.types ? JSON.parse(prefs.types) : [],
    });
  });

  router.delete('/notifications/:id', requireAuth, (req: Request, res: Response) => {
    const db = getDb();
    const result = db.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?').run(req.params.id, req.user!.id);
    if (result.changes === 0) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }
    res.json({ message: 'Notification deleted' });
  });

  router.post('/admin/notifications', requireAuth, (req: Request, res: Response) => {
    if (req.user?.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    const parsed = sendNotificationSchema.parse(req.body);
    const db = getDb();
    const now = new Date().toISOString();
    const ids: string[] = [];
    for (const userId of parsed.userIds) {
      const id = uuidv4();
      db.prepare(
        'INSERT INTO notifications (id, user_id, type, title, body, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(id, userId, parsed.type, parsed.title, parsed.body, parsed.data ? JSON.stringify(parsed.data) : null, now);
      ids.push(id);
    }
    res.status(201).json({ message: `Notification sent to ${parsed.userIds.length} user(s)`, notificationIds: ids });
  });

  return router;
}
