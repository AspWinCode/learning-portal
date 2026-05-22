# Команды: коммит, пуш, деплой

## Быстрая шпаргалка (последнее обновление: лиды → ученики)

**Локально (коммит + пуш):**
```powershell
cd c:\Users\direc\Downloads\learning-portal-main
git add .
git commit -m "Лиды: пометка из анкеты, перевод в ученики, подсветка на странице учеников"
git push origin main
```

**Деплой на VPS (одной командой):**
```powershell
ssh root@80.87.201.25 "cd ~/learning-portal; git pull origin main; docker compose run --rm backend python -m alembic upgrade head; docker compose up -d --build; docker compose ps"
```

*(После пуша выполните деплой — миграция 0066 добавит поля для конвертации лида в ученика.)*

---

## 1. Коммит и пуш (локально, Windows)

Из корня проекта `learning-portal-main`:

```powershell
# Статус и список изменённых файлов
git status

# Добавить все изменения
git add .

# Либо добавить выборочно
# git add backend/app/main.py backend/app/models.py backend/alembic/versions/0047_*.py ...

# Коммит с сообщением
git commit -m "8 занятий: units_per_session, base/extra, extra_policy, авто-миграции при старте"

# Пуш в origin (ветка main)
git push origin main
```

Если репозиторий один и ветка по умолчанию `main`:

```powershell
git add .
git commit -m "8 занятий: units_per_session, base/extra, extra_policy, авто-миграции при старте"
git push
```

---

## 2. Деплой на VPS (FirstVDS)

После успешного `git push` обновить сервер.

### Вариант А — одной командой из PowerShell

```powershell
ssh root@80.87.201.25 "cd ~/learning-portal || cd /root/learning-portal; git pull origin main; docker compose run --rm backend python -m alembic upgrade head; docker compose up -d --build; docker compose ps"
```

Пароль от `root` введётся по запросу.

### Вариант Б — по шагам

**1) Подключиться к VPS:**
```powershell
ssh root@80.87.201.25
```

**2) На сервере (в SSH-сессии):**
```bash
cd ~/learning-portal
# или: cd /root/learning-portal

git pull origin main

# Миграции БД (новые таблицы/поля)
docker compose run --rm backend python -m alembic upgrade head

# Пересборка и запуск контейнеров
docker compose up -d --build
docker compose ps
```

**3) Проверка:**  
https://tirskix.space/api/health и сайт в браузере.

---

## 3. Краткая шпаргалка (копировать целиком)

**Локально:**
```powershell
cd c:\Users\direc\Downloads\learning-portal-main
git add .
git commit -m "8 занятий: units, base/extra, extra_policy, авто-миграции"
git push origin main
```

**Деплой (одной командой с вашей машины):**
```powershell
ssh root@80.87.201.25 "cd ~/learning-portal; git pull origin main; docker compose run --rm backend python -m alembic upgrade head; docker compose up -d --build; docker compose ps"
```

**Важно:** изменения в интерфейсе (например, страница «Группы» — юниты, ставка) лежат во **фронтенде**. Чтобы они появились на сайте, после `git pull` нужно пересобрать контейнер **web** (без кэша), иначе отдаётся старая сборка:
```bash
cd ~/learning-portal
git pull origin main
docker compose build web --no-cache
docker compose up -d
```
После деплоя обновите страницу в браузере с принудительной перезагрузкой (Ctrl+Shift+R или Ctrl+F5).

---

## 4. Если 502 после деплоя

На сервере выполните и пришлите вывод:

```bash
cd ~/learning-portal
docker compose ps
docker compose logs backend --tail 80
curl -s http://127.0.0.1:8000/api/health || echo "backend не ответил"
```

- **Логи backend** покажут: падение миграций, `SECRET_KEY`/`DATABASE_URL`, или другую ошибку при старте.
- Если `curl` к порту 8000 не отвечает — контейнер падает до прослушивания порта; смотрите логи.
- После правок в коде (идемпотентная миграция 0047, проверка конфига без падения) обновите код на сервере и пересоберите:  
  `git pull origin main && docker compose build backend --no-cache && docker compose up -d backend`

---

## 5. Если на сайте «Database schema is outdated» (красный баннер)

Это значит: миграция 0047 была помечена как выполненная (`stamp`), но сама не применялась — в БД нет нужных колонок и таблиц. Нужно **реально выполнить** миграцию с исправленным файлом.

**На сервере по шагам:**

```bash
cd ~/learning-portal

# 1) Подтянуть код с идемпотентной миграцией 0047
git pull origin main

# 2) Пересобрать backend (чтобы в образ попал новый 0047)
docker compose build backend --no-cache

# 3) Откатить штамп до 0046, чтобы 0047 снова выполнилась
docker compose run --rm backend python -m alembic stamp 0046_custom_lessons

# 4) Запустить миграции (теперь 0047 применится без ошибки)
docker compose run --rm backend python -m alembic upgrade head

# 5) Перезапустить backend
docker compose up -d backend
```

После этого обновите страницу — красный баннер должен исчезнуть.
