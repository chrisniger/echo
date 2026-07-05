import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { syncService } from '../services/sync.js';

const syncSessionSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  model: z.string().optional(),
  duration: z.number().optional(),
  startedAt: z.string(),
  endedAt: z.string().optional(),
});

const syncCvSchema = z.object({
  id: z.string(),
  name: z.string(),
  fileName: z.string(),
  tags: z.array(z.string()).optional(),
  isDefault: z.boolean().optional(),
});

export function createSyncRouter(): Router {
  const router = Router();

  // Session sync
  router.post('/sync/sessions', requireAuth, (req: Request, res: Response) => {
    const parsed = syncSessionSchema.parse(req.body);
    syncService.syncSession(req.user!.id, parsed);
    res.json({ message: 'Session synced' });
  });

  router.get('/sync/sessions', requireAuth, (req: Request, res: Response) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    res.json(syncService.getUserSessions(req.user!.id, page, limit));
  });

  router.get('/sync/sessions/:id', requireAuth, (req: Request, res: Response) => {
    const session = syncService.getSession(req.user!.id, req.params.id as string);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json(session);
  });

  router.delete('/sync/sessions/:id', requireAuth, (req: Request, res: Response) => {
    if (syncService.deleteSession(req.user!.id, req.params.id as string)) {
      res.json({ message: 'Session deleted' });
    } else {
      res.status(404).json({ error: 'Session not found' });
    }
  });

  // CV sync
  router.post('/sync/cvs', requireAuth, (req: Request, res: Response) => {
    const parsed = syncCvSchema.parse(req.body);
    syncService.syncCv(req.user!.id, parsed);
    res.json({ message: 'CV synced' });
  });

  router.get('/sync/cvs', requireAuth, (_req: Request, res: Response) => {
    res.json(syncService.getUserCvs(_req.user!.id));
  });

  router.delete('/sync/cvs/:id', requireAuth, (req: Request, res: Response) => {
    if (syncService.deleteCv(req.user!.id, req.params.id as string)) {
      res.json({ message: 'CV deleted' });
    } else {
      res.status(404).json({ error: 'CV not found' });
    }
  });

  // Remote configuration
  router.get('/sync/config', requireAuth, (_req: Request, res: Response) => {
    res.json(syncService.getRemoteConfig());
  });

  // File upload (signed URL generation)
  router.post('/sync/upload-url', requireAuth, (req: Request, res: Response) => {
    const { fileName, fileType } = z
      .object({ fileName: z.string(), fileType: z.string() })
      .parse(req.body);
    const fileId = `${req.user!.id}/${Date.now()}-${fileName}`;
    // Placeholder — in production, generate pre-signed S3/R2 URL
    res.json({ fileId, uploadUrl: `/api/sync/upload/${fileId}`, method: 'PUT' });
  });

  return router;
}
