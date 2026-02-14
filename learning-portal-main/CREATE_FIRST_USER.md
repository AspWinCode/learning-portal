# 👤 Создание первого пользователя (администратора)

## Проблема: "incorrect email or password"

Эта ошибка означает, что в базе данных еще нет пользователей. Нужно создать первого администратора.

---

## ✅ Способ 1: Через Python консоль (Рекомендуется)

### Шаг 1: Убедитесь, что backend настроен

1. **Перейдите в папку backend:**
   ```powershell
   cd "C:\Users\direc\Downloads\new project\backend"
   ```

2. **Активируйте виртуальное окружение:**
   ```powershell
   .\venv\Scripts\Activate.ps1
   ```

3. **Убедитесь, что backend запущен** (в другом окне PowerShell):
   ```powershell
   uvicorn app.main:app --reload
   ```

### Шаг 2: Создайте администратора

1. **Откройте Python:**
   ```powershell
   python
   ```

2. **Выполните следующий код** (скопируйте и вставьте целиком):

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
print("\nТеперь вы можете войти в систему!")

# Выход из Python
exit()
```

3. **Выйдите из Python:**
   - Нажмите Enter после выполнения кода
   - Или введите `exit()` и нажмите Enter

### Шаг 3: Войдите в систему

1. Откройте http://localhost:3000
2. Введите:
   - **Email:** `admin@example.com`
   - **Password:** `admin123`
3. Нажмите "Войти"

---

## ✅ Способ 2: Через скрипт Python

### Шаг 1: Создайте файл `create_admin.py`

В папке `backend` создайте файл `create_admin.py`:

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

db.close()
```

### Шаг 2: Запустите скрипт

```powershell
# Убедитесь, что виртуальное окружение активировано
.\venv\Scripts\Activate.ps1

# Запустите скрипт
python create_admin.py
```

---

## ✅ Способ 3: Через SQL (для продвинутых)

Если вы знакомы с SQL:

1. **Подключитесь к базе данных:**
   ```powershell
   psql -U learning_user -d learning_portal
   ```

2. **Введите пароль:** `WinCode`

3. **Выполните SQL команду:**
   ```sql
   INSERT INTO users (email, hashed_password, full_name, role, is_active, created_at)
   VALUES (
       'admin@example.com',
       '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYqJN5qZ5K2',
       'Администратор',
       'admin',
       true,
       NOW()
   );
   ```

   ⚠️ **Внимание:** Этот хеш соответствует паролю `admin123`. Если хотите другой пароль, используйте Способ 1 или 2.

4. **Выход:**
   ```sql
   \q
   ```

---

## 🔐 Создание дополнительных пользователей

После входа как администратор вы можете создавать других пользователей через интерфейс или API.

### Создание через Python (после входа как админ):

```python
from app.database import SessionLocal
from app.models import User, UserRole
from app.auth import get_password_hash

db = SessionLocal()

# Создание родителя
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

# Создание тренера
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
```

---

## ⚠️ Важные замечания

1. **Пароль по умолчанию:** `admin123` - **обязательно смените его после первого входа!**

2. **Email:** `admin@example.com` - вы можете изменить его в коде перед созданием

3. **Безопасность:** В продакшене используйте сложные пароли и не храните их в коде

4. **Активность:** Убедитесь, что `is_active=True`, иначе вход будет заблокирован

---

## 🔍 Проверка создания пользователя

После создания пользователя можно проверить через SQL:

```sql
-- Подключение
psql -U learning_user -d learning_portal

-- Просмотр пользователей
SELECT id, email, full_name, role, is_active FROM users;

-- Выход
\q
```

---

## 🆘 Если все еще не работает

### Проблема 1: "ModuleNotFoundError"

**Решение:**
- Убедитесь, что виртуальное окружение активировано
- Убедитесь, что вы в папке `backend`
- Попробуйте: `pip install -r requirements.txt`

### Проблема 2: "Could not connect to database"

**Решение:**
- Убедитесь, что PostgreSQL запущен
- Проверьте `DATABASE_URL` в файле `.env`
- Проверьте, что база данных `learning_portal` создана

### Проблема 3: "User already exists"

**Решение:**
- Пользователь уже создан
- Попробуйте войти с существующими данными
- Или удалите пользователя и создайте заново

### Проблема 4: Вход все еще не работает

**Решение:**
1. Проверьте, что backend запущен: http://localhost:8000
2. Проверьте, что пользователь создан (см. "Проверка создания пользователя")
3. Убедитесь, что `is_active=True`
4. Попробуйте очистить кеш браузера

---

## ✅ Чек-лист

- [ ] Backend запущен на http://localhost:8000
- [ ] Виртуальное окружение активировано
- [ ] Администратор создан через Python
- [ ] Сообщение "✅ Администратор создан!" появилось
- [ ] Попытка входа с `admin@example.com` / `admin123`
- [ ] Успешный вход в систему

---

**После создания администратора вы сможете войти в систему!** 🎉

