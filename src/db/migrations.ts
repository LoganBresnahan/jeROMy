/**
 * Database schema definitions and migration runner.
 *
 * Uses PRAGMA user_version to track the current schema version.
 * Each migration is idempotent — safe to run multiple times.
 */

import type Database from "@signalapp/sqlcipher";

// -- Migration 001: Initial schema --------------------------------------------

const MIGRATION_001 = `
-- Immutable event log
CREATE TABLE IF NOT EXISTS events (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  data        TEXT NOT NULL,
  asset_type  TEXT,
  created_at  TEXT NOT NULL,
  blob_data   BLOB
);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_asset_type ON events(asset_type)
  WHERE asset_type IS NOT NULL;

-- Session metadata
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  parent_id   TEXT REFERENCES sessions(id),
  fork_seq    INTEGER,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  metadata    TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_sessions_parent_id ON sessions(parent_id);
CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at);

-- M:N join table for zero-copy forking
CREATE TABLE IF NOT EXISTS session_events (
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  event_id    TEXT NOT NULL REFERENCES events(id),
  seq         INTEGER NOT NULL,
  PRIMARY KEY (session_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_se_event_id ON session_events(event_id);

-- Context compression snapshots
CREATE TABLE IF NOT EXISTS snapshots (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,
  summary     TEXT NOT NULL,
  metadata    TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snapshots_session_seq ON snapshots(session_id, seq);
`;

// -- Migration runner ---------------------------------------------------------

function getSchemaVersion(db: Database): number {
  return db.pragma("user_version", { simple: true }) as number;
}

function setSchemaVersion(db: Database, version: number): void {
  db.pragma(`user_version = ${version}`);
}

/**
 * Run all pending migrations. Safe to call on every startup.
 */
export function runMigrations(db: Database): void {
  const version = getSchemaVersion(db);

  if (version < 1) {
    db.exec(MIGRATION_001);
    setSchemaVersion(db, 1);
  }

  // Future migrations:
  // if (version < 2) { db.exec(MIGRATION_002); setSchemaVersion(db, 2); }
}

/** Expose for testing. */
export { getSchemaVersion };
