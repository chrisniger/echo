import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { SCREENSHOT_MIME_TYPES, type ScreenshotMime } from '@echo-gpt/shared-types';
import { requireAuth } from '../middleware/auth.js';
import { getDb } from '../db/index.js';
import { getWsGateway } from '../websocket/gateway-singleton.js';

declare module 'express' {
  interface Request {
    user?: { id: string; email: string; role: string };
  }
}

/**
 * 10 MB cap mirrors the express.json body limit set in src/index.ts.
 * The bound is intentionally generous to fit a downscaled JPEG of a
 * 4K monitor — a PNG@2048² capture is ~1 MB and stays well under.
 * The +100 overhead prefix tolerance accounts for `data:image/png;base64,`
 * header text. `z.string().startsWith('data:')` catches accidental
 * raw-bytes payloads.
 */
const MAX_DATAURL_LEN = 10 * 1024 * 1024 + 100;

const postScreenshotSchema = z.object({
  sessionId: z.string().min(1),
  /** Optional; server fills with `new Date().toISOString()` if omitted. */
  takenAt: z.string().optional(),
  mime: z.enum(SCREENSHOT_MIME_TYPES as readonly [ScreenshotMime, ...ScreenshotMime[]]),
  width: z.number().int().positive().max(20000),
  height: z.number().int().positive().max(20000),
  cropBoxJson: z.string().nullable().optional(),
  dataUrl: z
    .string()
    .min(40) // tiny payload guard — "data:," is 6 chars + 1 trailing ","
    .startsWith('data:')
    .refine((d) => d.length <= MAX_DATAURL_LEN, {
      message: 'dataUrl exceeds the 10MB cloud-api payload cap',
    }),
});

function mapRow(row: any) {
  return {
    id: row.id,
    sessionId: row.session_id,
    takenAt: row.taken_at,
    mime: row.mime,
    width: row.width,
    height: row.height,
    cropBoxJson: row.crop_box_json ?? null,
    dataUrl: row.data_url,
  };
}

const router = Router();

/**
 * POST /api/screenshots — desktop submits a captured screenshot.
 *  Body: { sessionId, takenAt?, mime, width, height, cropBoxJson?, dataUrl }
 *  Returns 201 with the persisted Screenshot row.
 *  Side-effect: bumps sessions.screenshot_count + broadcasts the
 *               `screenshot.create` WS event to the session room and the
 *               user's room.
 *  Errors: 400 zod, 404 session, 500 unexpected.
 */
router.post('/screenshots', requireAuth, (req, res) => {
  const parsed = postScreenshotSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation error', details: parsed.error.errors });
    return;
  }
  const db = getDb();
  const userId = (req as any).user!.id;
  const body = parsed.data;

  // Belt-and-braces against the FK rejection: a malicious user could
  // craft a sessionId from someone else's session and let the FK
  // surface a constraint error; we want a clean 404 with a clear
  // "Session not found" message instead.
  const session = db
    .prepare('SELECT id FROM sessions WHERE id = ? AND user_id = ?')
    .get(body.sessionId, userId);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const id = uuid();
  const takenAt = body.takenAt ?? new Date().toISOString();

  db.prepare(
    `INSERT INTO screenshots (
       id, session_id, taken_at, mime, width, height, crop_box_json, data_url
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    body.sessionId,
    takenAt,
    body.mime,
    body.width,
    body.height,
    body.cropBoxJson ?? null,
    body.dataUrl,
  );

  // Bump the session's `screenshot_count` for cheap list-page badges.
  db.prepare(
    `UPDATE sessions
        SET screenshot_count = screenshot_count + 1,
            updated_at        = ?
      WHERE id = ?`,
  ).run(takenAt, body.sessionId);

  const created = db.prepare('SELECT * FROM screenshots WHERE id = ?').get(id) as any;
  const dotted = mapRow(created);

  // Server-initiated broadcast: fans out to BOTH the session room
  // (other desktop instances on the same session) AND the user room
  // (Flutter companion, web portal). Same dual-fan-out used by
  // PATCH /sessions/:id (see its broadcastSessionEvent call).
  getWsGateway().broadcastSessionEvent(
    { type: 'screenshot.create', data: dotted as any },
    body.sessionId,
    userId,
  );

  res.status(201).json(dotted);
});

/**
 * GET /api/sessions/:sessionId/screenshots — list all captures for a
 * session (eager; Phase 24 §G deferreds pagination). Sorted oldest-first
 * so the client can render a chronological strip without re-sorting.
 * 401 if no auth, 404 if the session doesn't belong to this user.
 */
router.get('/sessions/:sessionId/screenshots', requireAuth, (req, res) => {
  const db = getDb();
  const userId = (req as any).user!.id;
  const rows = db
    .prepare(
      `SELECT s.*
         FROM screenshots s
         INNER JOIN sessions sess ON sess.id = s.session_id
        WHERE s.session_id = ? AND sess.user_id = ?
        ORDER BY s.taken_at ASC`,
    )
    .all(req.params.sessionId, userId) as any[];
  res.json({ screenshots: rows.map(mapRow) });
});

/**
 * GET /api/screenshots/:id — fetch a single screenshot by id. 404 if
 * the row doesn't exist OR belongs to a different user (we don't
 * disambiguate because the privacy boundary is the same).
 */
router.get('/screenshots/:id', requireAuth, (req, res) => {
  const db = getDb();
  const userId = (req as any).user!.id;
  const row = db
    .prepare(
      `SELECT s.*
         FROM screenshots s
         INNER JOIN sessions sess ON sess.id = s.session_id
        WHERE s.id = ? AND sess.user_id = ?`,
    )
    .get(req.params.id, userId) as any;
  if (!row) {
    res.status(404).json({ error: 'Screenshot not found' });
    return;
  }
  res.json(mapRow(row));
});

/**
 * DELETE /api/screenshots/:id — soft-by-id remove. CASCADE on the
 * session FK means a session delete sweeps all its screenshots
 * automatically; this endpoint is for per-row cleanup.
 * 204 on success, 404 if not found / not owner.
 */
router.delete('/screenshots/:id', requireAuth, (req, res) => {
  const db = getDb();
  const userId = (req as any).user!.id;
  // Match by screenshot id + ensure owning session belongs to this user.
  // Inner SELECT scopes to ANY session owned by userId; outer WHERE then
  // narrows to the specific screenshot id. Caught by test: a previous
  // version additionally filtered the inner by `id = req.params.id`,
  // which made the join impossible whenever the screenshot id and
  // session id differed (the normal case).
  const result = db
    .prepare(
      `DELETE FROM screenshots
        WHERE id = ? AND session_id IN (
          SELECT id FROM sessions WHERE user_id = ?
        )`,
    )
    .run(req.params.id, userId);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Screenshot not found' });
    return;
  }
  res.status(204).end();
});

export default router;
