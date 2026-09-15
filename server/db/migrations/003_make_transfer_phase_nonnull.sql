UPDATE google_drive_account_migration_items
SET transfer_phase = 'pending'
WHERE transfer_phase IS NULL;

ALTER TABLE google_drive_account_migration_items
  ALTER COLUMN transfer_phase SET DEFAULT 'pending';

ALTER TABLE google_drive_account_migration_items
  ALTER COLUMN transfer_phase SET NOT NULL;
