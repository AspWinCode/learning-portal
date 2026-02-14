# Полный локальный запуск (без Docker)

## Шаг 1. Создать БД и пользователя PostgreSQL (один раз)

В **PowerShell** выполни из папки проекта (где лежит `backend`):

```powershell
cd "c:\Users\direc\Downloads\learning-portal-main\learning-portal-main\backend"
.\run_create_db.ps1
```

Введи **пароль пользователя postgres**, когда будет запрос.  
Если всё прошло без критичных ошибок — переходи к шагу 2.

---

## Шаг 2. Миграции и первый админ

В той же папке `backend`:

```powershell
.\venv\Scripts\Activate.ps1
alembic upgrade head
python create_admin_fixed.py
```

Должны появиться сообщения об успешном применении миграций и «Администратор создан!».

---

## Шаг 3. Запуск Backend

В папке `backend` (с активированным venv):

```powershell
uvicorn app.main:app --reload
```

Оставь окно открытым. API: http://localhost:8000, документация: http://localhost:8000/docs

---

## Шаг 4. Запуск Frontend

В **новом** окне PowerShell:

```powershell
cd "c:\Users\direc\Downloads\learning-portal-main\learning-portal-main\frontend"
npm start
```

Откроется браузер на http://localhost:3000.

---

## Вход в систему

- **Email:** `admin@example.com`  
- **Пароль:** `admin123`  

После первого входа смени пароль.

---

## Уже настроено в проекте

- В `backend\.env` заданы: `DATABASE_URL` (пароль БД `localdev123`), `SECRET_KEY`, CORS.
- Пароль БД для приложения: `localdev123` (совпадает с тем, что в `create_db_and_user.sql`).

Если менял пароль в SQL — поменяй его и в `backend\.env` в `DATABASE_URL`.
