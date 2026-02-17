# Диагностика: таблица group_schedules не найдена

## В этом проекте

- **Модель:** `GroupSchedule` в `app/models.py`, таблица `group_schedules` (схема `public`).
- **Миграция:** таблицу создаёт **0025_group_schedule_and_lesson_attendance** (также создаётся `lesson_attendance`).
- **Папка приложения:** миграции 0025/0026 и модель есть только в **learning-portal-main\learning-portal-main\backend**. Запускайте uvicorn и alembic именно из этой папки.

## Пошаговая проверка

### 1. Откуда запускается приложение

Приложение должно запускаться из каталога, где есть миграция 0025:

```powershell
cd c:\Users\direc\Downloads\learning-portal-main\learning-portal-main\backend
```

В корневом `learning-portal-main\backend` миграций 0025/0026 и модели `GroupSchedule` нет — оттуда таблица не создастся.

### 2. Проверить, что видит Alembic

В этой же папке (с активированным venv и правильным `.env`):

```powershell
.\.venv\Scripts\Activate.ps1
alembic current
alembic history
```

Если `alembic current` не показывает ревизию **0025_group_schedule_and_lesson_attendance** (или 0026), миграции не применены.

### 3. Применить миграции

```powershell
alembic upgrade head
```

Нужен рабочий `DATABASE_URL` в `.env` (тот же, что и для запуска приложения).

### 4. Проверить таблицы в БД

Подключитесь к той же базе, что в `DATABASE_URL`:

```powershell
# Подставьте свою строку из .env или используйте переменную:
# $env:PGPASSWORD = "ваш_пароль"
psql -h localhost -p 5432 -U ваш_пользователь -d learning_portal -c "\dt"
```

Или явно проверить наличие таблицы:

```sql
SELECT schemaname, tablename
FROM pg_tables
WHERE tablename = 'group_schedules';
```

Если таблицы нет — причина в неприменённых миграциях или в том, что приложение подключается к другой базе.

### 5. Проверить DATABASE_URL

В коде приложения используется переменная окружения `DATABASE_URL` (см. `app/database.py`). Убедитесь, что:

- в папке `learning-portal-main\learning-portal-main\backend` есть файл `.env` с `DATABASE_URL=...`;
- при запуске uvicorn и при вызове `alembic upgrade head` используется одна и та же строка подключения (одна и та же база).

Имя таблицы в коде: **group_schedules** (множественное число), схема не задана — значит `public`.

## Краткий чек-лист

| Проверка | Команда / действие |
|----------|--------------------|
| Текущая ревизия | `alembic current` |
| Список миграций | `alembic history` |
| Применить всё | `alembic upgrade head` |
| Список таблиц в БД | `psql ... -c "\dt"` |
| Таблица в другой схеме? | `SELECT schemaname, tablename FROM pg_tables WHERE tablename = 'group_schedules';` |
