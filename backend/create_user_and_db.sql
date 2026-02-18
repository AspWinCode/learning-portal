-- Запуск: psql -U postgres -f create_user_and_db.sql
-- Создаёт пользователя и базу для локальной разработки (пароль должен совпадать с backend\.env).

CREATE USER learning_user WITH PASSWORD 'change_me_strong_password';

CREATE DATABASE learning_portal
    OWNER learning_user
    ENCODING 'UTF8';

\c learning_portal

GRANT ALL PRIVILEGES ON DATABASE learning_portal TO learning_user;
GRANT ALL ON SCHEMA public TO learning_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO learning_user;
