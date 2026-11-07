CREATE TABLE IF NOT EXISTS driver_telegram_owner (
    driver_id VARCHAR(64) PRIMARY KEY,
    telegram_chat_id BIGINT NOT NULL,
    telegram_user_id BIGINT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS driving_sessions (
    id BIGSERIAL PRIMARY KEY,
    driver_id VARCHAR(64) NULL,
    label VARCHAR(128) NULL,
    started_at TIMESTAMP NOT NULL,
    ended_at TIMESTAMP NULL
);
CREATE INDEX IF NOT EXISTS idx_driving_driver ON driving_sessions (driver_id);
CREATE INDEX IF NOT EXISTS idx_driving_started ON driving_sessions (started_at);

CREATE TABLE IF NOT EXISTS driving_session_alerts (
    session_id BIGINT NOT NULL,
    alert_type VARCHAR(32) NOT NULL,
    count INT NOT NULL DEFAULT 0,
    PRIMARY KEY (session_id, alert_type)
);
CREATE INDEX IF NOT EXISTS idx_dsa_session ON driving_session_alerts (session_id);

CREATE TABLE IF NOT EXISTS dms_verification_challenges (
    challenge_id VARCHAR(64) PRIMARY KEY,
    secret_hash VARCHAR(64) NOT NULL UNIQUE,
    driver_id VARCHAR(64) NOT NULL,
    auth_session_hash VARCHAR(64) NOT NULL,
    purpose VARCHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL,
    requested_at TIMESTAMP NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    decided_at TIMESTAMP NULL,
    decided_by_type VARCHAR(24) NULL,
    decided_by_id VARCHAR(128) NULL,
    telegram_chat_id BIGINT NULL,
    telegram_user_id BIGINT NULL,
    telegram_message_id BIGINT NULL
);
CREATE INDEX IF NOT EXISTS idx_dvc_driver_session
    ON dms_verification_challenges (driver_id, auth_session_hash);
CREATE INDEX IF NOT EXISTS idx_dvc_status_expiry
    ON dms_verification_challenges (status, expires_at);

CREATE TABLE IF NOT EXISTS dms_authorization_grants (
    grant_hash VARCHAR(64) PRIMARY KEY,
    challenge_id VARCHAR(64) NOT NULL UNIQUE
        REFERENCES dms_verification_challenges(challenge_id),
    driver_id VARCHAR(64) NOT NULL,
    auth_session_hash VARCHAR(64) NOT NULL,
    purpose VARCHAR(64) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    consumed_at TIMESTAMP NULL,
    revoked_at TIMESTAMP NULL,
    approved_by_type VARCHAR(24) NOT NULL,
    approved_by_id VARCHAR(128) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dag_driver_session
    ON dms_authorization_grants (driver_id, auth_session_hash);
CREATE INDEX IF NOT EXISTS idx_dag_expiry ON dms_authorization_grants (expires_at);

CREATE TABLE IF NOT EXISTS dms_security_audit (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(64) NOT NULL,
    challenge_id VARCHAR(64) NULL,
    driver_id VARCHAR(64) NULL,
    auth_session_hash VARCHAR(64) NULL,
    actor_type VARCHAR(24) NOT NULL,
    actor_id VARCHAR(128) NULL,
    outcome VARCHAR(16) NOT NULL,
    reason_code VARCHAR(64) NULL,
    created_at TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dsa_driver_time
    ON dms_security_audit (driver_id, created_at);
CREATE INDEX IF NOT EXISTS idx_dsa_challenge ON dms_security_audit (challenge_id);
