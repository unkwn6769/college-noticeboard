-- Indexes supporting bounded admin/archive file listing.
CREATE INDEX IF NOT EXISTS files_created_id_idx
    ON files(created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS files_origin_department_created_idx
    ON files(origin_type, legacy_department, created_at DESC, id DESC);
