# 🪟 Установка PostgreSQL на Windows - Подробная инструкция

## Проблема: "psql не распознано как команда"

Если вы видите ошибку `psql : Имя "psql" не распознано`, это означает, что PostgreSQL либо не установлен, либо не добавлен в PATH.

---

## ✅ Решение 1: Установка PostgreSQL (если не установлен)

### Шаг 1: Скачайте PostgreSQL

1. Перейдите на официальный сайт: https://www.postgresql.org/download/windows/
2. Или напрямую: https://www.enterprisedb.com/downloads/postgres-postgresql-downloads
3. Выберите последнюю версию (например, PostgreSQL 16)
4. Скачайте установщик для Windows (64-bit)

### Шаг 2: Установка

1. **Запустите установщик** (например, `postgresql-16-x64.exe`)

2. **Выберите компоненты:**
   - ✅ PostgreSQL Server (обязательно)
   - ✅ pgAdmin 4 (графический интерфейс - рекомендуется)
   - ✅ Command Line Tools (обязательно для psql)
   - ✅ Stack Builder (опционально)

3. **Выберите директорию установки:**
   - По умолчанию: `C:\Program Files\PostgreSQL\16`
   - Можно оставить по умолчанию

4. **Выберите директорию данных:**
   - По умолчанию: `C:\Program Files\PostgreSQL\16\data`
   - Можно оставить по умолчанию

5. **Установите пароль для пользователя `postgres`:**
   - ⚠️ **ВАЖНО:** Запомните этот пароль! Он понадобится для подключения к БД
   - Рекомендуется использовать надежный пароль
   - Пример: `Postgres123!` (но лучше свой уникальный)

6. **Выберите порт:**
   - По умолчанию: `5432`
   - Оставьте по умолчанию, если порт свободен

7. **Выберите локаль:**
   - Russian, Russia или English, United States
   - Не критично для работы

8. **Завершите установку:**
   - Дождитесь окончания установки
   - ✅ Отметьте "Launch Stack Builder" если нужно (обычно не требуется)

### Шаг 3: Проверка установки

После установки PostgreSQL должен быть добавлен в PATH автоматически. Проверьте:

1. **Закройте и откройте PowerShell заново** (важно!)

2. **Проверьте версию:**
   ```powershell
   psql --version
   ```

