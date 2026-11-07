CREATE TABLE IF NOT EXISTS driver_telegram_owner (
    driver_id VARCHAR(64) PRIMARY KEY,
    telegram_chat_id BIGINT NOT NULL,
    telegram_user_id BIGINT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS driving_sessions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    driver_id VARCHAR(64) NULL,
    label VARCHAR(128) NULL,
    started_at DATETIME NOT NULL,
    ended_at DATETIME NULL,
    INDEX idx_driving_driver (driver_id),
    INDEX idx_driving_started (started_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS driving_session_alerts (
    session_id BIGINT NOT NULL,
    alert_type VARCHAR(32) NOT NULL,
    count INT NOT NULL DEFAULT 0,
    PRIMARY KEY (session_id, alert_type),
    INDEX idx_dsa_session (session_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dms_verification_challenges (
    challenge_id VARCHAR(64) PRIMARY KEY,
    secret_hash VARCHAR(64) NOT NULL UNIQUE,
    driver_id VARCHAR(64) NOT NULL,
    auth_session_hash VARCHAR(64) NOT NULL,
    purpose VARCHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL,
    requested_at DATETIME NOT NULL,
    expires_at DATETIME NOT NULL,
    decided_at DATETIME NULL,
    decided_by_type VARCHAR(24) NULL,
    decided_by_id VARCHAR(128) NULL,
    telegram_chat_id BIGINT NULL,
    telegram_user_id BIGINT NULL,
    telegram_message_id BIGINT NULL,
    INDEX idx_dvc_driver_session (driver_id, auth_session_hash),
    INDEX idx_dvc_status_expiry (status, expires_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dms_authorization_grants (
    grant_hash VARCHAR(64) PRIMARY KEY,
    challenge_id VARCHAR(64) NOT NULL UNIQUE,
    driver_id VARCHAR(64) NOT NULL,
    auth_session_hash VARCHAR(64) NOT NULL,
    purpose VARCHAR(64) NOT NULL,
    created_at DATETIME NOT NULL,
    expires_at DATETIME NOT NULL,
    consumed_at DATETIME NULL,
    revoked_at DATETIME NULL,
    approved_by_type VARCHAR(24) NOT NULL,
    approved_by_id VARCHAR(128) NOT NULL,
    INDEX idx_dag_driver_session (driver_id, auth_session_hash),
    INDEX idx_dag_expiry (expires_at),
    CONSTRAINT fk_dag_challenge
        FOREIGN KEY (challenge_id) REFERENCES dms_verification_challenges(challenge_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dms_security_audit (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_type VARCHAR(64) NOT NULL,
    challenge_id VARCHAR(64) NULL,
    driver_id VARCHAR(64) NULL,
    auth_session_hash VARCHAR(64) NULL,
    actor_type VARCHAR(24) NOT NULL,
    actor_id VARCHAR(128) NULL,
    outcome VARCHAR(16) NOT NULL,
    reason_code VARCHAR(64) NULL,
    created_at DATETIME NOT NULL,
    INDEX idx_dsa_driver_time (driver_id, created_at),
    INDEX idx_dsa_challenge (challenge_id)
) ENGINE=InnoDB;
