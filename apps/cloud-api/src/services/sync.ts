import { getDb } from '../db/index.js';
import { v4 as uuid } from 'uuid';

export class SyncService {
  syncSession(
    userId: string,
    sessionData: {
      id: string;
      name: string;
      status: string;
      model?: string;
      duration?: number;
      startedAt: string;
      endedAt?: string;
    },
  ): void {
    const db = getDb();
    const now = new Date().toISOString();
    const existing = db
      .prepare('SELECT id FROM session_metadata WHERE id = ? AND user_id = ?')
      .get(sessionData.id, userId) as any;
    if (existing) {
      db.prepare(
        'UPDATE session_metadata SET name = ?, status = ?, model = ?, duration = ?, ended_at = ?, updated_at = ? WHERE id = ?',
      ).run(
        sessionData.name,
        sessionData.status,
        sessionData.model || null,
        sessionData.duration || null,
        sessionData.endedAt || null,
        now,
        sessionData.id,
      );
    } else {
      db.prepare(
        'INSERT INTO session_metadata (id, user_id, name, status, model, duration, started_at, ended_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(
        sessionData.id,
        userId,
        sessionData.name,
        sessionData.status,
        sessionData.model || null,
        sessionData.duration || null,
        sessionData.startedAt,
        sessionData.endedAt || null,
        now,
      );
    }
  }

  getUserSessions(userId: string, page = 1, limit = 20) {
    const db = getDb();
    const offset = (page - 1) * limit;
    const total = (
      db
        .prepare('SELECT COUNT(*) as count FROM session_metadata WHERE user_id = ?')
        .get(userId) as any
    ).count;
    const rows = db
      .prepare(
        'SELECT * FROM session_metadata WHERE user_id = ? ORDER BY started_at DESC LIMIT ? OFFSET ?',
      )
      .all(userId, limit, offset) as any[];
    return {
      data: rows.map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        model: r.model,
        duration: r.duration,
        startedAt: r.started_at,
        endedAt: r.ended_at,
        createdAt: r.created_at,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  getSession(userId: string, sessionId: string) {
    const db = getDb();
    const row = db
      .prepare('SELECT * FROM session_metadata WHERE id = ? AND user_id = ?')
      .get(sessionId, userId) as any;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      model: row.model,
      duration: row.duration,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      createdAt: row.created_at,
    };
  }

  deleteSession(userId: string, sessionId: string): boolean {
    const db = getDb();
    const result = db
      .prepare('DELETE FROM session_metadata WHERE id = ? AND user_id = ?')
      .run(sessionId, userId);
    return result.changes > 0;
  }

  syncCv(
    userId: string,
    cvData: { id: string; name: string; fileName: string; tags?: string[]; isDefault?: boolean },
  ): void {
    const db = getDb();
    const now = new Date().toISOString();
    const existing = db
      .prepare('SELECT id FROM cv_library WHERE id = ? AND user_id = ?')
      .get(cvData.id, userId) as any;
    if (existing) {
      db.prepare(
        'UPDATE cv_library SET name = ?, file_name = ?, tags = ?, updated_at = ? WHERE id = ?',
      ).run(
        cvData.name,
        cvData.fileName,
        cvData.tags ? JSON.stringify(cvData.tags) : null,
        now,
        cvData.id,
      );
    } else {
      db.prepare(
        'INSERT INTO cv_library (id, user_id, name, file_name, tags, is_default, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(
        cvData.id,
        userId,
        cvData.name,
        cvData.fileName,
        cvData.tags ? JSON.stringify(cvData.tags) : null,
        cvData.isDefault ? 1 : 0,
        now,
      );
    }
  }

  getUserCvs(userId: string) {
    const db = getDb();
    return (
      db
        .prepare('SELECT * FROM cv_library WHERE user_id = ? ORDER BY created_at DESC')
        .all(userId) as any[]
    ).map((r) => ({
      id: r.id,
      name: r.name,
      fileName: r.file_name,
      tags: r.tags ? JSON.parse(r.tags) : [],
      isDefault: !!r.is_default,
      createdAt: r.created_at,
    }));
  }

  deleteCv(userId: string, cvId: string): boolean {
    const db = getDb();
    return (
      db.prepare('DELETE FROM cv_library WHERE id = ? AND user_id = ?').run(cvId, userId).changes >
      0
    );
  }

  getRemoteConfig(): Record<string, unknown> {
    const db = getDb();
    const flags = db.prepare('SELECT * FROM feature_flags').all() as any[];
    const config: Record<string, unknown> = {};
    for (const f of flags) {
      config[f.name] = { enabled: !!f.enabled, rules: f.rules ? JSON.parse(f.rules) : null };
    }
    return config;
  }
}

export const syncService = new SyncService();
