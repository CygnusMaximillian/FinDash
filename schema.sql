-- ============================================================
-- FINANCIAL DASHBOARD - DATABASE SCHEMA
-- Tables: admins, viewers, analysts, sessions, financial_records
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ENUM TYPES
-- ============================================================
CREATE TYPE user_status AS ENUM ('active', 'inactive');
CREATE TYPE user_role   AS ENUM ('admin', 'analyst', 'viewer');
CREATE TYPE record_type AS ENUM ('revenue', 'expense', 'asset', 'liability', 'equity');

-- ============================================================
-- 1. ADMINS TABLE
-- Full CRUD on records and users
-- ============================================================
CREATE TABLE admins (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT         NOT NULL,
    full_name     VARCHAR(255) NOT NULL,
    status        user_status  NOT NULL DEFAULT 'active',
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. ANALYSTS TABLE
-- View records + access insights; no user management
-- ============================================================
CREATE TABLE analysts (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT         NOT NULL,
    full_name     VARCHAR(255) NOT NULL,
    status        user_status  NOT NULL DEFAULT 'active',
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. VIEWERS TABLE
-- Read-only dashboard access
-- ============================================================
CREATE TABLE viewers (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT         NOT NULL,
    full_name     VARCHAR(255) NOT NULL,
    status        user_status  NOT NULL DEFAULT 'active',
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 4. SESSIONS TABLE
-- Tracks active sessions; used for version-control locking
-- ============================================================
CREATE TABLE sessions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID         NOT NULL,
    role            user_role    NOT NULL,
    token           TEXT         NOT NULL UNIQUE,         -- JWT or opaque token
    ip_address      INET,
    user_agent      TEXT,
    -- Version control fields
    resource_locks  JSONB        NOT NULL DEFAULT '{}',   -- { "record:<id>": { version, locked_at } }
    last_seen_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ  NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_id    ON sessions(user_id);
CREATE INDEX idx_sessions_token      ON sessions(token);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- ============================================================
-- 5. FINANCIAL RECORDS TABLE
-- Version-controlled rows; optimistic locking via `version`
-- ============================================================
CREATE TABLE financial_records (
    id             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    title          VARCHAR(255) NOT NULL,
    record_type    record_type  NOT NULL,
    amount         NUMERIC(18, 4) NOT NULL,
    currency       CHAR(3)      NOT NULL DEFAULT 'USD',
    description    TEXT,
    recorded_at    DATE         NOT NULL DEFAULT CURRENT_DATE,

    -- Version control (optimistic locking)
    version        INTEGER      NOT NULL DEFAULT 1,
    last_updated_by UUID        NOT NULL,  -- user id who last wrote
    last_updated_role user_role NOT NULL,

    -- Soft delete
    is_deleted     BOOLEAN      NOT NULL DEFAULT FALSE,

    -- Audit trail
    created_by     UUID         NOT NULL,
    created_role   user_role    NOT NULL,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_financial_records_type       ON financial_records(record_type);
CREATE INDEX idx_financial_records_recorded_at ON financial_records(recorded_at);
CREATE INDEX idx_financial_records_is_deleted  ON financial_records(is_deleted);

-- ============================================================
-- 6. FINANCIAL RECORD AUDIT LOG
-- Immutable history of every version ever saved
-- ============================================================
CREATE TABLE financial_record_audit (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    record_id      UUID         NOT NULL REFERENCES financial_records(id) ON DELETE CASCADE,
    version        INTEGER      NOT NULL,
    snapshot       JSONB        NOT NULL,   -- full row snapshot at that version
    changed_by     UUID         NOT NULL,
    changed_role   user_role    NOT NULL,
    changed_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_record_id ON financial_record_audit(record_id);
CREATE INDEX idx_audit_version   ON financial_record_audit(record_id, version);

-- ============================================================
-- HELPER: auto-update updated_at columns
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_timestamp_admins
    BEFORE UPDATE ON admins
    FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_timestamp_analysts
    BEFORE UPDATE ON analysts
    FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_timestamp_viewers
    BEFORE UPDATE ON viewers
    FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_timestamp_financial_records
    BEFORE UPDATE ON financial_records
    FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
