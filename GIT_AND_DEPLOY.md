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

## Проверка на сервере

Как убедиться, что бэкенд и сайт на сервере работают.

### 1. Подключиться по SSH

```bash
ssh root@ВАШ_IP_СЕРВЕРА
# или: ssh user@ваш-сервер.ru
```

Подставьте свой IP или hostname (например `80.87.201.25` или `tirskix.space`).

### 2. Перейти в папку проекта и проверить контейнеры

```bash
cd ~/learning-portal
# или: cd /root/learning-portal
docker compose ps
```

Ожидайте: контейнеры `backend`, `web`, `db` в статусе **Up**. Если какой-то **Exit** или **Restarting** — смотрите логи (шаг 4).

### 3. Проверить, что бэкенд отвечает (с самого сервера)

```bash
curl -s http://127.0.0.1:8000/api/health
```

Ожидаемый ответ: `{"status":"ok"}`.

- Пустой вывод или ошибка «Connection refused» — бэкенд не слушает порт 8000. Смотрите логи: `docker compose logs backend --tail 80`.

### 4. Логи бэкенда (если что-то не работает)

```bash
cd ~/learning-portal
docker compose logs backend --tail 100
```

Ищите строки с `ERROR`, `Traceback`, сообщения о миграциях или `SECRET_KEY`/`DATABASE_URL`.

### 5. Проверка снаружи (из браузера или с вашего ПК)

Подставьте ваш домен (например `https://tirskix.space`):

- **Health API:** откройте в браузере или выполните:
  ```bash
  curl -s https://ВАШ_ДОМЕН/api/health
  ```
  Должно вернуться: `{"status":"ok"}`.

- **Сайт:** откройте в браузере `https://ВАШ_ДОМЕН` — должна загрузиться страница входа/портал.

- **Документация API:** `https://ВАШ_ДОМЕН/docs` — страница Swagger (если не отключена в проде).

### 6. Краткая шпаргалка «всё ли живое»

На сервере одной командой:

```bash
cd ~/learning-portal && docker compose ps && echo "---" && curl -s http://127.0.0.1:8000/api/health || echo "backend не ответил"
```

Успех: список контейнеров в Up и строка `{"status":"ok"}`.

---

## Если фронт не соединяется с бэкендом (ошибка загрузки лидов и т.п.)

В проде фронт и бэкенд должны работать через **один домен**: браузер открывает `https://ваш-домен`, запросы к API идут на `https://ваш-домен/api/...`, Caddy проксирует `/api/*` на контейнер backend. Две частые причины сбоя:

### 1. CORS: бэкенд не разрешает ваш домен

Бэкенд отдаёт заголовок `Access-Control-Allow-Origin` только для адресов из переменной **CORS_ORIGINS**. Если там указан не тот домен, браузер блокирует ответы API, и фронт показывает «сервис недоступен» или «не удалось загрузить».

**На сервере** в папке проекта проверьте `.env`:

```bash
cd ~/learning-portal
grep CORS .env
```

Должно быть что-то вроде (подставьте свой домен **без слэша в конце**):

```env
CORS_ORIGINS=https://tirskix.space
```

Если открываете сайт и по `https://` и по `http://`, или с `www` и без — перечислите оба через запятую:

```env
CORS_ORIGINS=https://tirskix.space,https://www.tirskix.space,http://tirskix.space
```

После изменения `.env` перезапустите **только** бэкенд:

```bash
docker compose up -d backend
```

Проверка с вашего ПК (подставьте свой домен):

```bash
curl -I -X OPTIONS https://ВАШ_ДОМЕН/api/sales/leads -H "Origin: https://ВАШ_ДОМЕН"
```

В ответе должен быть заголовок `Access-Control-Allow-Origin: https://ВАШ_ДОМЕН` (или ваш Origin).

### 2. Фронт в проде должен ходить на тот же домен (не localhost)

При сборке образа **web** в API не должен подставляться `http://localhost:8000`, иначе в браузере запросы уйдут на ваш компьютер, а не на сервер. В Dockerfile фронта для прода явно задаётся пустой `REACT_APP_API_URL`, чтобы запросы шли на тот же хост, что и сайт.

После любых правок, влияющих на фронт или Caddy, пересоберите и поднимите контейнеры:

```bash
cd ~/learning-portal
git pull origin main
docker compose build web --no-cache
docker compose up -d
```

После деплоя откройте сайт с принудительным обновлением (Ctrl+Shift+R).

### 3. Узнать, куда уходит запрос (диагностика)

После обновления кода на сервере и пересборки **web** откройте сайт, перейдите в «Воронка». Если ошибка снова появится, в красном баннере будет строка вида **«Запрос: …»** — это полный адрес, на который ушёл запрос:

- **`Запрос: http://localhost:8000/api/sales/leads`** — фронт в проде всё ещё ходит на localhost. Нужна пересборка образа web без кэша: `docker compose build web --no-cache && docker compose up -d`.
- **`Запрос: https://ваш-домен/api/sales/leads`** — адрес верный. Смотрите **«ответ: …»**: если **401** — выйдите и зайдите снова (обновите токен); если ответа нет — снова проверьте CORS и перезапуск backend.
- В браузере: F12 → вкладка **Network** → обновите страницу → найдите запрос к `leads` и посмотрите **Request URL** и **Status** (200, 401, 404, (failed) и т.д.).

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
