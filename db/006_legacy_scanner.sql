-- R17 scanner observations. Source bytes remain on a separately mounted,
-- read-only filesystem; file bytes remain solely in StorageEngine storage.
CREATE TABLE IF NOT EXISTS legacy_scanner_runs (
  id UUID PRIMARY KEY, requested_by UUID NOT NULL REFERENCES users(id),
  mode TEXT NOT NULL CHECK (mode IN ('DRY_RUN','IMPORT')),
  status TEXT NOT NULL CHECK (status IN ('RUNNING','SUCCEEDED','FAILED','INTERRUPTED')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ,
  heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), total_count INTEGER NOT NULL DEFAULT 0 CHECK (total_count >= 0),
  processed_count INTEGER NOT NULL DEFAULT 0 CHECK (processed_count >= 0), last_processed_path TEXT,
  discovered_count INTEGER NOT NULL DEFAULT 0 CHECK (discovered_count >= 0), new_count INTEGER NOT NULL DEFAULT 0 CHECK (new_count >= 0),
  changed_count INTEGER NOT NULL DEFAULT 0 CHECK (changed_count >= 0), missing_count INTEGER NOT NULL DEFAULT 0 CHECK (missing_count >= 0),
  unchanged_count INTEGER NOT NULL DEFAULT 0 CHECK (unchanged_count >= 0), imported_count INTEGER NOT NULL DEFAULT 0 CHECK (imported_count >= 0),
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0), skipped_count INTEGER NOT NULL DEFAULT 0 CHECK (skipped_count >= 0), error_message TEXT
);
CREATE INDEX IF NOT EXISTS legacy_scanner_runs_status_heartbeat_idx ON legacy_scanner_runs(status, heartbeat_at DESC);
CREATE TABLE IF NOT EXISTS legacy_scanner_items (
  id UUID PRIMARY KEY, scanner_identity TEXT NOT NULL UNIQUE,
  legacy_relative_path TEXT NOT NULL UNIQUE CHECK (legacy_relative_path <> '' AND legacy_relative_path !~ '(^/|\\\\|(^|/)\.\.?(/|$)|[[:cntrl:]])'),
  department TEXT, source_size_bytes BIGINT CHECK (source_size_bytes IS NULL OR source_size_bytes >= 0),
  source_mtime_ms BIGINT CHECK (source_mtime_ms IS NULL OR source_mtime_ms >= 0), source_sha256 BYTEA CHECK (source_sha256 IS NULL OR octet_length(source_sha256) = 32),
  source_verified_at TIMESTAMPTZ, file_id UUID REFERENCES files(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('OBSERVED','PENDING_IMPORT','IMPORTED','MISSING','UNCLASSIFIABLE','FAILED')),
  last_seen_at TIMESTAMPTZ, last_run_id UUID REFERENCES legacy_scanner_runs(id) ON DELETE SET NULL, error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS legacy_scanner_items_current_path_idx ON legacy_scanner_items(legacy_relative_path, file_id) WHERE status='IMPORTED' AND file_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS legacy_scanner_items_status_updated_idx ON legacy_scanner_items(status, updated_at DESC);
CREATE OR REPLACE FUNCTION legacy_scanner_clear_noncurrent_file() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('PENDING_IMPORT','FAILED','OBSERVED','UNCLASSIFIABLE') THEN NEW.file_id := NULL; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS legacy_scanner_item_file_state_trigger ON legacy_scanner_items;
CREATE TRIGGER legacy_scanner_item_file_state_trigger BEFORE INSERT OR UPDATE ON legacy_scanner_items
FOR EACH ROW EXECUTE FUNCTION legacy_scanner_clear_noncurrent_file();
GRANT SELECT, INSERT, UPDATE ON TABLE legacy_scanner_runs, legacy_scanner_items TO college_noticeboard_app;
