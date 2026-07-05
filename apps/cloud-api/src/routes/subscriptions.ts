import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth } from '../middleware/auth.js';
import { getDb } from '../db/index.js';

const createPlanSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100),
  description: z.string().optional(),
  priceMonthly: z.number().int().min(0),
  priceYearly: z.number().int().min(0),
  features: z.array(z.string()).optional(),
  sessionLimit: z.number().int().min(0).optional(),
  tokenLimit: z.number().int().min(0).optional(),
  storageLimit: z.number().int().min(0).optional(),
  sortOrder: z.number().int().optional(),
});

const updatePlanSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  priceMonthly: z.number().int().min(0).optional(),
  priceYearly: z.number().int().min(0).optional(),
  features: z.array(z.string()).optional(),
  sessionLimit: z.number().int().min(0).optional(),
  tokenLimit: z.number().int().min(0).optional(),
  storageLimit: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const createSubscriptionSchema = z.object({
  planId: z.string().min(1),
  paymentMethod: z.string().min(1),
});

const updatePaymentMethodSchema = z.object({
  paymentMethod: z.string().min(1),
});

export function createSubscriptionsRouter(): Router {
  const router = Router();

  router.get('/subscriptions/plans', (_req: Request, res: Response) => {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM subscription_plans WHERE is_active = 1 ORDER BY sort_order ASC').all() as any[];
    res.json(rows.map(r => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description,
      priceMonthly: r.price_monthly,
      priceYearly: r.price_yearly,
      features: r.features ? JSON.parse(r.features) : [],
      sessionLimit: r.session_limit,
      tokenLimit: r.token_limit,
      storageLimit: r.storage_limit,
      sortOrder: r.sort_order,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })));
  });

  router.get('/subscriptions/my', requireAuth, (req: Request, res: Response) => {
    const db = getDb();
    const sub = db.prepare('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(req.user!.id) as any;
    if (!sub) {
      res.json(null);
      return;
    }
    res.json({
      id: sub.id,
      planId: sub.plan_id,
      planName: sub.plan_name,
      status: sub.status,
      currentPeriodStart: sub.current_period_start,
      currentPeriodEnd: sub.current_period_end,
      features: sub.features ? JSON.parse(sub.features) : [],
      usageQuota: sub.usage_quota ? JSON.parse(sub.usage_quota) : { sessionsPerMonth: 0, tokensPerMonth: 0, storageGb: 0 },
      usageCurrent: sub.usage_current ? JSON.parse(sub.usage_current) : { sessionsUsed: 0, tokensUsed: 0, storageUsedGb: 0 },
    });
  });

  router.post('/subscriptions/create', requireAuth, (req: Request, res: Response) => {
    const parsed = createSubscriptionSchema.parse(req.body);
    const db = getDb();
    const plan = db.prepare('SELECT * FROM subscription_plans WHERE id = ? AND is_active = 1').get(parsed.planId) as any;
    if (!plan) {
      res.status(404).json({ error: 'Plan not found' });
      return;
    }
    const id = uuidv4();
    const now = new Date().toISOString();
    const periodStart = now;
    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(
      'INSERT INTO subscriptions (id, user_id, plan_id, plan_name, status, current_period_start, current_period_end, features, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, req.user!.id, plan.id, plan.name, 'pending', periodStart, periodEnd, plan.features || '[]', now, now);
    res.status(201).json({
      id,
      status: 'pending',
      paymentUrl: `https://pay.echo-gpt.app/checkout/${id}`,
    });
  });

  router.post('/subscriptions/cancel', requireAuth, (req: Request, res: Response) => {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare("UPDATE subscriptions SET status = 'canceled', updated_at = ? WHERE user_id = ?").run(now, req.user!.id);
    res.json({ message: 'Subscription canceled' });
  });

  router.put('/subscriptions/payment-method', requireAuth, (req: Request, res: Response) => {
    const parsed = updatePaymentMethodSchema.parse(req.body);
    res.json({ message: 'Payment method updated', method: parsed.paymentMethod });
  });

  router.get('/subscriptions/invoices', requireAuth, (_req: Request, res: Response) => {
    res.json([]);
  });

  router.get('/admin/plans', requireAuth, (req: Request, res: Response) => {
    if (req.user?.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    const db = getDb();
    const rows = db.prepare('SELECT * FROM subscription_plans ORDER BY sort_order ASC').all() as any[];
    res.json(rows.map(r => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description,
      priceMonthly: r.price_monthly,
      priceYearly: r.price_yearly,
      features: r.features ? JSON.parse(r.features) : [],
      sessionLimit: r.session_limit,
      tokenLimit: r.token_limit,
      storageLimit: r.storage_limit,
      isActive: !!r.is_active,
      sortOrder: r.sort_order,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })));
  });

  router.post('/admin/plans', requireAuth, (req: Request, res: Response) => {
    if (req.user?.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    const parsed = createPlanSchema.parse(req.body);
    const db = getDb();
    const id = uuidv4();
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO subscription_plans (id, name, slug, description, price_monthly, price_yearly, features, session_limit, token_limit, storage_limit, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, parsed.name, parsed.slug, parsed.description || null, parsed.priceMonthly, parsed.priceYearly, parsed.features ? JSON.stringify(parsed.features) : null, parsed.sessionLimit || null, parsed.tokenLimit || null, parsed.storageLimit || null, parsed.sortOrder || 0, now, now);
    const row = db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(id) as any;
    res.status(201).json({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      priceMonthly: row.price_monthly,
      priceYearly: row.price_yearly,
      features: row.features ? JSON.parse(row.features) : [],
      sessionLimit: row.session_limit,
      tokenLimit: row.token_limit,
      storageLimit: row.storage_limit,
      isActive: !!row.is_active,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  });

  router.put('/admin/plans/:id', requireAuth, (req: Request, res: Response) => {
    if (req.user?.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    const parsed = updatePlanSchema.parse(req.body);
    const db = getDb();
    const existing = db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(req.params.id) as any;
    if (!existing) {
      res.status(404).json({ error: 'Plan not found' });
      return;
    }
    const now = new Date().toISOString();
    const updates: string[] = [];
    const values: any[] = [];
    const fieldMap: Record<string, string> = {
      name: 'name',
      slug: 'slug',
      description: 'description',
      priceMonthly: 'price_monthly',
      priceYearly: 'price_yearly',
      sessionLimit: 'session_limit',
      tokenLimit: 'token_limit',
      storageLimit: 'storage_limit',
      sortOrder: 'sort_order',
    };
    for (const [key, col] of Object.entries(fieldMap)) {
      if ((parsed as any)[key] !== undefined) {
        updates.push(`${col} = ?`);
        values.push((parsed as any)[key]);
      }
    }
    if (parsed.features !== undefined) {
      updates.push('features = ?');
      values.push(JSON.stringify(parsed.features));
    }
    if (parsed.isActive !== undefined) {
      updates.push('is_active = ?');
      values.push(parsed.isActive ? 1 : 0);
    }
    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }
    updates.push('updated_at = ?');
    values.push(now);
    values.push(req.params.id);
    db.prepare(`UPDATE subscription_plans SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    const row = db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(req.params.id) as any;
    res.json({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      priceMonthly: row.price_monthly,
      priceYearly: row.price_yearly,
      features: row.features ? JSON.parse(row.features) : [],
      sessionLimit: row.session_limit,
      tokenLimit: row.token_limit,
      storageLimit: row.storage_limit,
      isActive: !!row.is_active,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  });

  router.delete('/admin/plans/:id', requireAuth, (req: Request, res: Response) => {
    if (req.user?.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    const db = getDb();
    const now = new Date().toISOString();
    const result = db.prepare('UPDATE subscription_plans SET is_active = 0, updated_at = ? WHERE id = ?').run(now, req.params.id);
    if (result.changes === 0) {
      res.status(404).json({ error: 'Plan not found' });
      return;
    }
    res.json({ message: 'Plan deactivated' });
  });

  return router;
}
