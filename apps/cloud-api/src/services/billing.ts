import Stripe from 'stripe';
import { getDb } from '../db/index.js';
import { v4 as uuid } from 'uuid';

const stripeKey = process.env.STRIPE_SECRET_KEY || '';
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

const stripe = stripeKey ? new Stripe(stripeKey, { apiVersion: '2025-04-15' as any }) : null;

export class BillingService {
  async createCheckoutSession(
    userId: string,
    planId: string,
    successUrl: string,
    cancelUrl: string,
  ): Promise<string | null> {
    if (!stripe) return null;
    const db = getDb();
    const plan = db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(planId) as any;
    if (!plan) throw new Error('Plan not found');

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: (db.prepare('SELECT email FROM users WHERE id = ?').get(userId) as any)
        ?.email,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: plan.name },
            unit_amount: plan.price_monthly,
            recurring: { interval: 'month' },
          },
          quantity: 1,
        },
      ],
      metadata: { userId, planId },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return session.url;
  }

  async handleWebhook(
    rawBody: string,
    signature: string,
  ): Promise<{ received: boolean; type: string }> {
    if (!stripe || !stripeWebhookSecret) return { received: false, type: 'not_configured' };
    const event = stripe.webhooks.constructEvent(rawBody, signature, stripeWebhookSecret);
    const session = event.data.object as Stripe.Checkout.Session;

    if (
      event.type === 'checkout.session.completed' &&
      session.metadata?.userId &&
      session.metadata?.planId
    ) {
      const db = getDb();
      const now = new Date().toISOString();
      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const existing = db
        .prepare('SELECT id FROM subscriptions WHERE user_id = ?')
        .get(session.metadata.userId) as any;
      if (existing) {
        db.prepare(
          'UPDATE subscriptions SET status = ?, current_period_end = ?, updated_at = ? WHERE user_id = ?',
        ).run('active', periodEnd, now, session.metadata.userId);
      } else {
        db.prepare(
          'INSERT INTO subscriptions (id, user_id, plan_id, plan_name, status, current_period_start, current_period_end, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ).run(
          uuid(),
          session.metadata.userId,
          session.metadata.planId,
          'Premium',
          'active',
          now,
          periodEnd,
          now,
          now,
        );
      }
    }

    return { received: true, type: event.type };
  }

  async createPortalSession(userId: string, returnUrl: string): Promise<string | null> {
    if (!stripe) return null;
    const db = getDb();
    const sub = db
      .prepare('SELECT * FROM subscriptions WHERE user_id = ? AND status = ?')
      .get(userId, 'active') as any;
    if (!sub?.stripe_customer_id) return null;
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: returnUrl,
    });
    return session.url;
  }
}

export const billing = new BillingService();
