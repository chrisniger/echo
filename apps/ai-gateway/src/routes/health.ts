import { Router } from 'express';
import { AiRouter } from '../services/router.js';

export function createHealthRouter(routerInstance: AiRouter): Router {
  const router = Router();

  router.get('/health', async (_req, res) => {
    const providers = await routerInstance.checkHealth();
    res.json({ status: 'ok', providers });
  });

  return router;
}
