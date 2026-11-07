DROP INDEX idx_driver_identity_status;
ALTER TABLE driver_identity
    DROP COLUMN enrollment_status,
    DROP COLUMN enrollment_version,
    DROP COLUMN updated_at;
