# Быстрый деплой на Linux/VPS (самый простой способ): Docker Compose + Caddy

Этот способ поднимает всё одной командой:
- PostgreSQL
- Backend (FastAPI) + авто-миграции Alembic при старте
- Web (React build) + reverse proxy `/api/*` → backend + HTTPS (Let's Encrypt) через Caddy

## 0) Что понадобится
- VPS/Linux с публичным IP
- Домен (например `example.com`) и DNS A-запись на IP сервера
- Установленный Docker + Docker Compose plugin

## 1) Установка Docker (Ubuntu)

На Ubuntu проще всего:

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker $USER
newgrp docker
```

## 2) Запуск проекта

```bash
git clone YOUR_REPO_URL learning-portal
cd learning-portal
```

Создайте `.env` из примера и задайте переменные (обязательно замените на свои значения):

```bash
cp .env.example .env
# Отредактируйте .env: POSTGRES_PASSWORD, SECRET_KEY, CORS_ORIGINS, DOMAIN
```

Запуск:

```bash
docker compose up -d --build
```

На Windows (PowerShell): после настройки `.env` можно запустить `.\deploy.ps1`.

Проверка:
- Frontend: `https://example.com`
- Backend: `https://example.com/api/health` или `https://example.com/docs`

Логи:

```bash
docker compose logs -f --tail=200
```

## 3) Telegram bot (опционально)

Если нужен polling-бот (`telegram_bot_polling.py`), включите профиль `telegram` и задайте `TELEGRAM_BOT_TOKEN`:

```bash
docker compose --profile telegram up -d --build
```

## 4) Обновление (deploy новой версии)

Вариант A (ручной):

```bash
cd learning-portal
git pull
docker compose up -d --build
```

Вариант B (через скрипт, одна ветка):

```bash
cd learning-portal
./deploy.sh
```

По умолчанию скрипт деплоит `main`. При необходимости можно указать ветку явно:

```bash
./deploy.sh work
```


