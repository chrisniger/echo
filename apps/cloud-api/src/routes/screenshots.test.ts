import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';

// ============================================================
// vi.mock factories run at MODULE-LOAD TIME. Vitest hoists them
// above all `import` statements. So any reference the factory
// closes over must itself be hoisted via vi.hoisted().
// ============================================================

const { TEST_USER_ID, TEST_SESSION_ID, ATTACKER_USER_ID, ATTACKER_SESSION_ID, dbHolder } =
  vi.hoisted(() => ({
    TEST_USER_ID: 'test-user-001',
    TEST_SESSION_ID: 'test-session-001',
    ATTACKER_USER_ID: 'attacker-user',
    ATTACKER_SESSION_ID: 'attacker-session',
    // The route imports getDb as a module-level singleton. We override
    // the module with vi.mock, but the mock factory needs a way to
    // reach the per-test in-memory DB. A hoisted mutable holder is the
    // canonical pattern: beforeEach assigns the freshly-created DB,
    // and the mock factory's getDb returns whatever the holder
    // currently points at.
    dbHolder: { current: null as Database.Database | null },
  }));

/**
 * Phase 24 — route-level tests for `screenshots.ts`.
 *
 * Strategy:
 *  - Real `better-sqlite3` in-memory DB so the schema DDL (the original
 *    `schema` const + the Phase 24 `SCHEMA_SCREENSHOTS` const) runs
 *    through the same code path as production.
 *  - Stub `requireAuth` so the production JWT path is bypassed on every
 *    route — `req.user` is injected directly with TEST_USER_ID.
 *  - Stub `getDb()` (defined in `../db/index.js`) via `vi.mock` +
 *    `dbHolder` so each route handler reads/writes the test's
 *    `:memory:` DB instance instead of the production file-path
 *    singleton. This is the critical fix: without the bridge, every
 *    POST does its session lookup + UPDATE against the prod DB and
 *    returns 404 because the test fixtures live in `:memory:`.
 *  - Stub `WsGateway` via the `setWsGateway()` singleton swap; assert
 *    `broadcastSessionEvent` was called exactly once with the right
 *    payload shape + room routing.
 *  - Use `supertest` so the requests round-trip through Express's
 *    middleware stack (no manual req/res mocking).
 */

// Mock `../db/index.js` FIRST so the route's `import { getDb }` resolves
// to our stub. The factory closes over `dbHolder` (hoisted above).
vi.mock('../db/index.js', () => ({
  getDb: () => {
    // Non-null assertion is safe: beforeEach assigns the holder before
    // any test body runs. A test that throws before assignment would
    // surface here as a clear "Cannot read properties of null" rather
    // than a quiet 404 from the wrong DB.
    if (!dbHolder.current) {
      throw new Error(
        'Test bug: dbHolder.current was not assigned in beforeEach before getDb() was called',
      );
    }
    return dbHolder.current;
  },
  logDbHealth: () => {
    // no-op in tests
  },
}));

// Mock `../middleware/auth.js` so requireAuth injects req.user directly,
// bypassing JWT_SECRET + bcrypt dependencies.
vi.mock('../middleware/auth.js', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: TEST_USER_ID, email: 'test@example.com', role: 'user' };
    next();
  },
}));

// Real ESM imports below — these trigger the vi.mock factories above to
// load the stub getDb + stub requireAuth into the route handler.
import { schema, SCHEMA_SCREENSHOTS } from '../db/schema.js';
import screenshotsRoutes from './screenshots.js';
import { setWsGateway } from '../websocket/gateway-singleton.js';
import type { WsGateway } from '../websocket/gateway.js';

let db: Database.Database;
let broadcastSessionEventSpy: ReturnType<typeof vi.fn>;

function seedTestSession(database: Database.Database, sessionId: string, userId: string) {
  const now = new Date().toISOString();
  database
    .prepare(
      `INSERT INTO sessions (
         id, user_id, name, ai_model, status, transcription_interval_ms,
         screenshot_count, ai_response_count, transcript_count, duration,
         started_at, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?, ?)`,
    )
    .run(sessionId, userId, 'Test Session', 'gpt-4o-mini', 'active', 5000, now, now);
}

