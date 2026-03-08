# Команды: коммит, пуш и деплой

## Git: коммит и пуш

### Добавить все изменения и сделать коммит

```bash
git add .
git commit -m "Ваше сообщение коммита"
```

Или добавить только конкретные файлы:

```bash
git add path/to/file1 path/to/file2
git commit -m "Описание изменений"
```

### Отправить изменения на удалённый репозиторий

```bash
git push origin main
```

Если ветка по умолчанию другая (например `master`):

```bash
git push origin master
```

### Всё в одну цепочку (добавить → коммит → пуш)

```bash
git add .
git commit -m "Описание изменений"
git push origin main
```

---

## Деплой

В проекте деплой через **Docker Compose**. Варианты ниже.

### 1. На сервере (Linux) после push

На VPS/сервере в папке клона репозитория:

```bash
cd /path/to/learning-portal   # или cd ~/learning-portal
git pull origin main
docker compose up -d --build
```

При необходимости отдельно прогнать миграции:

```bash
docker compose exec backend alembic upgrade head
```

### 2. Через скрипт на сервере (Linux)

Если на сервере лежит `deploy.sh`:

```bash
cd /path/to/learning-portal
chmod +x deploy.sh
./deploy.sh
```

Скрипт сам делает: `git fetch/pull` с `main`, затем `docker compose up -d --build` и миграции.

### 3. Windows (PowerShell)

В корне проекта, после настройки `.env` (скопировать из `.env.example` и заполнить):

```powershell
.\deploy.ps1
```

Это запустит `docker compose up -d --build`.

### 4. Первый запуск на сервере (клонирование + запуск)

```bash
git clone YOUR_REPO_URL learning-portal
cd learning-portal
cp .env.example .env
# Отредактировать .env: POSTGRES_PASSWORD, SECRET_KEY, CORS_ORIGINS, DOMAIN
docker compose up -d --build
```

---

## Полезные команды Git

| Действие | Команда |
|----------|---------|
| Статус | `git status` |
| Текущая ветка | `git branch` |
| История коммитов | `git log --oneline -10` |
| Отменить последний коммит (сохранив изменения) | `git reset --soft HEAD~1` |
| Подтянуть изменения с remote | `git pull origin main` |

Подробнее про деплой: [DEPLOY_DOCKER.md](DEPLOY_DOCKER.md), [QUICK_START.md](QUICK_START.md).
