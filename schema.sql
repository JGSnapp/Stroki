CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS visitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text NOT NULL UNIQUE,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id uuid NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  user_agent text,
  referrer text
);

CREATE INDEX IF NOT EXISTS idx_sessions_visitor_id ON sessions(visitor_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);

CREATE TABLE IF NOT EXISTS uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  original_name text NOT NULL,
  stored_name text NOT NULL,
  mime text NOT NULL,
  size_bytes bigint NOT NULL,
  sha256 text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_uploads_session_id ON uploads(session_id);
CREATE INDEX IF NOT EXISTS idx_uploads_created_at ON uploads(created_at);
CREATE INDEX IF NOT EXISTS idx_uploads_sha256 ON uploads(sha256);

CREATE TABLE IF NOT EXISTS surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  purpose text NOT NULL,
  additions text NOT NULL,
  contact text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_surveys_session_id ON surveys(session_id);
CREATE INDEX IF NOT EXISTS idx_surveys_created_at ON surveys(created_at);

-- Stores processed result files (saved to disk alongside uploads)
CREATE TABLE IF NOT EXISTS results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  upload_id uuid REFERENCES uploads(id) ON DELETE SET NULL,
  upload_original_name text NOT NULL,
  result_name text NOT NULL,
  stored_name text NOT NULL,
  size_bytes bigint NOT NULL,
  query text NOT NULL DEFAULT '',
  rows_processed int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_results_session_id ON results(session_id);
CREATE INDEX IF NOT EXISTS idx_results_created_at ON results(created_at);
