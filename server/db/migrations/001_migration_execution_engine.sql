-- Correct the parent migration state constraint introduced by the original
-- baseline schema. Reconciliation is a non-terminal parent state while child
-- items are resolving uncertain Google Drive copy outcomes.
ALTER TABLE google_drive_account_migrations
  DROP CONSTRAINT IF EXISTS google_drive_account_migrations_status_check;
ALTER TABLE google_drive_account_migration_items
  ADD COLUMN IF NOT EXISTS bytes_transferred BIGINT NOT NULL DEFAULT 0;
ALTER TABLE google_drive_account_migration_items
  ADD COLUMN IF NOT EXISTS transfer_phase TEXT;

ALTER TABLE google_drive_account_migrations
  ADD CONSTRAINT google_drive_account_migrations_status_check
  CHECK (status IN (
    'pending',
    'running',
    'waiting_for_storage',
    'reconciling',
    'reconciliation_expired',
    'completed',
    'failed',
    'cancelled'
  ));

-- Durable control-plane records for disposable GitHub Actions runners.
CREATE TABLE IF NOT EXISTS migration_execution_runs (
  id TEXT PRIMARY KEY,
  migration_id TEXT NOT NULL
    REFERENCES google_drive_account_migrations(id)
    ON DELETE CASCADE,
  runner_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'stopped')),
  worker_count INTEGER NOT NULL DEFAULT 1
    CHECK (worker_count >= 1),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  last_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_migration_execution_runs_migration
  ON migration_execution_runs(migration_id, status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_migration_execution_runs_heartbeat
  ON migration_execution_runs(status, heartbeat_at);

-- Durable, due-time oriented lookup for GitHub runner discovery.
CREATE INDEX IF NOT EXISTS idx_gd_migration_items_execution_due
  ON google_drive_account_migration_items(
    migration_id,
    status,
    next_retry_at,
    created_at,
    id
  );

CREATE INDEX IF NOT EXISTS idx_gd_migration_items_cleanup_execution_due
  ON google_drive_account_migration_items(
    migration_id,
    status,
    source_delete_status,
    cleanup_next_attempt_at,
    updated_at,
    id
  );

