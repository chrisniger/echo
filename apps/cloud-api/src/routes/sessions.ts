import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import {
  SESSION_TYPES,
  coerceSessionType,
  type SessionType,
} from '@echo-gpt/shared-types';
import { requireAuth } from '../middleware/auth.js';
import { getDb } from '../db/index.js';
import { getWsGateway } from '../websocket/gateway-singleton.js';

declare module 'express' {
  interface Request {
    user?: { id: string; email: string; role: string };
  }
}

const router = Router();

const createSessionSchema = z.object({
  name: z.string().min(1).max(200),
  aiModel: z.string().min(1),
  responseStyle: z.string().optional(),
  audioSource: z.string().optional(),
  language: z.string().optional(),
  recordSession: z.boolean().optional(),
  enableTranscript: z.boolean().optional(),
  transcriptionIntervalMs: z.number().int().min(1000).max(60000).optional(),
  context: z.string().optional(),
  cvId: z.string().optional(),
  documentIds: z.array(z.string()).optional(),
  /** User-declared session type. Falls back to 'General' for unknown / missing values. */
  sessionType: z
    .enum(SESSION_TYPES as readonly [SessionType, ...SessionType[]])
    .optional(),
});

/**
 * PATCH /api/sessions/:id body. Zod's default behavior strips unknown keys
 * (forward-compat — newer client sending an extra field won't break an older
 * server). To reject unknown keys with a 400, add `.strict()`.
 *
 * Only fields the cloud is willing to update mid-session live here.
 * `status`, `name`, `aiModel` etc. are intentionally NOT patchable — use the
 * dedicated endpoints (POST /:id/end, POST /:id/pause).
 */
const patchSessionSchema = z.object({
  /** Reclassify the session type. Allowed on active AND paused sessions; rejected on ended. */
  sessionType: z
    .enum(SESSION_TYPES as readonly [SessionType, ...SessionType[]])
    .optional(),
  transcriptionIntervalMs: z.number().int().min(1000).max(60000).optional(),
});

