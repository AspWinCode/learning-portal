"""
Сбрасывает пароль администратора admin@example.com на admin123
Запуск: python reset_admin_password.py
"""
import bcrypt
from app.database import SessionLocal
from app.models import User

db = SessionLocal()

email = "admin@example.com"
user = db.query(User).filter(User.email == email).first()
if not user:
    print("User not found:", email)
    db.close()
    exit(1)

password = "admin123"
user.hashed_password = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
user.is_active = True
db.commit()

print("OK: Password for", email, "set to admin123")
print("You can log in now.")
db.close()
