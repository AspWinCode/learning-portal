# Локальный запуск

## 1. PostgreSQL

Должны быть созданы БД и пользователь. В psql (под суперпользователем):

```sql
CREATE USER learning_user WITH PASSWORD 'change_me_strong_password';
CREATE DATABASE learning_portal OWNER learning_user;
GRANT ALL PRIVILEGES ON DATABASE learning_portal TO learning_user;
```

Если у тебя другой пароль или пользователь — отредактируй `backend/.env` (переменная `DATABASE_URL`).

## 2. Backend

```powershell
cd backend
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

API: http://localhost:8000, документация: http://localhost:8000/docs

## 3. Frontend (в новом терминале)

```powershell
cd frontend
npm install
npm start
```

Приложение: http://localhost:3000

## Первый пользователь

После запуска backend создай админа (в папке backend, с активированным venv):

```powershell
python -c "
from app.database import SessionLocal
from app.models import User, UserRole
from app.auth import get_password_hash
db = SessionLocal()
db.add(User(email='admin@example.com', hashed_password=get_password_hash('admin123'), full_name='Admin', role=UserRole.ADMIN, is_active=True))
db.commit()
print('OK: admin@example.com / admin123')
db.close()
"
```