function safeJsonParse(value: string | null | undefined, fallback: any = null): any {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/**
 * Build the in-memory snapshot of CV + documents text that will live on the
 * session row. We capture raw_text at session-creation time so the AI prompt
 * can be assembled on every request without re-fetching from cv_library.
 */
function loadSessionContext(db: any, userId: string, cvId?: string, documentIds?: string[]): {
  cvId: string | null;
  cvContent: string | null;
  documents: Array<{ id: string; name: string; content: string }>;
} {
  const result = {
    cvId: null as string | null,
    cvContent: null as string | null,
    documents: [] as Array<{ id: string; name: string; content: string }>,
  };

  if (cvId) {
    const row = db
      .prepare('SELECT id, name, raw_text, parsed_data FROM cv_library WHERE id = ? AND user_id = ?')
      .get(cvId, userId) as any;
    if (row) {
      result.cvId = row.id;
      result.cvContent =
        row.raw_text ||
        (row.parsed_data ? JSON.stringify(safeJsonParse(row.parsed_data, {}), null, 2) : null);
    }
  }

  if (documentIds && documentIds.length > 0) {
    for (const docId of documentIds) {
      const row = db
        .prepare('SELECT id, name, raw_text, parsed_data FROM cv_library WHERE id = ? AND user_id = ?')
        .get(docId, userId) as any;
      if (!row) continue;
      const content =
        row.raw_text ||
        (row.parsed_data ? JSON.stringify(safeJsonParse(row.parsed_data, {}), null, 2) : '');
      result.documents.push({ id: row.id, name: row.name, content });
    }
  }

  return result;
}

function mapSession(session: any) {
  const documentIds = safeJsonParse(session.document_ids, [] as string[]);
  const documents = safeJsonParse(
    session.documents_content,
    [] as Array<{ id: string; name: string; content: string }>,
  );
  return {
    id: session.id,
    name: session.name,
    status: session.status,
    aiModel: session.ai_model,
    responseStyle: session.response_style,
    language: session.language,
    audioSource: session.audio_source,
    transcriptionIntervalMs: session.transcription_interval_ms ?? 5000,
    sessionType: coerceSessionType(session.session_type),
    startedAt: session.started_at,
    endedAt: session.ended_at,
    duration: session.duration,
    transcriptCount: session.transcript_count,
    aiResponseCount: session.ai_response_count,
    screenshotCount: session.screenshot_count,
    tags: session.tags ? JSON.parse(session.tags) : [],
    summary: session.summary,
    cvId: session.cv_id || null,
    cvContent: session.cv_content || null,
    additionalContext: session.context,
    documentIds,
    documents,
  };
}

router.post('/sessions', requireAuth, (req, res) => {
  // z.enum(SESSION_TYPES) is the API binding — its closed-union behavior
  // is pinned by packages/shared-types/src/session.test.ts. If you relax the schema
  // to z.string().optional(), update that test (those tests will fail) AND re-add
  // an explicit VALID_SESSION_TYPES.has(...) 400 fallback here.
  const parsed = createSessionSchema.parse(req.body);
  const db = getDb();
  const userId = (req as any).user!.id;
  const now = new Date().toISOString();
  const sessionId = uuid();

  const ctx = loadSessionContext(db, userId, parsed.cvId, parsed.documentIds);

  db.prepare(`
    INSERT INTO sessions (
      id, user_id, name, ai_model, session_type, response_style, audio_source,
      language, record_session, enable_transcript, transcription_interval_ms, context,
      cv_id, cv_content, document_ids, documents_content,
      status, duration, transcript_count, ai_response_count,
      screenshot_count, started_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, 0, 0, 0, ?, ?)
  `).run(
    sessionId,
    userId,
    parsed.name,
    parsed.aiModel,
    parsed.sessionType ?? 'General',
    parsed.responseStyle || 'concise',
    parsed.audioSource || 'microphone',
    parsed.language || 'en',
    parsed.recordSession ? 1 : 0,
    parsed.enableTranscript ? 1 : 0,
    parsed.transcriptionIntervalMs ?? 5000,
    parsed.context || null,
    ctx.cvId,
    ctx.cvContent,
    ctx.documents.length ? JSON.stringify(ctx.documents.map((d) => d.id)) : null,
    ctx.documents.length ? JSON.stringify(ctx.documents) : null,
    now,
    now
  );

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any;

  // Map database fields to API response
  res.status(201).json(mapSession(session));
});

router.get('/sessions', requireAuth, (req, res) => {
  const db = getDb();
  const userId = (req as any).user!.id;
  const sessions = db.prepare(`
    SELECT * FROM sessions 
    WHERE user_id = ? 
    ORDER BY started_at DESC 
    LIMIT 50
  `).all(userId) as any[];
  
  // Map database fields to API response
  const mappedSessions = sessions.map(mapSession);
  
  res.json({ sessions: mappedSessions });
});

router.get('/sessions/:id', requireAuth, (req, res) => {
  const db = getDb();
  const userId = (req as any).user!.id;
  const session = db.prepare(`
    SELECT * FROM sessions
    WHERE id = ? AND user_id = ?
  `).get(req.params.id, userId) as any;

  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  // Map database fields to API response
  res.json(mapSession(session));
});

/**
 * PATCH /api/sessions/:id — mid-session updates.
 *
 * Currently supports: sessionType reclassification (e.g. user realizes mid-call
 * that this is a "Customer Support" session, not a "General" one).
 *
 * Routing contract:
 *  - Zod validates the body, narrowing `sessionType` to `SessionType | undefined` BEFORE
 *    this handler reaches the DB.
 *  - `coerceSessionType` is used only on the READ side — to defend against
 *    legacy/garbage rows that predate the enum. Writes are already enum-safe.
 *  - 404 if the session doesn't belong to this user (privacy boundary).
 *  - 409 if the session is ended — an ended session is immutable.
 *  - 200 + current session + no broadcast if:
 *      (a) `sessionType` was omitted (no-op), or
 *      (b) `sessionType` equals the current stored value (no-op).
 *  - The UPDATE clause itself filters `status != 'ended'`, closing the
 *    race window where the session is ended between our preflight SELECT
 *    and the UPDATE (we detect this via `result.changes === 0`).
 *  - On a real change, broadcast `session.updated` to both the session room
 *    (other desktop instances) and the user's room (Flutter companion).
 */
router.patch('/sessions/:id', requireAuth, (req, res) => {
  // URL routing guarantees `:id` is a single string segment; coerce from
  // Express's wider `string | string[]` param type so it satisfies the
  // typed SessionUpdatedEvent sessionId field below.
  const sessionId: string = String(req.params.id);
  const parsed = patchSessionSchema.parse(req.body);

  if (parsed.sessionType === undefined && parsed.transcriptionIntervalMs === undefined) {
    // Empty PATCH — return current state, no broadcast.
    const db = getDb();
    const userId = (req as any).user!.id;
    const session = db
      .prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?')
      .get(sessionId, userId) as any;
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json(mapSession(session));
    return;
  }

  const db = getDb();
  const userId = (req as any).user!.id;

  const current = db
    .prepare('SELECT id, status, session_type, transcription_interval_ms FROM sessions WHERE id = ? AND user_id = ?')
    .get(sessionId, userId) as any;

  if (!current) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  if (current.status === 'ended') {
    res.status(409).json({ error: 'Session is ended and cannot be modified' });
    return;
  }

  // Defensive read: defend against legacy/garbage values that predate the enum.
  const previousSessionType = coerceSessionType(current.session_type);
  const previousTranscriptionIntervalMs = current.transcription_interval_ms ?? 5000;

  const updates: string[] = [];
  const values: Array<string | number> = [];
  const updatedFields: string[] = [];

  if (parsed.sessionType !== undefined && parsed.sessionType !== previousSessionType) {
    updates.push('session_type = ?');
    values.push(parsed.sessionType);
    updatedFields.push('sessionType');
  }

  if (
    parsed.transcriptionIntervalMs !== undefined &&
    parsed.transcriptionIntervalMs !== previousTranscriptionIntervalMs
  ) {
    updates.push('transcription_interval_ms = ?');
    values.push(parsed.transcriptionIntervalMs);
    updatedFields.push('transcriptionIntervalMs');
  }

  if (updates.length === 0) {
    const session = db
      .prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?')
      .get(sessionId, userId) as any;
    res.json(mapSession(session));
    return;
  }

  const now = new Date().toISOString();
  const result = db
    .prepare(
      `UPDATE sessions
         SET ${updates.join(', ')}, updated_at = ?
       WHERE id = ? AND user_id = ? AND status != 'ended'`,
    )
    .run(...values, now, sessionId, userId);

  if (result.changes === 0) {
    // Race: session was ended between our SELECT and UPDATE.
    res.status(409).json({ error: 'Session was ended during update' });
    return;
  }

  const updated = db
    .prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?')
    .get(sessionId, userId) as any;

  // Broadcast session.updated so all connected devices re-render the badge.
  // rooms.broadcast only writes to OPEN sockets and never throws; no try/catch needed.
  getWsGateway().broadcastSessionEvent(
    {
      type: 'session.updated',
      data: {
        sessionId,
        sessionType: parsed.sessionType ?? previousSessionType,
        transcriptionIntervalMs: parsed.transcriptionIntervalMs ?? previousTranscriptionIntervalMs,
        previousSessionType,
        previousTranscriptionIntervalMs,
        updatedAt: now,
        updatedFields,
      },
    },
    sessionId,
    userId,
  );

  res.json(mapSession(updated));
});

router.post('/sessions/:id/pause', requireAuth, (req, res) => {
  const db = getDb();
  const userId = (req as any).user!.id;
  const now = new Date().toISOString();

  const result = db.prepare(`
    UPDATE sessions 
    SET status = 'paused', updated_at = ?
    WHERE id = ? AND user_id = ? AND status = 'active'
  `).run(now, req.params.id, userId);

  if (result.changes === 0) {
    res.status(404).json({ error: 'Session not found or not active' });
    return;
  }

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  getWsGateway().broadcastSessionEvent(
    { type: 'session.pause', data: { sessionId: String(req.params.id), status: 'paused', timestamp: Date.now() } },
    String(req.params.id),
    userId,
  );
  res.json(mapSession(session));
});

router.post('/sessions/:id/resume', requireAuth, (req, res) => {
  const db = getDb();
  const userId = (req as any).user!.id;
  const now = new Date().toISOString();

  const result = db.prepare(`
    UPDATE sessions 
    SET status = 'active', updated_at = ?
    WHERE id = ? AND user_id = ? AND status = 'paused'
  `).run(now, req.params.id, userId);

  if (result.changes === 0) {
    res.status(404).json({ error: 'Session not found or not paused' });
    return;
  }

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  getWsGateway().broadcastSessionEvent(
    { type: 'session.resume', data: { sessionId: String(req.params.id), status: 'resumed', timestamp: Date.now() } },
    String(req.params.id),
    userId,
  );
  res.json(mapSession(session));
});

router.post('/sessions/:id/end', requireAuth, (req, res) => {
  const db = getDb();
  const userId = (req as any).user!.id;
  const now = new Date().toISOString();

  const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(req.params.id, userId) as any;
  
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const startTime = new Date(session.started_at).getTime();
  const endTime = new Date(now).getTime();
  const duration = Math.floor((endTime - startTime) / 60000);

  db.prepare(`
    UPDATE sessions 
    SET status = 'ended', duration = ?, ended_at = ?, updated_at = ?
    WHERE id = ?
  `).run(duration, now, now, req.params.id);

  const updated = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  getWsGateway().broadcastSessionEvent(
    { type: 'session.end', data: { sessionId: String(req.params.id), status: 'ended', duration, timestamp: Date.now() } },
    String(req.params.id),
    userId,
  );
  res.json(mapSession(updated));
});

router.get('/sessions/:id/transcript', requireAuth, (req, res) => {
  const db = getDb();
  const userId = (req as any).user!.id;
  const segments = db.prepare(`
    SELECT ts.*
    FROM transcript_segments ts
    INNER JOIN sessions s ON s.id = ts.session_id
    WHERE ts.session_id = ? AND s.user_id = ?
    ORDER BY ts.timestamp ASC, ts.created_at ASC
  `).all(req.params.id, userId) as any[];

  res.json(
    segments.map((segment) => ({
      id: segment.id,
      sessionId: segment.session_id,
      speakerId: segment.speaker || 'unknown',
      speakerLabel: segment.speaker || 'Speaker',
      text: segment.text,
      confidence: segment.confidence ?? 0,
      startTime: segment.start_time ?? segment.timestamp ?? 0,
      endTime: segment.end_time ?? segment.timestamp ?? 0,
      isEdited: !!segment.is_edited,
      createdAt: segment.created_at,
    })),
  );
});

router.get('/sessions/:id/responses', requireAuth, (req, res) => {
  const db = getDb();
  const userId = (req as any).user!.id;
  const responses = db.prepare(`
    SELECT ar.*
    FROM ai_responses ar
    INNER JOIN sessions s ON s.id = ar.session_id
    WHERE ar.session_id = ? AND s.user_id = ?
    ORDER BY ar.created_at ASC
  `).all(req.params.id, userId) as any[];

  res.json(
    responses.map((response) => ({
      id: response.id,
      sessionId: response.session_id,
      query: response.query,
      response: response.response,
      model: response.model,
      provider: response.provider,
      tokensUsed: response.tokens_used,
      createdAt: response.created_at,
    })),
  );
});

export default router;
