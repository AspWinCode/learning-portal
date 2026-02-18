# Локальный запуск (тест и правки)

## Быстрый старт (два окна)

**Двойной клик по `run_local.bat`** — откроются два окна: backend (порт 8000) и frontend (порт 3000).

Или в PowerShell из папки проекта: `.\run_local.ps1`

Если пишет, что порт занят — закройте все окна/терминалы, где уже запускали uvicorn или `npm start`, и запустите снова.

---

## 1. PostgreSQL

Должен быть установлен и запущен (служба PostgreSQL на Windows).

### Создать пользователя и базу (один раз)

В **PowerShell** (или cmd), от имени пользователя с доступом к PostgreSQL:

```powershell
cd c:\Users\direc\Downloads\learning-portal-main\backend
psql -U postgres -f create_user_and_db.sql
```

Если `psql` не в PATH — открой **pgAdmin**, подключись к серверу как `postgres`, открой Query Tool и выполни вручную:

```sql
CREATE USER learning_user WITH PASSWORD 'change_me_strong_password';
CREATE DATABASE learning_portal OWNER learning_user ENCODING 'UTF8';
```

Затем подключись к базе `learning_portal` и выполни:

```sql
GRANT ALL PRIVILEGES ON DATABASE learning_portal TO learning_user;
GRANT ALL ON SCHEMA public TO learning_user;
```

Если у тебя уже есть свой пароль для `postgres` — можно не создавать `learning_user`, а в `backend\.env` указать:

```env
DATABASE_URL=postgresql://postgres:ТВОЙ_ПАРОЛЬ@localhost:5432/learning_portal
```

и создавать базу `learning_portal` от имени `postgres`.

---

## 2. Миграции и таблицы задач

В папке backend (с активированным venv):

```powershell
cd c:\Users\direc\Downloads\learning-portal-main\backend
.\venv\Scripts\Activate.ps1
alembic upgrade head
```

Если Alembic подключается к БД без ошибок, появятся все таблицы, включая `task_templates` и `tasks`.

Если миграции не применяются (ошибка доступа к БД), но база уже есть и в ней есть `users` и `students`, можно только добавить таблицы задач — выполни в `learning_portal` скрипт **`backend\create_task_tables.sql`** (через pgAdmin или `psql -U learning_user -d learning_portal -f create_task_tables.sql`).

---

## 3. Backend

```powershell
cd c:\Users\direc\Downloads\learning-portal-main\backend
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- API: http://127.0.0.1:8000  
- Документация: http://127.0.0.1:8000/docs  

---

## 4. Frontend (второй терминал)

```powershell
cd c:\Users\direc\Downloads\learning-portal-main\frontend
npm start
```

Откроется http://localhost:3000  

Если появляется ошибка про `debug` и Node 24 — поставь Node 18 или 20 LTS, либо в `frontend\package.json` уже добавлен `"overrides":{"debug":"4.3.4"}`; тогда выполни `npm install` и снова `npm start`.

---

## 5. Первый пользователь (опционально)

После первого запуска backend создай админа (в папке backend, venv активирован):

```powershell
python -c "
from app.database import SessionLocal
from app.models import User, UserRole
from app.auth import get_password_hash
db = SessionLocal()
u = User(email='admin@example.com', hashed_password=get_password_hash('admin123'), full_name='Admin', role=UserRole.ADMIN, is_active=True)
db.add(u)
db.commit()
print('OK: admin@example.com / admin123')
db.close()
"
```

Дальше можно тестировать и чинить всё локально.
