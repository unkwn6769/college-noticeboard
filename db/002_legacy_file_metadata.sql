
-- Legacy archive provenance for imported IIS noticeboard files.
--
-- This is domain metadata, not a migration queue/table.
-- Physical storage remains governed by the existing StorageEngine.

ALTER TABLE files
    ADD COLUMN IF NOT EXISTS origin_type TEXT NOT NULL DEFAULT 'USER_UPLOAD';

ALTER TABLE files
    ADD COLUMN IF NOT EXISTS legacy_item_id TEXT;

ALTER TABLE files
    ADD COLUMN IF NOT EXISTS legacy_department TEXT;

ALTER TABLE files
    ADD COLUMN IF NOT EXISTS legacy_relative_path TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'files_origin_type_check'
    ) THEN
        ALTER TABLE files
            ADD CONSTRAINT files_origin_type_check
            CHECK (origin_type IN ('USER_UPLOAD', 'LEGACY_IMPORT'));
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS files_legacy_item_id_uq
    ON files(legacy_item_id)
    WHERE legacy_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS files_legacy_department_path_idx
    ON files(legacy_department, legacy_relative_path);
