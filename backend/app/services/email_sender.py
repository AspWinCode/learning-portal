from __future__ import annotations

import os
import smtplib
from email.message import EmailMessage


def is_email_configured() -> bool:
    return bool(
        (os.getenv("SMTP_HOST") or "").strip()
        and (os.getenv("SMTP_PORT") or "").strip()
        and (os.getenv("FROM_EMAIL") or "").strip()
    )


def send_email(*, to_email: str, subject: str, body: str) -> bool:
    host = (os.getenv("SMTP_HOST") or "").strip()
    port_raw = (os.getenv("SMTP_PORT") or "").strip()
    smtp_user = (os.getenv("SMTP_USER") or "").strip()
    smtp_password = os.getenv("SMTP_PASSWORD") or ""
    from_email = (os.getenv("FROM_EMAIL") or "").strip() or smtp_user
    use_starttls = (os.getenv("SMTP_USE_STARTTLS") or "1").strip().lower() in ("1", "true", "yes")

    if not host or not port_raw or not from_email or not to_email.strip():
        return False

    try:
        port = int(port_raw)
    except ValueError:
        return False

    msg = EmailMessage()
    msg["Subject"] = subject.strip()[:255]
    msg["From"] = from_email
    msg["To"] = to_email.strip()
    msg.set_content(body.strip()[:5000] or subject.strip()[:255])

    with smtplib.SMTP(host, port, timeout=15) as server:
        server.ehlo()
        if use_starttls:
            server.starttls()
            server.ehlo()
        if smtp_user:
            server.login(smtp_user, smtp_password)
        server.send_message(msg)
    return True
