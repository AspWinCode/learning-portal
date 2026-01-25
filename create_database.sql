-- Создание базы данных для портала обучения
-- Запустите этот файл: psql -U postgres -f create_database.sql

-- Создание базы данных
CREATE DATABASE learning_portal OWNER learning_user;

-- Подключение к новой базе данных
\c learning_portal

-- Предоставление всех прав пользователю
GRANT ALL PRIVILEGES ON DATABASE learning_portal TO learning_user;

-- Выход
\q