3. **Если команда работает**, переходите к [Созданию базы данных](#создание-базы-данных)

4. **Если команда не работает**, см. [Решение 2](#решение-2-добавление-в-path-вручную)

---

## ✅ Решение 2: Добавление в PATH (если PostgreSQL установлен, но не в PATH)

### Вариант A: Через графический интерфейс

1. **Найдите путь к PostgreSQL:**
   - Обычно: `C:\Program Files\PostgreSQL\16\bin`
   - Или: `C:\Program Files (x86)\PostgreSQL\16\bin`

2. **Добавьте в PATH:**
   - Нажмите `Win + R`
   - Введите: `sysdm.cpl` и нажмите Enter
   - Перейдите на вкладку "Дополнительно"
   - Нажмите "Переменные среды"
   - В разделе "Системные переменные" найдите `Path`
   - Нажмите "Изменить"
   - Нажмите "Создать"
   - Вставьте путь: `C:\Program Files\PostgreSQL\16\bin`
   - Нажмите "ОК" везде
   - **Перезапустите PowerShell**

3. **Проверьте:**
   ```powershell
   psql --version
   ```

### Вариант B: Через PowerShell (временно для текущей сессии)

```powershell
# Замените 16 на вашу версию PostgreSQL
$env:Path += ";C:\Program Files\PostgreSQL\16\bin"
psql --version
```

### Вариант C: Через PowerShell (постоянно)

```powershell
# Замените 16 на вашу версию PostgreSQL
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\Program Files\PostgreSQL\16\bin", "User")
```

**После этого закройте и откройте PowerShell заново.**

---

## ✅ Решение 3: Использование полного пути (без добавления в PATH)

Если не хотите добавлять в PATH, используйте полный путь:

```powershell
# Замените 16 на вашу версию PostgreSQL
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres
```

---

## 📊 Создание базы данных

После того, как `psql` работает, создайте базу данных:

### Способ 1: Через командную строку (psql)

1. **Подключитесь к PostgreSQL:**
   ```powershell
   psql -U postgres
   ```
   Введите пароль, который вы установили при установке.

2. **Создайте пользователя и базу данных:**
   ```sql
   -- Создание пользователя
   CREATE USER learning_user WITH PASSWORD 'your_password_here';
   
   -- Создание базы данных
   CREATE DATABASE learning_portal OWNER learning_user;
   
   -- Предоставление прав
   GRANT ALL PRIVILEGES ON DATABASE learning_portal TO learning_user;
   
   -- Выход
   \q
   ```

### Способ 2: Через pgAdmin (графический интерфейс)

1. **Откройте pgAdmin 4:**
   - Найдите в меню "Пуск" → "PostgreSQL 16" → "pgAdmin 4"
   - Или откройте браузер: http://127.0.0.1:xxxxx (pgAdmin откроется автоматически)

2. **Подключитесь к серверу:**
   - При первом запуске введите пароль для пользователя `postgres`
   - Сервер должен быть в списке слева

3. **Создайте базу данных:**
   - Правой кнопкой на "Databases" → "Create" → "Database"
   - Имя: `learning_portal`
   - Владелец: `postgres` (или создайте нового пользователя)
   - Нажмите "Save"

4. **Создайте пользователя (опционально):**
   - Правой кнопкой на "Login/Group Roles" → "Create" → "Login/Group Role"
   - General → Name: `learning_user`
   - Definition → Password: `your_password_here`
   - Privileges → отметьте нужные права
   - Нажмите "Save"

### Способ 3: Через SQL скрипт

Создайте файл `create_db.sql`:

```sql
-- Создание пользователя
CREATE USER learning_user WITH PASSWORD 'your_password_here';

-- Создание базы данных
CREATE DATABASE learning_portal OWNER learning_user;

-- Предоставление прав
GRANT ALL PRIVILEGES ON DATABASE learning_portal TO learning_user;
```

Запустите:
```powershell
psql -U postgres -f create_db.sql
```

---

## 🔍 Проверка подключения

После создания базы данных проверьте подключение:

```powershell
# Подключение к базе данных
psql -U learning_user -d learning_portal

# Если подключение успешно, вы увидите:
# learning_portal=>

# Введите команду для проверки:
SELECT version();

# Выход:
\q
```

---

## ⚠️ Частые проблемы

### Проблема: "Пароль не принимается"

**Решение:**
- Убедитесь, что вводите правильный пароль (регистр важен!)
- Если забыли пароль, можно сбросить через pgAdmin или переустановить PostgreSQL

### Проблема: "Сервер не запущен"

**Решение:**
1. Откройте "Службы" (Services):
   - `Win + R` → `services.msc`
2. Найдите "postgresql-x64-16" (или вашу версию)
3. Убедитесь, что статус "Выполняется"
4. Если нет - нажмите "Запустить"

### Проблема: "Порт 5432 занят"

**Решение:**
1. Проверьте, не запущен ли другой экземпляр PostgreSQL
2. Или используйте другой порт при установке
3. Обновите `DATABASE_URL` в `.env` файле соответственно

### Проблема: "Отказано в доступе"

**Решение:**
- Запустите PowerShell от имени администратора
- Или используйте пользователя `postgres` вместо `learning_user`

---

## 📝 Следующие шаги

После успешного создания базы данных:

1. Обновите файл `backend/.env`:
   ```env
   DATABASE_URL=postgresql://learning_user:your_password_here@localhost:5432/learning_portal
   ```

2. Продолжите настройку проекта согласно [QUICK_START.md](QUICK_START.md)

---

## 🆘 Альтернатива: SQLite (для тестирования)

Если у вас проблемы с PostgreSQL, можно временно использовать SQLite для тестирования:

1. В `backend/.env` измените:
   ```env
   DATABASE_URL=sqlite:///./learning_portal.db
   ```

2. ⚠️ **Внимание:** SQLite не поддерживает все функции PostgreSQL и не рекомендуется для продакшена!

---

## ✅ Чек-лист

- [ ] PostgreSQL установлен
- [ ] Команда `psql --version` работает
- [ ] Служба PostgreSQL запущена
- [ ] База данных `learning_portal` создана
- [ ] Пользователь `learning_user` создан (или используется `postgres`)
- [ ] Подключение к БД проверено
- [ ] Файл `backend/.env` обновлен с правильным `DATABASE_URL`

**Готово! Теперь можно продолжать настройку проекта.** 🎉

