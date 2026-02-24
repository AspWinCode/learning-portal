# Команды: коммит, пуш, деплой

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
