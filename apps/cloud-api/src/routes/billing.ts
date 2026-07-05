import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { billing } from '../services/billing.js';

export function createBillingRouter(): Router {
  const router = Router();

  router.post('/checkout', requireAuth, async (req: Request, res: Response) => {
    try {
      const { planId, successUrl, cancelUrl } = z
        .object({
          planId: z.string(),
          successUrl: z.string(),
          cancelUrl: z.string(),
        })
        .parse(req.body);
      const url = await billing.createCheckoutSession(req.user!.id, planId, successUrl, cancelUrl);
      if (!url) {
        res.status(400).json({ error: 'Stripe not configured — use stub payment instead' });
        return;
      }
      res.json({ url });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/stripe/webhook', async (req: Request, res: Response) => {
    const sig = req.headers['stripe-signature'] as string;
    if (!sig) {
      res.status(400).json({ error: 'Missing stripe-signature header' });
      return;
    }
    const rawBody = JSON.stringify(req.body);
    const result = await billing.handleWebhook(rawBody, sig);
    res.json(result);
  });

  router.post('/create-portal-session', requireAuth, async (req: Request, res: Response) => {
    const { returnUrl } = z.object({ returnUrl: z.string() }).parse(req.body);
    const url = await billing.createPortalSession(req.user!.id, returnUrl);
    if (!url) {
      res.status(400).json({ error: 'No active subscription found' });
      return;
    }
    res.json({ url });
  });

  return router;
}
