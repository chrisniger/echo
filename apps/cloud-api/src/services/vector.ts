import { getDb } from '../db/index.js';

export interface EmbeddingResult {
  id: string;
  sessionId: string;
  text: string;
  score: number;
}

export class VectorSearch {
  // Simple keyword-based search as a placeholder for vector embeddings
  // Replace with sqlite-vss, LanceDB, or pgvector for semantic search
  search(query: string, userId: string, limit = 20): EmbeddingResult[] {
    const db = getDb();
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];

    const conditions = terms.map(() => '(LOWER(name) LIKE ? OR LOWER(model) LIKE ?)');
    const sql = `SELECT id, name, model, created_at FROM session_metadata WHERE user_id = ? AND (${conditions.join(' OR ')}) ORDER BY created_at DESC LIMIT ?`;

    const params: any[] = [userId];
    for (const term of terms) {
      params.push(`%${term}%`, `%${term}%`);
    }
    params.push(limit);

    const rows = db.prepare(sql).all(...params) as any[];
    return rows.map((r) => ({
      id: r.id,
      sessionId: r.id,
      text: `${r.name} — ${r.model || 'unknown model'}`,
      score: 1.0,
    }));
  }

  // Store embeddings (placeholder — would call embedding API + vector DB)
  async indexSession(sessionId: string, _transcriptText: string): Promise<void> {
    // TODO: Generate embedding via AI Gateway /api/embeddings, store in vector DB
    console.log(`[VectorSearch] Indexing session ${sessionId} (placeholder)`);
  }

  getStats(): { indexedSessions: number } {
    const db = getDb();
    const count = (
      db
        .prepare("SELECT COUNT(*) as count FROM session_metadata WHERE status = 'completed'")
        .get() as any
    ).count;
    return { indexedSessions: count };
  }
}

export const vectorSearch = new VectorSearch();
