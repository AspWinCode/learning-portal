-- Add Telegram fields to users table (PostgreSQL)
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_link_code VARCHAR;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_link_code_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ix_users_telegram_chat_id ON users (telegram_chat_id);
CREATE INDEX IF NOT EXISTS ix_users_telegram_link_code ON users (telegram_link_code);


