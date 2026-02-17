#!/bin/bash
# Быстрое исправление проблемы с паролем БД

echo "=== Проверка .env файла ==="
echo "Текущий .env в корне проекта:"
cat .env 2>/dev/null || echo "Файл .env не найден в корне!"
echo ""

echo "Текущий .env в backend:"
cat backend/.env 2>/dev/null || echo "Файл backend/.env не найден!"
echo ""

echo "=== ИНСТРУКЦИЯ ==="
echo "1. Проверьте пароль PostgreSQL в docker-compose.yml"
echo "2. Убедитесь что такой же пароль в backend/.env"
echo ""
echo "Выполните команды:"
echo ""
echo "# 1. Посмотрите пароль в docker-compose.yml:"
echo "grep POSTGRES_PASSWORD docker-compose.yml"
echo ""
echo "# 2. Обновите backend/.env (замените YOUR_PASSWORD на реальный):"
echo "nano backend/.env"
echo "# Измените строку DATABASE_URL на:"
echo "# DATABASE_URL=postgresql://learning_user:YOUR_PASSWORD@db:5432/learning_db"
echo ""
echo "# 3. Перезапустите контейнеры:"
echo "docker compose down"
echo "docker compose up -d"
