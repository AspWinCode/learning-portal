from __future__ import annotations

import os
import smtplib
import uuid
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from base64 import encodebytes
from email.utils import formatdate, make_msgid
from pathlib import Path
from typing import List


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
    attachments: List[dict] | None = None,
) -> bool:
    """Send an email with HTML + plain-text fallback and optional file attachments.

    Each entry in `attachments` must have keys:
      - path: str | Path  — absolute path to the file on disk
      - filename: str     — original filename shown to recipient
      - content_type: str — MIME type, e.g. "application/pdf"
    """
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
    has_attachments = bool(attachments)

    if html_body:
        alt = MIMEMultipart("alternative")
        fallback = plain_body or _html_to_plain(html_body)
        alt.attach(MIMEText(fallback, "plain", "utf-8"))
        alt.attach(MIMEText(html_body, "html", "utf-8"))

        if has_attachments:
            msg = MIMEMultipart("mixed")
            msg.attach(alt)
        else:
            msg = alt

        msg["Subject"] = subject.strip()[:255]
        msg["From"] = from_display
        msg["To"] = to_email.strip()
        msg["Date"] = formatdate(localtime=False)
        msg["Message-ID"] = make_msgid(domain=from_email.split("@")[-1] if "@" in from_email else "mail")
        msg["Precedence"] = "bulk"
        msg["X-Mailer"] = "LearningPortal/1.0"
        if list_id:
            msg["List-ID"] = list_id
    else:
        from email.message import EmailMessage
        msg = EmailMessage()
        msg["Subject"] = subject.strip()[:255]
        msg["From"] = from_display
        msg["To"] = to_email.strip()
        msg["Date"] = formatdate(localtime=False)
        msg["Message-ID"] = make_msgid(domain=from_email.split("@")[-1] if "@" in from_email else "mail")
        msg.set_content((plain_body or "").strip()[:5000] or subject.strip()[:255])

    if has_attachments:
        for att in attachments:
            try:
                file_data = Path(att["path"]).read_bytes()
                main_type, _, sub_type = (att.get("content_type") or "application/octet-stream").partition("/")
                part = MIMEBase(main_type, sub_type or "octet-stream")
                part.set_payload(file_data)
                encodebytes(file_data)  # validate; actual encoding below
                import email.encoders
                email.encoders.encode_base64(part)
                part.add_header(
                    "Content-Disposition",
                    "attachment",
                    filename=att.get("filename", "attachment"),
                )
                msg.attach(part)
            except Exception:
                pass  # skip unreadable files rather than failing the whole send

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
