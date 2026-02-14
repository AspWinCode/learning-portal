-- Устанавливает пароль learning_user в localdev123 (как в backend\.env).
-- Запуск: psql -U postgres -h localhost -f fix_learning_user_password.sql
ALTER USER learning_user WITH PASSWORD 'localdev123';
