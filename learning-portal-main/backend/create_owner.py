"""
Создаёт пользователя с ролью owner (или сбрасывает пароль, если уже есть).
Email: owner@example.com
Пароль: owner123
Запуск: python create_owner.py
"""
import bcrypt
from app.database import SessionLocal
from app.models import User, UserRole

db = SessionLocal()

email = "owner@example.com"
password = "owner123"
hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

user = db.query(User).filter(User.email == email).first()
if user:
    user.hashed_password = hashed
    user.role = UserRole.OWNER
    user.is_active = True
    db.commit()
    print("OK: User", email, "updated. Password set to owner123")
else:
    user = User(
        email=email,
        hashed_password=hashed,
        full_name="Владелец",
        role=UserRole.OWNER,
        is_active=True,
    )
    db.add(user)
    db.commit()
    print("OK: Owner created. Email:", email, "Password: owner123")

print("You can log in as owner now.")
db.close()
