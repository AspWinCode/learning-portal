"""Создаёт первого админа (admin@example.com / admin123). Запуск: python create_admin.py"""
import os
import sys
from pathlib import Path

# load .env
env = Path(__file__).resolve().parent / ".env"
if env.exists():
    for line in env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

try:
    from app.database import SessionLocal
    from app.models import User
    from app.auth import get_password_hash
except Exception as e:
    print("Ошибка импорта:", e)
    sys.exit(1)

# enum UserRole может быть в app.models
try:
    from app.models import UserRole
except ImportError:
    UserRole = type("UserRole", (), {"ADMIN": "admin"})

def main():
    db = SessionLocal()
    try:
        exists = db.query(User).filter(User.email == "admin@example.com").first()
        if exists:
            print("Админ уже есть: admin@example.com")
            return
        u = User(
            email="admin@example.com",
            hashed_password=get_password_hash("admin123"),
            full_name="Администратор",
            role=UserRole.ADMIN if hasattr(UserRole, "ADMIN") else "admin",
            is_active=True,
        )
        db.add(u)
        db.commit()
        print("Создан: admin@example.com / admin123")
    except Exception as e:
        print("Ошибка:", e)
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    main()
