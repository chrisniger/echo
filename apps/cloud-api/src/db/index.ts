import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { config } from '../config.js';
import { schema } from './schema.js';

// Resolve the project root from this file's location (src/db/index.ts → up two levels).
// This avoids relying on process.cwd(), which changes when the server is started from
// a different working directory and could create duplicate databases.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = path.isAbsolute(config.DB_PATH)
    ? config.DB_PATH
    : path.resolve(PROJECT_ROOT, config.DB_PATH);
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);
  console.log(`[DB] Database opened: ${dbPath}`);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(schema);
  ensureCvLibraryColumns(db);
  ensureSessionsColumns(db);

  return db;
}

function ensureSessionsColumns(database: Database.Database): void {
  const columns = new Set(
    database
      .prepare('PRAGMA table_info(sessions)')
      .all()
      .map((row: any) => row.name as string),
  );

  const addColumn = (definition: string, name: string) => {
    if (!columns.has(name)) {
      database.prepare(`ALTER TABLE sessions ADD COLUMN ${definition}`).run();
      columns.add(name);
    }
  };

  addColumn("session_type TEXT DEFAULT 'General'", 'session_type');
  addColumn('cv_id TEXT', 'cv_id');
  addColumn('cv_content TEXT', 'cv_content');
  addColumn('document_ids TEXT', 'document_ids');
  addColumn('documents_content TEXT', 'documents_content');
  addColumn('transcription_interval_ms INTEGER DEFAULT 5000', 'transcription_interval_ms');
}

function ensureCvLibraryColumns(database: Database.Database): void {
  const columns = new Set(
    database
      .prepare('PRAGMA table_info(cv_library)')
      .all()
      .map((row: any) => row.name as string),
  );

  const addColumn = (definition: string, name: string) => {
    if (!columns.has(name)) {
      database.prepare(`ALTER TABLE cv_library ADD COLUMN ${definition}`).run();
      columns.add(name);
    }
  };

  addColumn('file_path TEXT', 'file_path');
  addColumn('file_size INTEGER DEFAULT 0', 'file_size');
  addColumn('mime_type TEXT', 'mime_type');
  addColumn('version INTEGER DEFAULT 1', 'version');
  addColumn('tags TEXT', 'tags');
  addColumn('is_default INTEGER DEFAULT 0', 'is_default');
  addColumn('parsed_data TEXT', 'parsed_data');
  addColumn('raw_text TEXT', 'raw_text');
}

/**
 * Emit a single health line on startup so operators can verify WHERE the DB
 * actually lives and that row counts look reasonable after a restart.
 *
 * Background: the previous getDb() anchored the DB path to process.cwd(),
 * which silently shifted the resolved location when the user ran `pnpm dev`
 * from a different directory — e.g. a session created from `<repo-root>/data/`
 * became invisible from `apps/cloud-api/data/`. The PROJECT_ROOT anchor in
 * getDb() fixes that, but operators still need a way to see the absolute path
 * so they can confirm "yes, the same DB file is being read across restarts"
 * or "no, this is a fresh DB".
 *
 * Surface: called once from apps/cloud-api/src/index.ts right after getDb().
 */
export function logDbHealth(): void {
  if (!db) return;
  const liveDb = db;
  // better-sqlite3 exposes the path passed to the constructor as `db.name`.
  // path.resolve() normalizes separators and any '..' segments so the log
  // line is canonical across Windows and POSIX shells.
  const dbPath = liveDb.name;
  console.log(`[DB Health] path=${path.resolve(dbPath)}`);
  try {
    const journal = liveDb.pragma('journal_mode', { simple: true }) as string;
    const fk = liveDb.pragma('foreign_keys', { simple: true }) as number;
    console.log(`[DB Health] journal_mode=${journal} foreign_keys=${fk}`);
  } catch (err) {
    console.warn('[DB Health] Unable to read PRAGMA state', err);
  }
  try {
    const rowCount = (table: string): number => {
      const row = liveDb.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as
        { n: number } | undefined;
      return row?.n ?? 0;
    };
    console.log(
      `[DB Health] rows: users=${rowCount('users')} ` +
        `sessions=${rowCount('sessions')} ` +
        `cv_library=${rowCount('cv_library')} ` +
        `transcripts=${rowCount('transcript_segments')} ` +
        `ai_responses=${rowCount('ai_responses')}`,
    );
  } catch (err) {
    console.warn('[DB Health] Unable to read table row counts', err);
  }
}
