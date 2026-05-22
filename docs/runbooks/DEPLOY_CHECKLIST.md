## DEPLOY_CHECKLIST.md (очень подробно, “первый деплой”)

Ниже — пошаговый план деплоя на **Linux/VPS (Ubuntu 22.04/24.04)** с доменом и HTTPS.
Если у вас другой Linux — шаги почти те же.

---

### 0) Что мы деплоим (архитектура)
- **Backend**: FastAPI (uvicorn) на порту `8000` (локально, за Nginx).
- **Frontend**: React build (статические файлы) отдаёт Nginx.
- **PostgreSQL**: база данных на сервере (или отдельный managed Postgres).
- **Nginx**: reverse-proxy + HTTPS (Let’s Encrypt) + статика.
- **Telegram bot polling** (опционально): отдельный процесс/служба, если используете `telegram_bot_polling.py`.

---

### 1) Что нужно заранее
- **VPS** с публичным IP.
- **Домен** (например `example.com`).
- DNS записи:
  - `A` запись `example.com` → IP сервера
  - (опционально) `A` запись `api.example.com` → IP сервера

> В этом гайде буду использовать:
> - фронт: `https://example.com`
> - API: `https://api.example.com`

---

### 2) Подключение к серверу
На Windows проще всего через PowerShell:

```powershell
ssh root@YOUR_SERVER_IP
```

---

### 3) Базовая подготовка сервера (Ubuntu)

```bash
apt update && apt upgrade -y
apt install -y git curl ca-certificates ufw nginx
```

#### 3.1) Firewall (UFW)
Откроем SSH и HTTP/HTTPS:

```bash
ufw allow OpenSSH
ufw allow "Nginx Full"
ufw enable
ufw status
```

---

### 4) Установка PostgreSQL (если база на этом же сервере)

```bash
apt install -y postgresql postgresql-contrib
systemctl enable postgresql
systemctl start postgresql
```

#### 4.1) Создать пользователя и базу

```bash
sudo -u postgres psql
```

Внутри `psql`:

```sql
CREATE USER learning_user WITH PASSWORD 'REPLACE_ME_STRONG_PASSWORD';
CREATE DATABASE learning_portal OWNER learning_user;
\q
```

---

### 5) Установка Python окружения для backend

```bash
apt install -y python3 python3-venv python3-pip
```

Создадим отдельного пользователя:

```bash
adduser learning
usermod -aG sudo learning
```

Переключиться:

```bash
su - learning
```

---

### 6) Скачиваем проект и ставим зависимости backend

```bash
mkdir -p ~/apps
cd ~/apps
git clone YOUR_REPO_URL learning-portal
cd learning-portal/backend
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

---

### 7) Настройка переменных окружения backend

В `backend/` создайте `.env` из примера:

```bash
cp ENV_EXAMPLE.env .env
```

Откройте `.env`:

```bash
nano .env
```

Обязательно выставьте:
- **DATABASE_URL**:
  - Пример (локальный Postgres):  
    `postgresql://learning_user:REPLACE_ME_STRONG_PASSWORD@localhost:5432/learning_portal`
- **SECRET_KEY**: длинный случайный секрет (не меньше 32 символов).
- **CORS_ORIGINS**:
  - Если фронт на `https://example.com`:  
    `CORS_ORIGINS=https://example.com`
- **TELEGRAM_BOT_TOKEN** и (опционально) **TELEGRAM_BOT_USERNAME**.

---

### 8) Alembic миграции (обязательно)
В `backend/` (venv активирован):

```bash
alembic upgrade head
```

Если вы переносите старую БД (которая ранее создавалась через `create_all`), выполните **один раз**:

```bash
alembic stamp 0000_initial_schema
alembic upgrade head
```

---

### 9) Запуск backend как systemd service (рекомендуется)
Создаём unit-файл:

```bash
sudo nano /etc/systemd/system/learning-backend.service
```

Содержимое (проверьте пути!):

