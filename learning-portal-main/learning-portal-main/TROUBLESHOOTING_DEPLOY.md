# Troubleshooting: Обновления не применились

## Что проверить на сервере

### Шаг 1: Проверка версии кода

```bash
cd /root/learning-portal
git log --oneline -3
```

**Ожидаемый результат:** должны быть коммиты:
- `f1c4b1f` - feat: add deployment automation
- `56aa6ea` - feat: session timeout fix, grades editing...
- `6b9cd51` - предыдущий коммит

❌ **Если нет** → код не подтянулся, нужно:
```bash
git fetch origin
git reset --hard origin/main
```

---

### Шаг 2: Проверка Docker контейнеров

```bash
docker compose ps
```

**Должны быть запущены:**
- `backend` (Up)
- `web` (Up)  
- `db` (Up)

❌ **Если контейнеры не пересобрались**, проверьте дату создания:
```bash
docker images | grep learning
```

Если дата старая → пересоберите **принудительно**:
```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

---

### Шаг 3: Проверка .env файла

```bash
cat /root/learning-portal/backend/.env | grep ACCESS_TOKEN
```

**Должно быть:** `ACCESS_TOKEN_EXPIRE_MINUTES=480`

❌ **Если нет** → добавьте:
```bash
cd /root/learning-portal
echo "ACCESS_TOKEN_EXPIRE_MINUTES=480" >> backend/.env
docker compose restart backend
```

---

### Шаг 4: Проверка логов

```bash
docker compose logs backend --tail=100
```

**Ищите ошибки:**
- `ModuleNotFoundError`
- `SyntaxError`
- `ImportError`
- Проблемы с базой данных

---

### Шаг 5: Проверка frontend build

Frontend может кешироваться браузером!

**На сервере:**
```bash
docker compose logs web --tail=50
```

**В браузере:**
- Нажмите `Ctrl + Shift + R` (или `Cmd + Shift + R` на Mac) для жесткой перезагрузки
- Или откройте в режиме инкогнито

---

### Шаг 6: Проверка конкретных файлов

Проверьте, что изменения действительно на сервере:

```bash
# Проверка увеличения сеанса
cat /root/learning-portal/backend/app/auth.py | grep "ACCESS_TOKEN_EXPIRE_MINUTES = 480"

# Проверка редактирования оценок
cat /root/learning-portal/backend/app/routers/grades.py | grep "can_edit ="

# Проверка frontend архивации
cat /root/learning-portal/frontend/src/pages/SalesManagersPage.tsx | grep "handleArchiveSales"
```

❌ **Если файлы старые** → код не подтянулся, вернитесь к Шагу 1.

---

## Полный скрипт для быстрой диагностики

Попросите администратора выполнить:

```bash
cd /root/learning-portal

# 1. Принудительное обновление кода
echo "=== Обновление кода ==="
git fetch origin
git reset --hard origin/main
git log --oneline -3

# 2. Обновление .env
echo "=== Обновление .env ==="
if ! grep -q "ACCESS_TOKEN_EXPIRE_MINUTES=480" backend/.env; then
    echo "ACCESS_TOKEN_EXPIRE_MINUTES=480" >> backend/.env
fi
cat backend/.env | grep ACCESS_TOKEN

# 3. Полная пересборка контейнеров
echo "=== Пересборка контейнеров ==="
docker compose down
docker compose build --no-cache --pull
docker compose up -d

# 4. Проверка статуса
echo "=== Статус контейнеров ==="
docker compose ps

# 5. Проверка логов
echo "=== Логи backend (последние 30 строк) ==="
docker compose logs backend --tail=30

# 6. Очистка старых образов
echo "=== Очистка ==="
docker system prune -f
```

---

## Возможные проблемы

### Проблема 1: Git pull не работает (конфликты)

```bash
cd /root/learning-portal
git status
# Если есть изменения или конфликты:
git stash
git pull origin main
# или
git reset --hard origin/main
```

### Проблема 2: Docker кеширует старую версию

```bash
docker compose down -v  # ВНИМАНИЕ: удалит volumes!
docker compose build --no-cache --pull
docker compose up -d
```

### Проблема 3: Nginx кеширует frontend

Если используется Nginx перед Docker:
```bash
# Очистка кеша Nginx
nginx -s reload
# или
systemctl reload nginx
```

### Проблема 4: Браузер кеширует

В браузере:
- `Ctrl + Shift + Delete` → очистить кеш
- Или `Ctrl + Shift + R` → жесткая перезагрузка
- Или откройте в режиме инкогнито

---

## Как проверить, что обновления применились

### 1. Проверка увеличенного сеанса
1. Войдите в систему
2. Откройте DevTools (F12) → Application → Local Storage
3. Найдите токен и декодируйте на jwt.io
4. Проверьте `exp` (expiration) - должно быть +8 часов от `iat`

### 2. Проверка редактирования оценок
1. Войдите как тренер или админ
2. Откройте "Оценки"
3. В истории оценок должна появиться колонка "Действия" с кнопкой "Редактировать"

### 3. Проверка прошедших дат
1. Откройте форму "Поставить оценку"
2. Выберите дату неделю назад
3. Должно сохраниться без ошибок

### 4. Проверка архивации
1. Откройте "Менеджеры по продажам" (или "Тренеры")
2. Должна появиться колонка "Действия" с кнопкой "Архивировать"

---

## Если ничего не помогло

Отправьте результаты выполнения:

```bash
bash /root/learning-portal/check_deploy.sh > deploy_check.log 2>&1
cat deploy_check.log
```

И предоставьте лог для анализа.
