export const schema = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  email_verified_at TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  mfa_secret TEXT,
  mfa_enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  device_id TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  last_ip TEXT,
  last_used_at TEXT
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  status TEXT NOT NULL,
  current_period_start TEXT,
  current_period_end TEXT,
  features TEXT,
  usage_quota TEXT,
  usage_current TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS password_resets (
  email TEXT NOT NULL,
  token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscription_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  description TEXT,
  price_monthly INTEGER,
  price_yearly INTEGER,
  features TEXT,
  session_limit INTEGER,
  token_limit INTEGER,
  storage_limit INTEGER,
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS licenses (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  key TEXT UNIQUE,
  plan_id TEXT REFERENCES subscription_plans(id),
  status TEXT DEFAULT 'active',
  seats INTEGER DEFAULT 1,
  seats_used INTEGER DEFAULT 0,
  expires_at TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS license_activations (
  id TEXT PRIMARY KEY,
  license_id TEXT REFERENCES licenses(id) ON DELETE CASCADE,
  device_id TEXT,
  device_name TEXT,
  activated_at TEXT,
  deactivated_at TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  type TEXT,
  title TEXT,
  body TEXT,
  data TEXT,
  read_at TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  email_notifications INTEGER DEFAULT 1,
  push_notifications INTEGER DEFAULT 1,
  types TEXT DEFAULT '[]',
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT,
  properties TEXT,
  session_id TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS feature_flags (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE,
  enabled INTEGER DEFAULT 0,
  rules TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS pairing_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  token TEXT NOT NULL,
  device_name TEXT NOT NULL,
  platform TEXT DEFAULT 'unknown',
  device_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS push_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL,
  device_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS session_metadata (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  model TEXT,
  duration INTEGER,
  started_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS cv_library (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT,
  file_size INTEGER DEFAULT 0,
  mime_type TEXT,
  version INTEGER DEFAULT 1,
  tags TEXT,
  is_default INTEGER DEFAULT 0,
  parsed_data TEXT,
  raw_text TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS email_logs (
  id TEXT PRIMARY KEY,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  ai_model TEXT NOT NULL,
  session_type TEXT DEFAULT 'General',
  response_style TEXT DEFAULT 'concise',
  audio_source TEXT DEFAULT 'microphone',
  language TEXT DEFAULT 'en',
  record_session INTEGER DEFAULT 1,
  enable_transcript INTEGER DEFAULT 1,
  transcription_interval_ms INTEGER DEFAULT 5000,
  context TEXT,
  cv_id TEXT,
  cv_content TEXT,
  document_ids TEXT,
  documents_content TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  duration INTEGER DEFAULT 0,
  transcript_count INTEGER DEFAULT 0,
  ai_response_count INTEGER DEFAULT 0,
  screenshot_count INTEGER DEFAULT 0,
  summary TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS transcript_segments (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  speaker TEXT,
  text TEXT NOT NULL,
  start_time REAL,
  end_time REAL,
  confidence REAL,
  is_final INTEGER DEFAULT 0,
  timestamp INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_responses (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  response TEXT NOT NULL,
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  tokens_used INTEGER DEFAULT 0,
  latency_ms INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session_embeddings (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  embedding TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;
