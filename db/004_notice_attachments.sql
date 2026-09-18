-- Notice attachments: logical relation between notices and existing files.
-- Binary content remains in the existing StorageEngine/files table.
-- No new physical storage is introduced.

CREATE TABLE IF NOT EXISTS notice_attachments (
    id UUID PRIMARY KEY,
    notice_id UUID NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (notice_id, file_id)
);

CREATE INDEX IF NOT EXISTS notice_attachments_notice_created_idx
    ON notice_attachments(notice_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS notice_attachments_file_idx
    ON notice_attachments(file_id);

GRANT SELECT, INSERT, DELETE
ON TABLE notice_attachments
TO college_noticeboard_app;
