# Docker & Docker Compose Installation Guide

## для Linux сервера (Ubuntu/Debian)

### 1. Установить Docker

```bash
# Обновить пакеты
sudo apt-get update
sudo apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release

# Добавить GPG ключ Docker
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# Добавить Docker репозиторий
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Установить Docker
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Проверить версию
docker --version
docker compose version
```

### 2. Добавить пользователя в docker группу (опционально)

```bash
# Позволить запускать docker без sudo
sudo usermod -aG docker $USER
newgrp docker

# Проверить
docker ps
```

### 3. Запустить Docker демон

```bash
# Убедиться что Docker запущен
sudo systemctl start docker
sudo systemctl enable docker  # Запуск при boot

# Проверить статус
sudo systemctl status docker
```

### 4. Установить Docker Compose V2 (если нужна старая версия)

```bash
# Обычно V2 идет вместе с docker-ce выше
# Но если нужна V1:

sudo curl -L "https://github.com/docker/compose/releases/download/1.29.2/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
docker-compose --version
```

---

## для Windows (WSL2 / Docker Desktop)

### 1. Установить Docker Desktop

https://www.docker.com/products/docker-desktop

- Скачать Docker Desktop для Windows
- Выбрать WSL 2 backend при установке
- Следовать инструкциям установки

### 2. Проверить установку

```powershell
docker --version
docker compose version
```

---

## Проверка установки

После установки проверить что всё работает:

```bash
# Проверить Docker
docker run hello-world

# Должно вывести:
# Hello from Docker!
# This message shows that your installation appears to be working correctly.

# Проверить Docker Compose
docker compose --version

# Должно вывести версию, например:
# Docker Compose version v2.20.0
```

---

## Развертывание Learning Portal

После установки Docker и Docker Compose:

```bash
# Перейти в директорию проекта
cd ~/learning-portal

# Создать необходимый volume
docker volume create learning-portal_db_data

# Создать .env файл с production значениями
cp backend/.env.example .env
# Отредактировать .env с production параметрами:
# - DATABASE_URL
# - SECRET_KEY
# - CORS_ORIGINS
# - SLACK_WEBHOOK_URL (опционально)

# Запустить stack
docker compose --profile observability up -d

# Проверить что всё запущено
docker compose ps

# Проверить логи
docker compose logs -f backend
```

---

## Troubleshooting

### "docker: command not found"

```bash
# Убедиться что Docker установлен
which docker

# Если не установлен, повторить инструкции выше
```

### "Cannot connect to Docker daemon"

```bash
# Проверить что Docker запущен
sudo systemctl status docker

# Если не запущен, стартовать:
sudo systemctl start docker

# Или с sudo при запуске docker команд:
sudo docker ps
```

### Permission denied while trying to connect to Docker daemon

```bash
# Добавить пользователя в docker группу
sudo usermod -aG docker $USER

# Применить изменения (выход и вход обратно в сессию)
newgrp docker
```

### docker-compose: command not found (старая версия)

```bash
# Использовать новый синтаксис (Docker Compose V2)
docker compose --version  # Вместо docker-compose --version

# Или установить V1:
sudo curl -L "https://github.com/docker/compose/releases/download/1.29.2/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

---

## Для быстрого deployment на production сервер

```bash
#!/bin/bash
# save as: install-and-deploy.sh

set -e

echo "Installing Docker and Docker Compose..."
sudo apt-get update
sudo apt-get install -y docker.io docker-compose

echo "Adding current user to docker group..."
sudo usermod -aG docker $USER

echo "Starting Docker daemon..."
sudo systemctl start docker
sudo systemctl enable docker

echo "Creating database volume..."
docker volume create learning-portal_db_data

echo "Pulling latest code..."
cd ~/learning-portal
git pull origin main

echo "Creating .env file..."
if [ ! -f .env ]; then
  cp backend/.env.example .env
  echo "⚠️  Edit .env file with production values!"
fi

echo "Starting Learning Portal..."
docker compose --profile observability up -d

echo "Waiting for services to start..."
sleep 10

echo "Checking status..."
docker compose ps

echo ""
echo "✅ Learning Portal deployed!"
echo ""
echo "Services available at:"
echo "  API:          http://localhost:8000"
echo "  Prometheus:   http://localhost:9090"
echo "  Grafana:      http://localhost:3001"
echo "  Alertmanager: http://localhost:9093"
```

Использование:
```bash
chmod +x install-and-deploy.sh
./install-and-deploy.sh
```

---

**Status:** Ready to deploy!
