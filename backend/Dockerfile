FROM python:3.11-slim

WORKDIR /app

# System deps for psycopg2-binary are not required; keep image small.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir -r /app/requirements.txt

COPY . /app

# Default command: run migrations then start API.
# `--proxy-headers` is required behind reverse proxies (Caddy/Nginx) to respect X-Forwarded-Proto/For.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'"]


