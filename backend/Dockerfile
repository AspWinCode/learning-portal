FROM python:3.11-slim

WORKDIR /app

# System deps: fonts for PDF with Cyrillic (spravka KND 1151158)
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir -r /app/requirements.txt

COPY . /app

# Default command: run migrations then start API.
# `--proxy-headers` is required behind reverse proxies (Caddy/Nginx) to respect X-Forwarded-Proto/For.
# Use explicit revision to avoid "Multiple head revisions" when repo has nested migration folders
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'"]


