-- R11: Recycle bin soft-deletion for notices.
-- Files already use QUARANTINED state as their soft-deletion mechanism.
-- Notices get a deleted_at timestamp; deleted notices are hidden from admin listings and the public.

ALTER TABLE notices
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS notices_deleted_idx
    ON notices(deleted_at)
    WHERE deleted_at IS NOT NULL;

-- Recycle-bin audit metadata for bulk operations
-- (individual events use existing audit_events infrastructure)
