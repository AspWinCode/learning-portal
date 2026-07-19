from __future__ import annotations

import os
import smtplib
import uuid
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formatdate, make_msgid


def is_email_configured() -> bool:
    return bool(
        (os.getenv("SMTP_HOST") or "").strip()
        and (os.getenv("SMTP_PORT") or "").strip()
        and (os.getenv("FROM_EMAIL") or "").strip()
    )


def send_email(*, to_email: str, subject: str, body: str) -> bool:
    """Send a plain-text email. Returns True on success."""
    return send_email_html(to_email=to_email, subject=subject, html_body=None, plain_body=body)


def send_email_html(
    *,
    to_email: str,
    subject: str,
    html_body: str | None,
    plain_body: str | None = None,
    from_name: str | None = None,
    list_id: str | None = None,
) -> bool:
    """Send an email with HTML + plain-text fallback. Includes anti-spam headers."""
    host = (os.getenv("SMTP_HOST") or "").strip()
    port_raw = (os.getenv("SMTP_PORT") or "").strip()
    smtp_user = (os.getenv("SMTP_USER") or "").strip()
    smtp_password = os.getenv("SMTP_PASSWORD") or ""
    from_email = (os.getenv("FROM_EMAIL") or "").strip() or smtp_user
    use_starttls = (os.getenv("SMTP_USE_STARTTLS") or "1").strip().lower() in ("1", "true", "yes")

    if not host or not port_raw or not from_email or not (to_email or "").strip():
        return False

    try:
        port = int(port_raw)
    except ValueError:
        return False

    from_display = f"{from_name} <{from_email}>" if from_name else from_email

    if html_body:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject.strip()[:255]
        msg["From"] = from_display
        msg["To"] = to_email.strip()
        msg["Date"] = formatdate(localtime=False)
        msg["Message-ID"] = make_msgid(domain=from_email.split("@")[-1] if "@" in from_email else "mail")
        # Anti-spam: tell clients this is bulk mail but still transactional
        msg["Precedence"] = "bulk"
        msg["X-Mailer"] = "LearningPortal/1.0"
        if list_id:
            msg["List-ID"] = list_id

        fallback = plain_body or _html_to_plain(html_body)
        msg.attach(MIMEText(fallback, "plain", "utf-8"))
        msg.attach(MIMEText(html_body, "html", "utf-8"))
    else:
        from email.message import EmailMessage
        msg = EmailMessage()
        msg["Subject"] = subject.strip()[:255]
        msg["From"] = from_display
        msg["To"] = to_email.strip()
        msg["Date"] = formatdate(localtime=False)
        msg["Message-ID"] = make_msgid(domain=from_email.split("@")[-1] if "@" in from_email else "mail")
        msg.set_content((plain_body or "").strip()[:5000] or subject.strip()[:255])

    try:
        with smtplib.SMTP(host, port, timeout=15) as server:
            server.ehlo()
            if use_starttls:
                server.starttls()
                server.ehlo()
            if smtp_user:
                server.login(smtp_user, smtp_password)
            server.send_message(msg)
        return True
    except Exception:
        return False


def _html_to_plain(html: str) -> str:
    """Very basic HTML → plain text strip for email fallback."""
    import re
    text = re.sub(r"<br\s*/?>", "\n", html, flags=re.IGNORECASE)
    text = re.sub(r"</p>", "\n\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    import html as html_module
    text = html_module.unescape(text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()
