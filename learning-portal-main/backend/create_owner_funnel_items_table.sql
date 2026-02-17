-- Создание таблицы owner_funnel_items (если миграция 0027 не применялась).
-- Выполнить в psql, подключившись к вашей БД learning_portal:
--   psql -h localhost -U ваш_пользователь -d learning_portal -f create_owner_funnel_items_table.sql

CREATE TABLE IF NOT EXISTS owner_funnel_items (
    id SERIAL PRIMARY KEY,
    funnel_type VARCHAR(64) NOT NULL,
    stage VARCHAR(64) NOT NULL,
    title VARCHAR(512),
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS ix_owner_funnel_items_funnel_type ON owner_funnel_items (funnel_type);
CREATE INDEX IF NOT EXISTS ix_owner_funnel_items_stage ON owner_funnel_items (stage);
