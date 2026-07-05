import { Router } from 'express';
import type { AiRouter } from '../services/router.js';
import type { PromptCache } from '../services/cache.js';

export function createAdminRouter(routerInstance: AiRouter, cache?: PromptCache): Router {
  const router = Router();

  router.get('/admin/load-stats', (_req, res) => {
    const stats = routerInstance.getLoadStats();
    res.json(stats);
  });

  router.post('/admin/load-balance-mode', (req, res) => {
    const { mode } = req.body as { mode: string };
    if (!['failover', 'round-robin', 'least-loaded'].includes(mode)) {
      res.status(400).json({ error: 'Mode must be failover, round-robin, or least-loaded' });
      return;
    }
    routerInstance.setLoadBalanceMode(mode as 'failover' | 'round-robin' | 'least-loaded');
    res.json({ mode, message: `Load balance mode set to ${mode}` });
  });

  if (cache) {
    router.get('/admin/cache-stats', (_req, res) => {
      res.json(cache.stats());
    });

    router.post('/admin/cache-clear', (_req, res) => {
      cache.clear();
      res.json({ message: 'Cache cleared' });
    });
  }

  return router;
}
