## Production setup (коротко и по делу)

Для первого деплоя см. `DEPLOY_CHECKLIST.md`.

### Backend
- **Переменные окружения**: создайте `backend/.env` из `backend/ENV_EXAMPLE.env` и обязательно заполните:
  - `DATABASE_URL`
  - `SECRET_KEY` (уникальный, длинный)
  - `CORS_ORIGINS` (URL вашего фронта)
  - `TELEGRAM_BOT_TOKEN` (+ `TELEGRAM_BOT_USERNAME` если нужен deep-link)
  - `APP_ENV=production` (включает строгие проверки конфигурации при старте)

- **Миграции** (перед запуском приложения):

```bash
cd backend
alembic upgrade head
```

- **Запуск**:
  - dev: `uvicorn app.main:app --reload`
  - prod (без reload): `uvicorn app.main:app --host 0.0.0.0 --port 8000`

### Frontend
- Создайте `frontend/.env` из `frontend/ENV_EXAMPLE.env` и укажите:
  - `REACT_APP_API_URL` (URL backend, например `https://api.example.com`)

- Сборка:

```bash
cd frontend
npm install
npm run build
```

Дальше папку `frontend/build` можно отдавать любым статическим сервером (nginx, caddy, etc.).


