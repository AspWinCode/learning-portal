# Backend API

FastAPI приложение для портала управления обучением.

## Установка

1. Создайте виртуальное окружение:
```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
```

2. Установите зависимости:
```bash
pip install -r requirements.txt
```

3. Создайте файл `.env` на основе примера:

- Windows (PowerShell):
```powershell
Copy-Item ENV_EXAMPLE.env .env
```
- Linux/macOS:
```bash
cp ENV_EXAMPLE.env .env
```

4. Настройте переменные окружения в `.env`:
- `DATABASE_URL` - URL подключения к PostgreSQL
- `SECRET_KEY` - секретный ключ для JWT (используйте надежный ключ в продакшене)

5. Создайте базу данных PostgreSQL и обновите `DATABASE_URL`

6. Примените миграции Alembic:
```bash
alembic upgrade head
```

> Если у вас уже есть база, созданная ранее через `Base.metadata.create_all()`, то сначала выполните:
> ```bash
> alembic stamp 0000_initial_schema
> alembic upgrade head
> ```

7. Запустите приложение:
```bash
uvicorn app.main:app --reload
```

API будет доступен по адресу: http://localhost:8000

Документация API: http://localhost:8000/docs

## Структура

- `app/main.py` - главный файл приложения
- `app/models.py` - модели базы данных (SQLAlchemy)
- `app/schemas.py` - схемы Pydantic для валидации
- `app/auth.py` - функции аутентификации и авторизации
- `app/routers/` - роутеры API
  - `auth.py` - аутентификация
  - `users.py` - управление пользователями
  - `students.py` - управление учениками
  - `groups.py` - управление группами
  - `programs.py` - управление программами обучения
  - `grades.py` - управление оценками
  - `characteristics.py` - управление характеристиками
  - `reports.py` - отчетность
  - `search.py` - глобальный поиск

