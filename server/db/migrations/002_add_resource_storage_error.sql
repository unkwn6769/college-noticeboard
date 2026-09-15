ALTER TABLE resources
  ADD COLUMN IF NOT EXISTS storage_error TEXT;
