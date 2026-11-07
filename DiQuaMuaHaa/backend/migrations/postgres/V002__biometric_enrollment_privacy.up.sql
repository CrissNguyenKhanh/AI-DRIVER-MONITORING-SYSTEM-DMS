ALTER TABLE driver_identity
    ADD COLUMN updated_at TIMESTAMP NULL,
    ADD COLUMN enrollment_version INT NOT NULL DEFAULT 1,
    ADD COLUMN enrollment_status VARCHAR(16) NOT NULL DEFAULT 'active';

CREATE INDEX idx_driver_identity_status
    ON driver_identity (enrollment_status);
