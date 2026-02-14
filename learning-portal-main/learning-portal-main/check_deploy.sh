#!/bin/bash
# Диагностика деплоя - отправьте этот скрипт администратору
# Сохраните как: check_deploy.sh
# Запустите: bash check_deploy.sh

echo "=== 1. Проверка текущей версии кода ==="
cd /root/learning-portal
git log --oneline -5
echo ""

echo "=== 2. Проверка текущей ветки ==="
git branch -v
echo ""

echo "=== 3. Проверка последнего pull ==="
git status
echo ""

echo "=== 4. Проверка Docker контейнеров ==="
docker compose ps
echo ""

echo "=== 5. Проверка логов backend ==="
docker compose logs --tail=50 backend
echo ""

echo "=== 6. Проверка логов frontend ==="
docker compose logs --tail=50 web
echo ""

echo "=== 7. Проверка .env файла backend ==="
if [ -f backend/.env ]; then
    echo "ACCESS_TOKEN_EXPIRE_MINUTES в .env:"
    grep ACCESS_TOKEN_EXPIRE_MINUTES backend/.env || echo "Переменная не найдена!"
else
    echo "Файл backend/.env не существует!"
fi
echo ""

echo "=== 8. Проверка времени пересборки образов ==="
docker images | grep learning
echo ""

echo "=== 9. Проверка портов ==="
netstat -tlnp | grep -E ':(80|8000|3000)'
echo ""

echo "=== Диагностика завершена ==="
echo "Отправьте результат для анализа"
