# 🔧 Решение ошибки bcrypt

## Проблема: "error reading bcrypt version" и "AttributeError: module 'bcrypt' has no attribute '__about__'"

Эта ошибка возникает из-за несовместимости версий `passlib` и `bcrypt`.

---

## ✅ Решение: Обновление зависимостей

### Шаг 1: Выйдите из Python

```python
exit()
```

### Шаг 2: Обновите bcrypt и passlib

```powershell
# Убедитесь, что виртуальное окружение активировано
.\venv\Scripts\Activate.ps1

# Обновите bcrypt
pip install --upgrade bcrypt

# Обновите passlib
pip install --upgrade passlib[bcrypt]

# Или переустановите все зависимости
pip install --upgrade -r requirements.txt
```

### Шаг 3: Попробуйте снова создать пользователя

```python
python
```

Затем:

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
print("Email: admin@example.com")
print("Password: admin123")

exit()
```

---

## ✅ Альтернативное решение: Использование прямого хеширования

Если проблема сохраняется, можно использовать прямое хеширование:

```python
import bcrypt
from app.database import SessionLocal
from app.models import User, UserRole

db = SessionLocal()

# Прямое хеширование пароля
password = "admin123"
hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

# Создание администратора
admin = User(
    email="admin@example.com",
    hashed_password=hashed,
    full_name="Администратор",
    role=UserRole.ADMIN,
    is_active=True
)

db.add(admin)
db.commit()
print("✅ Администратор создан!")
print("Email: admin@example.com")
print("Password: admin123")

db.close()
exit()
```

---

## 🔍 Проверка версий

Проверьте установленные версии:

```powershell
pip show bcrypt
pip show passlib
```

Рекомендуемые версии:
- `bcrypt>=4.0.0`
- `passlib[bcrypt]>=1.7.4`

---

## 🎯 Полная последовательность команд

```powershell
# 1. Выйдите из Python (если еще в нем)
exit()

# 2. Обновите зависимости
pip install --upgrade bcrypt passlib[bcrypt]

# 3. Запустите Python
python

# 4. Создайте пользователя (используйте код выше)
```

---

## ✅ После успешного создания

После успешного создания администратора:

1. Выйдите из Python: `exit()`
2. Откройте http://localhost:3000
3. Войдите с:
   - Email: `admin@example.com`
   - Password: `admin123`

---

**Попробуйте обновить зависимости и создать пользователя снова!** 🚀

