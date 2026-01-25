# 💻 Полезные команды PowerShell для проекта

## Проблема: Путь с пробелами

Если в пути есть пробелы (например, "new project"), PowerShell может неправильно интерпретировать команду. **Всегда заключайте путь в кавычки!**

---

## ✅ Правильные команды для навигации

### Переход в директорию проекта:

```powershell
# Правильно - с кавычками
cd "C:\Users\direc\Downloads\new project"

# Или используйте относительный путь
cd Downloads
cd "new project"
```

### Переход в backend:

```powershell
# Из корня проекта
cd "C:\Users\direc\Downloads\new project\backend"

# Или если вы уже в корне проекта
cd backend
```

### Переход в frontend:

```powershell
# Из корня проекта
cd "C:\Users\direc\Downloads\new project\frontend"

# Или если вы уже в корне проекта
cd frontend
```

---

## 🚀 Быстрая настройка проекта

### 1. Переход в корень проекта:

```powershell
cd "C:\Users\direc\Downloads\new project"
```

### 2. Настройка Backend:

```powershell
# Переход в backend
cd backend

# Создание виртуального окружения
python -m venv venv

# Активация (Windows)
.\venv\Scripts\Activate.ps1

# Если ошибка выполнения скриптов, выполните:
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Установка зависимостей
pip install -r requirements.txt
```

### 3. Настройка Frontend:

```powershell
# Вернуться в корень проекта
cd ..

# Переход в frontend
cd frontend

# Установка зависимостей
npm install
```

---

## ⚙️ Создание файла .env для Backend

### Способ 1: Через PowerShell

```powershell
# Переход в backend
cd "C:\Users\direc\Downloads\new project\backend"

# Создание файла .env
@"
DATABASE_URL=postgresql://learning_user:WinCode@localhost:5432/learning_portal
SECRET_KEY=your-super-secret-key-change-this-in-production-min-32-chars
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
"@ | Out-File -FilePath .env -Encoding utf8
```

### Способ 2: Через блокнот

```powershell
# Открыть блокнот для создания .env
notepad .env
```

Затем вставьте:
```env
DATABASE_URL=postgresql://learning_user:WinCode@localhost:5432/learning_portal
SECRET_KEY=your-super-secret-key-change-this-in-production-min-32-chars
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

### Способ 3: Генерация секретного ключа

```powershell
# В Python (после активации venv)
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Скопируйте результат и используйте как SECRET_KEY.

---

## 🔧 Решение проблем с PowerShell

### Проблема: "Не удается найти позиционный параметр"

**Причина:** Пробелы в пути без кавычек

**Решение:** Всегда используйте кавычки:
```powershell
# ❌ Неправильно
cd C:\Users\direc\Downloads\new project

# ✅ Правильно
cd "C:\Users\direc\Downloads\new project"
```

### Проблема: "execution of scripts is disabled"

**Решение:**
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Проблема: "venv\Scripts\activate" не работает

**Решение:**
```powershell
# Используйте полный путь к скрипту
.\venv\Scripts\Activate.ps1

# Или
& .\venv\Scripts\Activate.ps1
```

---

## 📝 Полезные команды

### Проверка текущей директории:
```powershell
pwd
# или
Get-Location
```

### Просмотр содержимого:
```powershell
ls
# или
Get-ChildItem
```

### Создание директории:
```powershell
mkdir "название папки"
```

### Копирование файла:
```powershell
Copy-Item "source.txt" "destination.txt"
```

### Просмотр переменных окружения:
```powershell
$env:Path
```

---

## 🎯 Полный скрипт настройки (для копирования)

```powershell
# Переход в корень проекта
cd "C:\Users\direc\Downloads\new project"

# ===== BACKEND =====
cd backend

# Создание виртуального окружения
python -m venv venv

# Активация
.\venv\Scripts\Activate.ps1

# Установка зависимостей
pip install -r requirements.txt

# Создание .env (замените SECRET_KEY на сгенерированный)
@"
DATABASE_URL=postgresql://learning_user:WinCode@localhost:5432/learning_portal
SECRET_KEY=your-super-secret-key-change-this-in-production-min-32-chars
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
"@ | Out-File -FilePath .env -Encoding utf8

# Запуск сервера (в отдельном окне)
# uvicorn app.main:app --reload

# ===== FRONTEND =====
cd ..
cd frontend

# Установка зависимостей
npm install

# Запуск (в отдельном окне)
# npm start
```

---

## ✅ Чек-лист команд

```powershell
# 1. Переход в проект
cd "C:\Users\direc\Downloads\new project"

# 2. Backend - создание venv
cd backend
python -m venv venv

# 3. Backend - активация
.\venv\Scripts\Activate.ps1

# 4. Backend - установка зависимостей
pip install -r requirements.txt

# 5. Backend - создание .env (см. выше)

# 6. Backend - запуск (в новом окне PowerShell)
uvicorn app.main:app --reload

# 7. Frontend - установка (в новом окне PowerShell)
cd "C:\Users\direc\Downloads\new project\frontend"
npm install

# 8. Frontend - запуск
npm start
```

---

**Помните:** Всегда используйте кавычки для путей с пробелами! 🎯

