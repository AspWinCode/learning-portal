# 🔧 Решение ошибки CORS

## Проблема: "Access to XMLHttpRequest has been blocked by CORS policy"

Эта ошибка возникает, когда backend не разрешает запросы с frontend из-за политики CORS.

---

## ✅ Решение 1: Проверка запуска Backend

**Важно:** Убедитесь, что backend запущен!

1. **Проверьте, что backend работает:**
   - Откройте http://localhost:8000 в браузере
   - Должно появиться: `{"message":"Learning Portal API"}`
   - Или откройте http://localhost:8000/docs для документации API

2. **Если backend не запущен:**
   ```powershell
   cd "C:\Users\direc\Downloads\new project\backend"
   .\venv\Scripts\Activate.ps1
   uvicorn app.main:app --reload
   ```

---

## ✅ Решение 2: Обновление CORS настроек

Я уже обновил CORS настройки в `backend/app/main.py`. Теперь нужно **перезапустить backend**:

1. **Остановите backend** (Ctrl+C в терминале, где он запущен)

2. **Запустите снова:**
   ```powershell
   cd "C:\Users\direc\Downloads\new project\backend"
   .\venv\Scripts\Activate.ps1
   uvicorn app.main:app --reload
   ```

3. **Проверьте, что backend запустился без ошибок**

---

## ✅ Решение 3: Проверка ошибки 500

Ошибка 500 (Internal Server Error) означает проблему на сервере. Возможные причины:

### Проблема с bcrypt при аутентификации

Если пользователь создан с помощью `create_admin_fixed.py`, но backend все еще использует `passlib`, может быть несовместимость.

**Решение:** Обновите функцию `verify_password` в `backend/app/auth.py`:

```python
def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        # Попробуем через passlib
        return pwd_context.verify(plain_password, hashed_password)
    except:
        # Если не работает, используем прямой bcrypt
        import bcrypt
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
```

Или просто используйте прямой bcrypt:

```python
import bcrypt

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
```

---

## ✅ Решение 4: Проверка логов Backend

Посмотрите в терминале, где запущен backend, на ошибки. Там будет подробная информация о проблеме.

---

## 🔍 Проверка CORS

После перезапуска backend проверьте:

1. **Откройте консоль браузера** (F12)
2. **Попробуйте войти снова**
3. **Проверьте, что ошибка CORS исчезла**

Если ошибка сохраняется, проверьте:

- Backend запущен на http://localhost:8000
- Frontend запущен на http://localhost:3000
- В консоли backend нет ошибок

---

## 🎯 Полная последовательность

1. **Остановите backend** (Ctrl+C)

2. **Перезапустите backend:**
   ```powershell
   cd "C:\Users\direc\Downloads\new project\backend"
   .\venv\Scripts\Activate.ps1
   uvicorn app.main:app --reload
   ```

3. **Проверьте, что backend работает:**
   - Откройте http://localhost:8000
   - Должно быть: `{"message":"Learning Portal API"}`

4. **Попробуйте войти снова:**
   - Email: `admin@example.com`
   - Password: `admin123`

---

## ⚠️ Если ошибка 500 сохраняется

Проверьте логи backend в терминале. Там будет подробная информация об ошибке. Возможные причины:

1. **Проблема с базой данных** - проверьте подключение
2. **Проблема с bcrypt** - см. Решение 3
3. **Пользователь не создан** - создайте пользователя (см. CREATE_FIRST_USER.md)

---

**После перезапуска backend попробуйте войти снова!** 🚀

