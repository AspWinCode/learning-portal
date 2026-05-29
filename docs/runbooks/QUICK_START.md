# 🚀 Быстрый старт - Подробная инструкция по запуску проекта

## 📋 Содержание
1. [Требования](#требования)
2. [Установка PostgreSQL](#установка-postgresql)
3. [Настройка Backend](#настройка-backend)
4. [Настройка Frontend](#настройка-frontend)
5. [Первый запуск](#первый-запуск)
6. [Создание первого пользователя](#создание-первого-пользователя)
7. [Решение проблем](#решение-проблем)

---

## 📦 Требования

Перед началом установки убедитесь, что у вас установлены:

- **Python 3.8 или выше** - [Скачать Python](https://www.python.org/downloads/)
- **Node.js 16+ и npm** - [Скачать Node.js](https://nodejs.org/)
- **PostgreSQL 12+** - [Скачать PostgreSQL](https://www.postgresql.org/download/)

Проверьте установку:
```bash
python --version    # Должно быть 3.8+
node --version      # Должно быть 16+
npm --version       # Должно быть установлено
psql --version      # Должно быть 12+
```

---

## 🗄️ Установка PostgreSQL

### Windows:
**⚠️ Если вы видите ошибку "psql не распознано", см. подробную инструкцию: [WINDOWS_SETUP.md](WINDOWS_SETUP.md)**

1. Скачайте установщик с [официального сайта](https://www.postgresql.org/download/windows/)
2. Запустите установщик и следуйте инструкциям
3. Запомните пароль для пользователя `postgres`
4. PostgreSQL будет установлен как служба Windows
5. **После установки закройте и откройте PowerShell заново!**
6. Проверьте: `psql --version`

### Linux (Ubuntu/Debian):
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### macOS:
```bash
brew install postgresql
brew services start postgresql
```

### Создание базы данных:

1. Откройте командную строку/терминал
2. Подключитесь к PostgreSQL:
```bash
# Windows (используйте pgAdmin или командную строку)
psql -U postgres

# Linux/macOS
sudo -u postgres psql
```

3. Создайте базу данных и пользователя:
```sql
-- Создание пользователя (если нужно)
CREATE USER learning_user WITH PASSWORD 'your_password';

-- Создание базы данных
CREATE DATABASE learning_portal OWNER learning_user;

-- Предоставление прав
GRANT ALL PRIVILEGES ON DATABASE learning_portal TO learning_user;

-- Выход
\q
```

---

## ⚙️ Настройка Backend

### Шаг 1: Переход в директорию backend
```bash
cd backend
```

### Шаг 2: Создание виртуального окружения

**Windows:**
```bash
python -m venv venv
venv\Scripts\activate
```

**Linux/macOS:**
```bash
python3 -m venv venv
source venv/bin/activate
```

После активации в начале строки терминала должно появиться `(venv)`.

### Шаг 3: Установка зависимостей
```bash
pip install -r requirements.txt
```

Если возникнут проблемы, попробуйте:
```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### Шаг 4: Создание файла .env

Создайте файл `.env` в директории `backend/`.

В этом репозитории пример лежит в `backend/ENV_EXAMPLE.env` (в этом окружении нельзя хранить `.env.example`).

Скопируйте пример и отредактируйте значения:

- Windows (PowerShell):
```powershell
Copy-Item ENV_EXAMPLE.env .env
```
- Linux/macOS:
```bash
cp ENV_EXAMPLE.env .env
```

Пример содержимого:

```env
# База данных
DATABASE_URL=postgresql://learning_user:your_password@localhost:5432/learning_portal

# Безопасность
SECRET_KEY=your-super-secret-key-change-this-in-production-min-32-chars
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Email (опционально, для уведомлений)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
FROM_EMAIL=noreply@learning-portal.com
```

**Важно:**
- Замените `your_password` на пароль, который вы указали при создании пользователя PostgreSQL
- Замените `your-super-secret-key-change-this-in-production-min-32-chars` на случайную строку длиной минимум 32 символа
- Для генерации секретного ключа можно использовать:
  ```python
  import secrets
  print(secrets.token_urlsafe(32))
  ```

### Шаг 5: Проверка подключения к БД

Создайте тестовый файл `test_db.py` в директории `backend/`:

```python
from app.database import engine
from sqlalchemy import text

try:
    with engine.connect() as conn:
        result = conn.execute(text("SELECT 1"))
        print("✅ Подключение к базе данных успешно!")
except Exception as e:
    print(f"❌ Ошибка подключения: {e}")
```

Запустите:
```bash
python test_db.py
```

Если видите ✅ - всё хорошо! Можно удалить `test_db.py`.

### Шаг 6: Миграции БД (Alembic)

> Рекомендуемый способ управления схемой БД — через миграции Alembic (а не авто-создание таблиц при старте).
> Сейчас backend **не создает таблицы автоматически** — перед запуском всегда применяйте миграции.

Перейдите в директорию `backend/` и выполните:

```bash
alembic upgrade head
```

Если у вас уже есть база, созданная ранее через `Base.metadata.create_all()` (старый dev-режим), выполните **один раз**:

```bash
alembic stamp 0000_initial_schema
alembic upgrade head
```

### Шаг 7: Запуск Backend сервера

```bash
uvicorn app.main:app --reload
```

Вы должны увидеть:
```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
```

**Проверка работы:**
- Откройте браузер: http://localhost:8000
- Должно появиться: `{"message":"Learning Portal API"}`
- Документация API: http://localhost:8000/docs

**Оставьте этот терминал открытым!** Backend должен работать постоянно.

---

## 🎨 Настройка Frontend

**⚠️ Если вы видите ошибку "npm не распознано", см. подробную инструкцию: [NODEJS_SETUP.md](NODEJS_SETUP.md)**

### Шаг 1: Проверка установки Node.js

**Важно:** Убедитесь, что Node.js установлен:

```powershell
node --version
npm --version
```

Если команды не работают, установите Node.js: https://nodejs.org/ (см. [NODEJS_SETUP.md](NODEJS_SETUP.md))

### Шаг 2: Откройте новый терминал

**Важно:** Backend должен продолжать работать в другом терминале!

### Шаг 3: Переход в директорию frontend

**Windows (PowerShell):**
```powershell
cd frontend
```

**Linux/macOS:**
```bash
cd frontend
```

### Шаг 4: Установка зависимостей
```bash
npm install
```

Это может занять несколько минут. Дождитесь завершения.

### Шаг 4: (Опционально) Настройка переменных окружения

Создайте файл `.env` в директории `frontend/`:

```env
REACT_APP_API_URL=http://localhost:8000
```

Если не создадите, будет использоваться значение по умолчанию.

### Шаг 5: Запуск Frontend

```bash
npm start
```

Вы должны увидеть:
```
Compiled successfully!

You can now view learning-portal-frontend in the browser.

  Local:            http://localhost:3000
  On Your Network:  http://192.168.x.x:3000
```

Браузер автоматически откроется на http://localhost:3000

---

## 🎯 Первый запуск

### Что должно быть запущено:

1. ✅ **PostgreSQL** - база данных работает
2. ✅ **Backend** - сервер на http://localhost:8000
3. ✅ **Frontend** - приложение на http://localhost:3000

### Что вы увидите:

1. Откроется страница входа `/login`
2. Пока нет пользователей, поэтому нужно создать первого администратора

---

## 👤 Создание первого пользователя

**⚠️ Если вы видите ошибку "incorrect email or password", см. подробную инструкцию: [CREATE_FIRST_USER.md](CREATE_FIRST_USER.md)**

### Способ 1: Через Python консоль (Рекомендуется)

1. Убедитесь, что backend запущен
2. Откройте новый терминал
3. Активируйте виртуальное окружение:
   ```bash
   cd backend
   # Windows:
   venv\Scripts\activate
   # Linux/macOS:
   source venv/bin/activate
   ```

4. Запустите Python:
   ```bash
   python
   ```

5. Выполните следующий код:
   ```python
   from app.database import SessionLocal
   from app.models import User, UserRole
   from app.auth import get_password_hash

   db = SessionLocal()
   
   # Создание администратора
   admin = User(
       email="admin@example.com",
       hashed_password=get_password_hash("admin123"),
       full_name="Администратор",
       role=UserRole.ADMIN,
       is_active=True
   )
   
   db.add(admin)
   db.commit()
   print("✅ Администратор создан!")
   print(f"Email: admin@example.com")
   print(f"Password: admin123")
   
   # Создание тестового родителя
   parent = User(
       email="parent@example.com",
       hashed_password=get_password_hash("parent123"),
       full_name="Иван Иванов",
       role=UserRole.PARENT,
       is_active=True
   )
   db.add(parent)
   db.commit()
   print("✅ Родитель создан!")
   
   # Создание тестового тренера
   trainer = User(
       email="trainer@example.com",
       hashed_password=get_password_hash("trainer123"),
       full_name="Петр Петров",
       role=UserRole.TRAINER,
       is_active=True
   )
   db.add(trainer)
   db.commit()
   print("✅ Тренер создан!")
   
   db.close()
   exit()
   ```

### Способ 2: Через API (после создания первого админа)

1. Войдите как администратор
2. Используйте интерфейс или API для создания новых пользователей

### Способ 3: Через SQL (для продвинутых)

```sql
-- Подключитесь к базе данных
psql -U learning_user -d learning_portal

-- Вставьте пользователя (пароль: admin123, хеш bcrypt)
INSERT INTO users (email, hashed_password, full_name, role, is_active, created_at)
VALUES (
    'admin@example.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYqJN5qZ5K2', -- admin123
    'Администратор',
    'admin',
    true,
    NOW()
);
```

---

## 🔐 Вход в систему

1. Откройте http://localhost:3000
2. Введите данные:
   - **Email:** `admin@example.com`
   - **Password:** `admin123`
3. Нажмите "Войти"

После входа вы попадёте на дашборд!

---

## 🛠️ Решение проблем

### Проблема: "ModuleNotFoundError: No module named 'app'"

**Решение:**
- Убедитесь, что вы в директории `backend/`
- Активировано виртуальное окружение
- Запускайте: `uvicorn app.main:app --reload` (не `python app/main.py`)

### Проблема: "Could not connect to database"

**Решение:**
1. Проверьте, запущен ли PostgreSQL:
   ```bash
   # Windows
   services.msc  # Найдите PostgreSQL в списке служб
   
   # Linux
   sudo systemctl status postgresql
   
   # macOS
   brew services list
   ```

2. Проверьте правильность данных в `.env`:
   - Правильный пароль
   - Правильное имя базы данных
   - Правильный порт (по умолчанию 5432)

3. Проверьте подключение:
   ```bash
   psql -U learning_user -d learning_portal
   ```

### Проблема: "Port 8000 is already in use"

**Решение:**
- Найдите процесс, использующий порт:
  ```bash
  # Windows
  netstat -ano | findstr :8000
  taskkill /PID <номер_процесса> /F
  
  # Linux/macOS
  lsof -i :8000
  kill -9 <PID>
  ```
- Или используйте другой порт:
  ```bash
  uvicorn app.main:app --reload --port 8001
  ```

### Проблема: "Port 3000 is already in use"

**Решение:**
- React автоматически предложит использовать порт 3001
- Или убейте процесс:
  ```bash
  # Windows
  netstat -ano | findstr :3000
  taskkill /PID <номер_процесса> /F
  
  # Linux/macOS
  lsof -i :3000
  kill -9 <PID>
  ```

### Проблема: "npm install" долго выполняется или падает

**Решение:**
1. Очистите кеш:
   ```bash
   npm cache clean --force
   ```

2. Удалите `node_modules` и `package-lock.json`:
   ```bash
   # Windows PowerShell
   Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
   Remove-Item package-lock.json -ErrorAction SilentlyContinue
   
   # Linux/macOS
   rm -rf node_modules package-lock.json
   ```

3. Используйте другой реестр (если проблемы с доступом):
   ```bash
   npm config set registry https://registry.npmjs.org/
   ```

### Проблема: "ENOSPC: no space left on device"

**⚠️ Недостаточно места на диске!** См. подробную инструкцию: [FIX_DISK_SPACE.md](FIX_DISK_SPACE.md)

**Быстрое решение:**
1. Очистите диск через "Очистка диска" (`Win + R` → `cleanmgr`)
2. Очистите npm кеш: `npm cache clean --force`
3. Освободите минимум 2 GB места
4. Попробуйте установку снова

### Проблема: "CORS error" в браузере

**Решение:**
- Убедитесь, что backend запущен на порту 8000
- Проверьте настройки CORS в `backend/app/main.py`
- Убедитесь, что frontend обращается к правильному URL

### Проблема: "401 Unauthorized" при входе

**Решение:**
1. Проверьте, что пользователь создан в базе данных
2. Проверьте правильность email и пароля
3. Убедитесь, что пользователь активен (`is_active = true`)

### Проблема: Таблицы не создаются

**Решение:**
1. Убедитесь, что в `backend/app/main.py` есть строка:
   ```python
   Base.metadata.create_all(bind=engine)
   ```

2. Перезапустите backend сервер

3. Или создайте таблицы вручную через Alembic (если настроен):
   ```bash
   alembic upgrade head
   ```

---

## 📝 Следующие шаги

После успешного запуска:

1. **Создайте тестовые данные:**
   - Создайте учеников через интерфейс администратора
   - Создайте группы
   - Назначьте программы обучения

2. **Изучите API:**
   - Откройте http://localhost:8000/docs
   - Попробуйте различные endpoints

3. **Настройте уведомления:**
   - Настройте SMTP в `.env` для отправки email

4. **Настройте продакшн:**
   - Измените `SECRET_KEY` на более безопасный
   - Настройте HTTPS
   - Настройте резервное копирование БД

---

## 📞 Полезные команды

### Backend:
```bash
# Запуск
uvicorn app.main:app --reload

# Запуск на другом порту
uvicorn app.main:app --reload --port 8001

# Запуск без автоперезагрузки (продакшн)
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Frontend:
```bash
# Запуск
npm start

# Сборка для продакшна
npm run build

# Запуск тестов
npm test
```

### База данных:
```bash
# Подключение
psql -U learning_user -d learning_portal

# Резервная копия
pg_dump -U learning_user learning_portal > backup.sql

# Восстановление
psql -U learning_user learning_portal < backup.sql
```

---

## ✅ Чек-лист запуска

- [ ] PostgreSQL установлен и запущен
- [ ] База данных `learning_portal` создана
- [ ] Виртуальное окружение Python создано и активировано
- [ ] Зависимости backend установлены
- [ ] Файл `.env` создан и настроен
- [ ] Backend запущен на http://localhost:8000
- [ ] Зависимости frontend установлены
- [ ] Frontend запущен на http://localhost:3000
- [ ] Первый администратор создан
- [ ] Вход в систему выполнен успешно

---

**Готово! 🎉 Проект должен работать!**

Если возникнут проблемы, проверьте логи в терминалах backend и frontend.

