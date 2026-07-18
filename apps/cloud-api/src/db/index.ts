import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from '../config.js';
import { schema } from './schema.js';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = path.resolve(process.cwd(), config.DB_PATH);
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(schema);
  ensureCvLibraryColumns(db);
  ensureSessionsColumns(db);

  return db;
}

function ensureSessionsColumns(database: Database.Database): void {
  const columns = new Set(
    database.prepare('PRAGMA table_info(sessions)').all().map((row: any) => row.name as string),
  );

  const addColumn = (definition: string, name: string) => {
    if (!columns.has(name)) {
      database.prepare(`ALTER TABLE sessions ADD COLUMN ${definition}`).run();
      columns.add(name);
    }
  };

  addColumn('session_type TEXT DEFAULT \'General\'', 'session_type');
  addColumn('cv_id TEXT', 'cv_id');
  addColumn('cv_content TEXT', 'cv_content');
  addColumn('document_ids TEXT', 'document_ids');
  addColumn('documents_content TEXT', 'documents_content');
  addColumn('transcription_interval_ms INTEGER DEFAULT 5000', 'transcription_interval_ms');
}

function ensureCvLibraryColumns(database: Database.Database): void {
  const columns = new Set(
    database.prepare('PRAGMA table_info(cv_library)').all().map((row: any) => row.name as string),
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
