# Исправление ошибок деплоя

## Проблема 1: `Can't locate revision identified by '0020_b2b_projects_and_school_city'`

Alembic не находит файл миграции 0020, потому что **Docker собирает backend из папки `./backend`** относительно той директории, откуда запускают `docker compose`. После `git pull` все файлы (включая 0020) лежат в **`learning-portal-main/backend/`**, а не в корневой `./backend`.

**Что сделать на VPS:**

1. Зайти в каталог, где лежит **полный** backend с миграциями 0000–0024:
   ```bash
   cd ~/learning-portal/learning-portal-main
   ```
   (Если у вас проект разложен по-другому — перейдите в ту папку, где есть и `docker-compose.yml`, и `backend/alembic/versions/0020_b2b_projects_and_school_city.py`.)

2. Проверить, что 0020 на месте:
   ```bash
   ls backend/alembic/versions/0020*.py
   ```
   Должен быть файл `0020_b2b_projects_and_school_city.py`.

3. Запускать все команды **из этой же папки** (`learning-portal-main`):
   ```bash
   docker compose run --rm backend python -m alembic upgrade head
   docker compose up -d --build
   docker compose ps
   ```

Если на сервере у вас **нет** подпапки `learning-portal-main` и всё лежит в `~/learning-portal/backend/`, тогда скопируйте недостающие миграции из репозитория в этот backend:
```bash
cd ~/learning-portal
cp -n learning-portal-main/backend/alembic/versions/*.py backend/alembic/versions/
```
После этого снова из каталога, где у вас `docker-compose.yml` (например `~/learning-portal`), выполните:
```bash
docker compose run --rm backend python -m alembic upgrade head
docker compose up -d --build
```

---

## Проблема 2: `Bind for 0.0.0.0:80 failed: port is already allocated`

Порт 80 уже занят (часто старым контейнером или другим веб-сервером).

**Что сделать на VPS:**

1. Посмотреть, кто слушает 80 порт:
   ```bash
   docker ps -a
   ```
   Или:
   ```bash
   sudo ss -tlnp | grep :80
   ```

2. Остановить старый контейнер (если это он):
   ```bash
   docker stop learning-portal-web-1
   # или имя контейнера из вывода docker ps -a
   ```

3. Если порт 80 занят не Docker (например, nginx), временно остановить сервис:
   ```bash
   sudo systemctl stop nginx
   ```

4. Снова поднять контейнеры (из каталога с `docker-compose.yml` и полным backend):
   ```bash
   cd ~/learning-portal/learning-portal-main
   docker compose up -d
   docker compose ps
   ```

---

## Полная последовательность после исправлений

```bash
ssh root@80.87.201.25

# Перейти в каталог с полным backend (все миграции 0000–0024)
cd ~/learning-portal/learning-portal-main

# Убедиться, что 0020 есть
ls backend/alembic/versions/0020*.py

# Освободить порт 80 (если занят)
docker stop learning-portal-web-1 2>/dev/null || true

# Миграции и запуск
docker compose run --rm backend python -m alembic upgrade head
docker compose up -d --build
docker compose ps
```

Проверка: https://tirskix.space/api/health и сайт в браузере.