```ini
[Unit]
Description=Learning Portal Backend (FastAPI)
After=network.target

[Service]
User=learning
Group=learning
WorkingDirectory=/home/learning/apps/learning-portal/backend
EnvironmentFile=/home/learning/apps/learning-portal/backend/.env
ExecStart=/home/learning/apps/learning-portal/backend/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

Активируем:

```bash
sudo systemctl daemon-reload
sudo systemctl enable learning-backend
sudo systemctl start learning-backend
sudo systemctl status learning-backend --no-pager
```

Логи:

```bash
sudo journalctl -u learning-backend -f
```

---

### 10) Frontend: сборка и публикация
На сервере (всё ещё под пользователем `learning`):

Установите Node.js LTS (вариант через NodeSource):

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
node --version
npm --version
```

Собираем:

```bash
cd ~/apps/learning-portal/frontend
npm install
cp ENV_EXAMPLE.env .env
nano .env
```

В `frontend/.env` выставьте:
- `REACT_APP_API_URL=https://api.example.com`

Сборка:

```bash
npm run build
```

---

### 11) Nginx: два домена (frontend + api) и HTTPS
#### 11.1) Конфиг для API (reverse proxy)

```bash
sudo nano /etc/nginx/sites-available/learning-api
```

Пример:

```nginx
server {
  listen 80;
  server_name api.example.com;

  location / {
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

#### 11.2) Конфиг для frontend (статический build + SPA)

```bash
sudo nano /etc/nginx/sites-available/learning-web
```

Пример (путь к build проверьте):

```nginx
server {
  listen 80;
  server_name example.com;

  root /home/learning/apps/learning-portal/frontend/build;
  index index.html;

  location / {
    try_files $uri /index.html;
  }
}
```

Активируем сайты:

```bash
sudo ln -sf /etc/nginx/sites-available/learning-api /etc/nginx/sites-enabled/learning-api
sudo ln -sf /etc/nginx/sites-available/learning-web /etc/nginx/sites-enabled/learning-web
sudo nginx -t
sudo systemctl reload nginx
```

#### 11.3) HTTPS (Let’s Encrypt)
Установим certbot:

```bash
sudo apt install -y certbot python3-certbot-nginx
```

Выпустим сертификаты:

```bash
sudo certbot --nginx -d example.com -d api.example.com
```

Проверка автопродления:

```bash
sudo certbot renew --dry-run
```

---

### 12) Telegram bot polling как systemd (если вы используете polling-скрипт)
Если вы запускаете `backend/telegram_bot_polling.py`, лучше тоже как сервис:

```bash
sudo nano /etc/systemd/system/learning-telegram-bot.service
```

```ini
[Unit]
Description=Learning Portal Telegram Bot (Polling)
After=network.target

[Service]
User=learning
Group=learning
WorkingDirectory=/home/learning/apps/learning-portal/backend
EnvironmentFile=/home/learning/apps/learning-portal/backend/.env
ExecStart=/home/learning/apps/learning-portal/backend/venv/bin/python telegram_bot_polling.py
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable learning-telegram-bot
sudo systemctl start learning-telegram-bot
sudo journalctl -u learning-telegram-bot -f
```

---

### 13) Проверка “всё работает”
- API: откройте `https://api.example.com/api/health` (или `https://api.example.com/docs`).
- Web: `https://example.com`
- Проверьте логин админом.
- Проверьте, что CORS_ORIGINS совпадает с доменом фронта.

---

### 14) Обновление (deploy новой версии)
Под пользователем `learning`:

```bash
cd ~/apps/learning-portal
git pull
cd backend
source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
sudo systemctl restart learning-backend
```

Если менялся фронт:

```bash
cd ../frontend
npm install
npm run build
sudo systemctl reload nginx
```

---

### 15) Бэкапы (минимум)
Бэкап базы (пример):

```bash
sudo -u postgres pg_dump learning_portal > /home/learning/backup_learning_portal.sql
```

Лучше настроить cron + хранение бэкапов вне сервера.

---

### 16) Типичные ошибки (и быстрые решения)
- **CORS ошибка**: проверьте `CORS_ORIGINS` в `backend/.env` (должен быть ровно `https://example.com`).
- **502 Bad Gateway**: backend сервис не поднят или слушает не `127.0.0.1:8000` → `sudo systemctl status learning-backend`.
- **alembic падает**: неверный `DATABASE_URL`, нет прав на базу, база не создана.
- **Telegram не шлёт**: `TELEGRAM_BOT_TOKEN` пустой или бот не привязан (нет `telegram_chat_id`).


