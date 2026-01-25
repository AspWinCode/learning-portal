"""
Скрипт для создания первого администратора
Использует прямое хеширование bcrypt для обхода проблем с passlib
"""
import bcrypt
from app.database import SessionLocal
from app.models import User, UserRole

db = SessionLocal()

# Прямое хеширование пароля с помощью bcrypt
password = "admin123"
hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

# Создание администратора
admin = User(
    email="admin@example.com",
    hashed_password=hashed_password,
    full_name="Администратор",
    role=UserRole.ADMIN,
    is_active=True
)

db.add(admin)
db.commit()

print("✅ Администратор создан!")
print("Email: admin@example.com")
print("Password: admin123")
print("\nТеперь вы можете войти в систему!")

db.close()

