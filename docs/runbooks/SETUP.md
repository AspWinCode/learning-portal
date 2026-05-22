# Инструкция по установке и запуску проекта

## Требования

- Python 3.8+
- Node.js 16+
- PostgreSQL 12+

## Установка Backend

1. Перейдите в директорию backend:
```bash
cd backend
```

2. Создайте виртуальное окружение:
```bash
python -m venv venv
```

3. Активируйте виртуальное окружение:
- Windows: `venv\Scripts\activate`
- Linux/Mac: `source venv/bin/activate`

4. Установите зависимости:
```bash
pip install -r requirements.txt
```

5. Создайте файл `.env` в директории `backend/`:
```
DATABASE_URL=postgresql://user:password@localhost:5432/learning_portal
SECRET_KEY=your-secret-key-here-change-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

6. Создайте базу данных PostgreSQL:
```sql
CREATE DATABASE learning_portal;
```

7. Запустите сервер:
```bash
uvicorn app.main:app --reload
```

Backend будет доступен по адресу: http://localhost:8000
Документация API: http://localhost:8000/docs

## Установка Frontend

1. Перейдите в директорию frontend:
```bash
cd frontend
```

2. Установите зависимости:
```bash
npm install
```

3. (Опционально) Создайте файл `.env` в директории `frontend/`:
```
REACT_APP_API_URL=http://localhost:8000
```

4. Запустите приложение:
```bash
npm start
```

Frontend будет доступен по адресу: http://localhost:3000

## Первый запуск

1. Запустите backend сервер
2. Запустите frontend приложение
3. Откройте http://localhost:3000 в браузере
4. Войдите в систему (создайте пользователя через API или напрямую в БД)

## Создание первого администратора

Вы можете создать первого администратора через Python консоль:

```python
from app.database import SessionLocal
from app.models import User, UserRole
from app.auth import get_password_hash

db = SessionLocal()
admin = User(
    email="admin@example.com",
    hashed_password=get_password_hash("admin123"),
    full_name="Администратор",
    role=UserRole.ADMIN,
    is_active=True
)
db.add(admin)
db.commit()
```

## Структура проекта

```
.
├── backend/          # FastAPI приложение
│   ├── app/
│   │   ├── main.py   # Точка входа
│   │   ├── models.py # Модели БД
│   │   ├── schemas.py # Схемы валидации
│   │   └── routers/  # API роутеры
│   └── requirements.txt
├── frontend/         # React приложение
│   ├── src/
│   │   ├── pages/    # Страницы
│   │   ├── components/ # Компоненты
│   │   └── services/ # API клиенты
│   └── package.json
└── README.md
```

## Расширение функционала

Проект спроектирован с возможностью расширения:

1. **Добавление новых ролей**: Расширьте enum `UserRole` в `models.py`
2. **Новые API endpoints**: Создайте новый роутер в `app/routers/`
3. **Новые страницы**: Добавьте компоненты в `frontend/src/pages/`
4. **Уведомления**: Реализуйте email отправку в соответствующих роутерах (помечено TODO)
5. **Валидация характеристик**: Расширьте логику валидации в `characteristics.py`

