-- Notice metadata for public discovery and administration.
ALTER TABLE notices
    ADD COLUMN IF NOT EXISTS department TEXT,
    ADD COLUMN IF NOT EXISTS category TEXT,
    ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS notices_public_listing_idx
    ON notices(status, is_pinned DESC, published_at DESC);

CREATE INDEX IF NOT EXISTS notices_department_listing_idx
    ON notices(department, status, published_at DESC);
