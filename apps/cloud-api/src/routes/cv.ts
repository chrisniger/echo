import type { Request, Response } from 'express';
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { cvParserService } from '../services/cv-parser.js';
import multer from 'multer';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    // cv-upload doubles as a generic document store: CV / resume PDFs and
    // common supplementary document formats are accepted so the "Additional
    // Documents" picker in NewSession can be wired without a separate route.
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown',
      'text/x-markdown',
      'text/csv',
      'application/json',
    ];
    const allowedByExt = /\.(pdf|docx?|txt|md|markdown|csv|json)$/i.test(file.originalname);
    if (allowedTypes.includes(file.mimetype) || allowedByExt) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: PDF, DOC, DOCX, TXT, MD, CSV, JSON.'));
    }
  },
});

export function createCvRouter(): Router {
  const router = Router();

  // Upload and parse CV
  router.post('/cv/upload', requireAuth, upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const rawText = await cvParserService.extractTextForStorage(req.file.buffer, req.file.mimetype);
      const parsed = await cvParserService.parseCv(req.file.buffer, req.file.mimetype);
      const cvId = cvParserService.storeCv(
        req.user!.id,
        req.file.originalname,
        parsed,
        rawText,
        { fileSize: req.file.size, mimeType: req.file.mimetype }
      );
      const cv = cvParserService.getCv(cvId, req.user!.id);

      res.json(cv);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // List all CVs
  router.get('/cv/list', requireAuth, (req: Request, res: Response) => {
    try {
      const cvs = cvParserService.listCvs(req.user!.id);
      res.json({ cvs });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Get CV by ID
  router.get('/cv/:id', requireAuth, (req: Request, res: Response) => {
    try {
      const cv = cvParserService.getCv(String(req.params.id), req.user!.id);
      if (!cv) {
        res.status(404).json({ error: 'CV not found' });
        return;
      }
      res.json(cv);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Delete CV
  router.delete('/cv/:id', requireAuth, (req: Request, res: Response) => {
    try {
      cvParserService.deleteCv(String(req.params.id), req.user!.id);
      res.json({ message: 'CV deleted successfully' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/cv/:id/default', requireAuth, (req: Request, res: Response) => {
    try {
      const cv = cvParserService.setDefaultCv(String(req.params.id), req.user!.id);
      if (!cv) {
        res.status(404).json({ error: 'CV not found' });
        return;
      }
      res.json(cv);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.put('/cv/:id', requireAuth, (req: Request, res: Response) => {
    try {
      const cv = cvParserService.updateCv(String(req.params.id), req.user!.id, {
        name: typeof req.body?.name === 'string' ? req.body.name : undefined,
        tags: Array.isArray(req.body?.tags) ? req.body.tags : undefined,
        isDefault: typeof req.body?.isDefault === 'boolean' ? req.body.isDefault : undefined,
      });
      if (!cv) {
        res.status(404).json({ error: 'CV not found' });
        return;
      }
      res.json(cv);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}