function buildApp() {
  // No before-route stub middleware: requireAuth is mocked at module-
  // hoisted time and injects req.user itself. The route's own
  // requireAuth (now a stub) still runs per-route but is harmless.
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api', screenshotsRoutes);
  return app;
}

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  // Exec BOTH schema constants — original tables first (sessions is
  // created here so the FK on screenshots.session_id is satisfied),
  // then the Phase 24 SCHEMA_SCREENSHOTS const which creates the
  // screenshots table + idx_screenshots_session_id index.
  db.exec(schema);
  db.exec(SCHEMA_SCREENSHOTS);

  // Seed the parent users rows that satisfy `sessions.user_id REFERENCES
  // users(id) ON DELETE CASCADE`. Two distinct emails (the users.email
  // column is UNIQUE).
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO users (id, name, email, password, role, mfa_enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'user', 0, ?, ?)`,
  ).run(TEST_USER_ID, 'Test User', 'test@example.com', 'x', now, now);
  db.prepare(
    `INSERT INTO users (id, name, email, password, role, mfa_enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'user', 0, ?, ?)`,
  ).run(ATTACKER_USER_ID, 'Attacker', 'attacker@example.com', 'x', now, now);

  seedTestSession(db, TEST_SESSION_ID, TEST_USER_ID);
  seedTestSession(db, ATTACKER_SESSION_ID, ATTACKER_USER_ID);

  // Critical: assign the in-memory DB into the holder BEFORE any test
  // body runs. The route's getDb() mock returns dbHolder.current on
  // each call. Without this, route handlers would throw the
  // "dbHolder.current was not assigned" error from the mock above.
  dbHolder.current = db;

  broadcastSessionEventSpy = vi.fn();
  setWsGateway({ broadcastSessionEvent: broadcastSessionEventSpy } as unknown as WsGateway);
});

afterEach(() => {
  // Close the in-memory DB and clear the holder so the next test starts
  // from a guaranteed-clean state (avoids any cross-test leak should
  // vitest reuse worker state on slow CI machines).
  if (db) {
    db.close();
  }
  dbHolder.current = null;
});

const ONE_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('POST /api/screenshots', () => {
  it('persists the row + returns 201 with the canonical Screenshot shape', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/screenshots').send({
      sessionId: TEST_SESSION_ID,
      mime: 'image/png',
      width: 1920,
      height: 1080,
      cropBoxJson: null,
      dataUrl: ONE_PNG_DATA_URL,
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.sessionId).toBe(TEST_SESSION_ID);
    expect(res.body.mime).toBe('image/png');
    expect(res.body.width).toBe(1920);
    expect(res.body.height).toBe(1080);
    expect(res.body.dataUrl).toBe(ONE_PNG_DATA_URL);
    expect(res.body.cropBoxJson).toBe(null);
    expect(typeof res.body.takenAt).toBe('string');
  });

  it('broadcasts screenshot.create to both session + user rooms via the singleton', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/screenshots').send({
      sessionId: TEST_SESSION_ID,
      mime: 'image/png',
      width: 800,
      height: 600,
      cropBoxJson: null,
      dataUrl: ONE_PNG_DATA_URL,
    });

    expect(res.status).toBe(201);
    expect(broadcastSessionEventSpy).toHaveBeenCalledTimes(1);

    const [event, sessionId, userId] = broadcastSessionEventSpy.mock.calls[0];
    expect(sessionId).toBe(TEST_SESSION_ID);
    expect(userId).toBe(TEST_USER_ID);
    expect(event.type).toBe('screenshot.create');
    expect(event.data.id).toBe(res.body.id);
    expect(event.data.dataUrl).toBe(ONE_PNG_DATA_URL);
  });

  it('bumps the parent session screenshot_count +1', async () => {
    const app = buildApp();
    await request(app).post('/api/screenshots').send({
      sessionId: TEST_SESSION_ID,
      mime: 'image/png',
      width: 100,
      height: 100,
      cropBoxJson: null,
      dataUrl: ONE_PNG_DATA_URL,
    });
    const row = db
      .prepare('SELECT screenshot_count FROM sessions WHERE id = ?')
      .get(TEST_SESSION_ID) as { screenshot_count: number };
    expect(row.screenshot_count).toBe(1);
  });

  it('returns 400 on a non-closed-union mime', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/screenshots').send({
      sessionId: TEST_SESSION_ID,
      mime: 'image/webp',
      width: 100,
      height: 100,
      dataUrl: 'data:image/webp;base64,xx',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation error');
  });

  it('returns 404 when the session belongs to another user', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/screenshots').send({
      sessionId: ATTACKER_SESSION_ID,
      mime: 'image/png',
      width: 100,
      height: 100,
      dataUrl: ONE_PNG_DATA_URL,
    });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Session not found');
    // Critical: the failed POST must NOT broadcast — paired devices should
    // never see a phantom capture.
    expect(broadcastSessionEventSpy).not.toHaveBeenCalled();
  });

  it('returns 400 when dataUrl is missing the data: prefix', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/screenshots').send({
      sessionId: TEST_SESSION_ID,
      mime: 'image/png',
      width: 100,
      height: 100,
      dataUrl: 'not-a-data-url',
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/sessions/:sessionId/screenshots', () => {
  it('returns 200 + empty list for an unpopulated session', async () => {
    const app = buildApp();
    const res = await request(app).get(`/api/sessions/${TEST_SESSION_ID}/screenshots`);
    expect(res.status).toBe(200);
    expect(res.body.screenshots).toEqual([]);
  });

  it('returns 200 + the chronological list after multiple captures', async () => {
    const app = buildApp();
    const earlier = new Date('2025-01-01T10:00:00Z').toISOString();
    const later = new Date('2025-01-01T11:00:00Z').toISOString();

    await request(app).post('/api/screenshots').send({
      sessionId: TEST_SESSION_ID,
      takenAt: earlier,
      mime: 'image/png',
      width: 100,
      height: 100,
      dataUrl: ONE_PNG_DATA_URL,
    });
    await request(app)
      .post('/api/screenshots')
      .send({
        sessionId: TEST_SESSION_ID,
        takenAt: later,
        mime: 'image/jpeg',
        width: 100,
        height: 100,
        dataUrl: ONE_PNG_DATA_URL.replace('png', 'jpeg'),
      });

    const res = await request(app).get(`/api/sessions/${TEST_SESSION_ID}/screenshots`);
    expect(res.status).toBe(200);
    expect(res.body.screenshots).toHaveLength(2);
    expect(res.body.screenshots[0].takenAt).toBe(earlier);
    expect(res.body.screenshots[1].takenAt).toBe(later);
  });
});

describe('GET /api/screenshots/:id', () => {
  it('returns 404 when the id does not exist', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/screenshots/nope-not-real');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Screenshot not found');
  });
});

describe('DELETE /api/screenshots/:id', () => {
  it('returns 204 on success and removes the row', async () => {
    const seededId = 'ss-001';
    db.prepare(
      `INSERT INTO screenshots (
         id, session_id, taken_at, mime, width, height, data_url
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      seededId,
      TEST_SESSION_ID,
      new Date().toISOString(),
      'image/png',
      100,
      100,
      ONE_PNG_DATA_URL,
    );

    const app = buildApp();
    const res = await request(app).delete(`/api/screenshots/${seededId}`);
    expect(res.status).toBe(204);

    const remaining = db.prepare('SELECT id FROM screenshots WHERE id = ?').get(seededId);
    expect(remaining).toBeUndefined();
  });

  it('returns 404 on delete of an unknown id', async () => {
    const app = buildApp();
    const res = await request(app).delete('/api/screenshots/nope-not-real');
    expect(res.status).toBe(404);
  });

  it('returns 404 when the screenshot belongs to another user', async () => {
    const attackerScreenshotId = 'attacker-ss';
    db.prepare(
      `INSERT INTO sessions (
      id, user_id, name, ai_model, status, transcription_interval_ms,
      screenshot_count, ai_response_count, transcript_count, duration,
      started_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?, ?)`,
    ).run(
      'attacker-only-session',
      ATTACKER_USER_ID,
      'X',
      'gpt-4o-mini',
      'active',
      5000,
      new Date().toISOString(),
      new Date().toISOString(),
    );
    db.prepare(
      `INSERT INTO screenshots (
         id, session_id, taken_at, mime, width, height, data_url
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      attackerScreenshotId,
      'attacker-only-session',
      new Date().toISOString(),
      'image/png',
      100,
      100,
      ONE_PNG_DATA_URL,
    );

    const app = buildApp();
    const res = await request(app).delete(`/api/screenshots/${attackerScreenshotId}`);
    expect(res.status).toBe(404);
  });
});
