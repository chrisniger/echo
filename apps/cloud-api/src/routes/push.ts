import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { pushService } from '../services/push.js';

const registerTokenSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(['ios', 'android', 'web']),
  deviceId: z.string().optional(),
});

export function createPushRouter(): Router {
  const router = Router();

  router.post('/push/register', requireAuth, (req: Request, res: Response) => {
    const parsed = registerTokenSchema.parse(req.body);
    pushService.registerToken(req.user!.id, parsed.token, parsed.platform, parsed.deviceId);
    res.json({ message: 'Token registered' });
  });

  router.post('/push/unregister', requireAuth, (req: Request, res: Response) => {
    const { token } = z.object({ token: z.string() }).parse(req.body);
    pushService.unregisterToken(token);
    res.json({ message: 'Token unregistered' });
  });

  router.get('/push/stats', requireAuth, (req: Request, res: Response) => {
    if (req.user!.role !== 'admin') {
      res.status(403).json({ error: 'Admin only' });
      return;
    }
    res.json(pushService.getStats());
  });

  return router;
}
