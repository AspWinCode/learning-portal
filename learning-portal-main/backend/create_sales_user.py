"""
Создание пользователя sales (и при необходимости admin) для входа в систему.
Запуск на сервере: docker compose exec backend python create_sales_user.py
"""
import bcrypt
from app.database import SessionLocal
from app.models import User, UserRole

db = SessionLocal()

def ensure_user(email: str, password: str, full_name: str, role: UserRole):
    if db.query(User).filter(User.email == email).first():
        print(f"Пользователь {email} уже существует.")
        return
    hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    user = User(
        email=email,
        hashed_password=hashed,
        full_name=full_name,
        role=role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    print(f"Создан: {email} / пароль: {password}")

# Админ (если ещё нет)
ensure_user("admin@example.com", "admin123", "Администратор", UserRole.ADMIN)
# Продажи
ensure_user("sales@example.com", "sales123", "Менеджер по продажам", UserRole.SALES)

db.close()
print("Готово. Вход: sales@example.com / sales123 или admin@example.com / admin123")
