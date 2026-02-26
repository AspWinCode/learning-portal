# Коммит, пуш и деплой

## 1. Коммит и пуш (локально, PowerShell)

Из корня проекта:

```powershell
cd c:\Users\direc\Downloads\learning-portal-main

git status
git add .
git commit -m "Группы: начало группы (start_date), формат групповой/индивидуальный, проверки и фронт"
git push origin main
```

Кратко:
```powershell
git add .
git commit -m "Группы: start_date, lesson_format, проверки и фронт"
git push
```

---

## 2. Деплой на сервер (VPS)

После `git push` обновить сервер.

### Вариант А — одной командой с вашей машины

```powershell
ssh root@80.87.201.25 "cd ~/learning-portal; git pull origin main; docker compose run --rm backend python -m alembic upgrade head; docker compose build web --no-cache; docker compose up -d --build; docker compose ps"
```

Пароль вводится по запросу. Миграция 0048 применится при `alembic upgrade head`. Фронт пересоберётся без кэша (`web --no-cache`), чтобы подтянуть изменения на странице групп.

### Вариант Б — по шагам (зайти по SSH)

**На вашем ПК:**
```powershell
ssh root@80.87.201.25
```

**На сервере:**
```bash
cd ~/learning-portal
# или: cd /root/learning-portal

git pull origin main

# Миграции (в т.ч. 0048 — start_date, lesson_format)
docker compose run --rm backend python -m alembic upgrade head

# Пересборка фронта и всех контейнеров
docker compose build web --no-cache
docker compose up -d --build
docker compose ps
```

**Проверка:** открыть сайт и страницу групп (Ctrl+Shift+R для сброса кэша).

---

## 3. Если путь к проекту на сервере другой

Подставьте свой каталог вместо `~/learning-portal`, например `/root/learning-portal` или как у вас указано в `DEPLOY_*.md`.
