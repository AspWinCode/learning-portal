-- Запуск: psql -U postgres -h localhost -f create_db_and_user.sql
-- Введите пароль пользователя postgres когда будет запрошен.

-- Создать пользователя (при повторном запуске будет ошибка "already exists" — это норма)
CREATE USER learning_user WITH PASSWORD 'localdev123';

-- Создать базу
CREATE DATABASE learning_portal OWNER learning_user;

-- Права
GRANT ALL PRIVILEGES ON DATABASE learning_portal TO learning_user;
\c learning_portal
GRANT ALL ON SCHEMA public TO learning_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO learning_user;
