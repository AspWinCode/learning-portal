"""
Telegram polling worker.

Запуск (в отдельном терминале):
  cd backend
  .\venv\Scripts\Activate.ps1
  $env:TELEGRAM_BOT_TOKEN="..."
  python telegram_bot_polling.py

Пользователь пишет боту:
  /start ABCD1234
и мы привязываем chat_id к аккаунту по одноразовому коду.
"""

import os
import time
from datetime import datetime

from app.database import SessionLocal
from app.models import User


def get_token() -> str:
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not token:
        raise RuntimeError("TELEGRAM_BOT_TOKEN is not set")
    return token


def send_message(token: str, chat_id: int, text: str) -> None:
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    import json
    import urllib.request
    req = urllib.request.Request(
        url,
        data=json.dumps({"chat_id": chat_id, "text": text}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    urllib.request.urlopen(req, timeout=10)


def main() -> None:
    token = get_token()
    base = f"https://api.telegram.org/bot{token}"
    offset = 0

    print("✅ Telegram polling started. Waiting for /start <CODE> ...")

    while True:
        try:
            import json
            import urllib.parse
            import urllib.request

            qs = urllib.parse.urlencode({"timeout": 25, "offset": offset})
            with urllib.request.urlopen(f"{base}/getUpdates?{qs}", timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            if not data.get("ok"):
                time.sleep(2)
                continue

            updates = data.get("result", [])
            for upd in updates:
                offset = max(offset, upd.get("update_id", 0) + 1)
                msg = upd.get("message") or upd.get("edited_message")
                if not msg:
                    continue

                text = (msg.get("text") or "").strip()
                chat = msg.get("chat") or {}
                chat_id = chat.get("id")
                if not chat_id:
                    continue

                if not text.startswith("/start"):
                    continue

                parts = text.split(maxsplit=1)
                code = parts[1].strip() if len(parts) > 1 else ""
                if not code:
                    send_message(token, chat_id, "Отправьте команду в формате: /start <КОД>")
                    continue

                db = SessionLocal()
                try:
                    now = datetime.utcnow()
                    user = db.query(User).filter(User.telegram_link_code == code).first()
                    if not user:
                        send_message(token, chat_id, "Код не найден или уже использован.")
                        continue
                    if user.telegram_link_code_expires_at and user.telegram_link_code_expires_at < now:
                        send_message(token, chat_id, "Код истёк. Получите новый код в системе.")
                        continue

                    user.telegram_chat_id = int(chat_id)
                    user.telegram_link_code = None
                    user.telegram_link_code_expires_at = None
                    db.add(user)
                    db.commit()

                    send_message(token, chat_id, f"✅ Telegram привязан к аккаунту: {user.email}")
                finally:
                    db.close()

        except KeyboardInterrupt:
            print("Stopping...")
            break
        except Exception as e:
            print("Polling error:", str(e))
            time.sleep(2)


if __name__ == "__main__":
    main()


