FROM python:3.11-slim

WORKDIR /app
ARG INSTALL_DEV=false

# System deps: fonts for PDF with Cyrillic (spravka KND 1151158)
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# MAX (platform-api2.max.ru) цепляет TLS-сертификат к Russian Trusted Root CA
# Минцифры, которого нет в стандартном Mozilla/Debian trust store — без этого
# httpx/requests падают с CERTIFICATE_VERIFY_FAILED на любом вызове MAX API.
# Кладём в системный store (для update-ca-certificates) и дополнительно
# дописываем в certifi.cacert.pem — httpx/requests по умолчанию доверяют
# именно ему, а не /etc/ssl/certs.
COPY docker/certs/russian_trusted_root_ca.crt /usr/local/share/ca-certificates/russian_trusted_root_ca.crt
COPY docker/certs/russian_trusted_sub_ca.crt /usr/local/share/ca-certificates/russian_trusted_sub_ca.crt
RUN update-ca-certificates

COPY requirements.txt /app/requirements.txt
COPY requirements-dev.txt /app/requirements-dev.txt
RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir -r /app/requirements.txt \
 && if [ "$INSTALL_DEV" = "true" ]; then pip install --no-cache-dir -r /app/requirements-dev.txt; fi \
 && cat /usr/local/share/ca-certificates/russian_trusted_root_ca.crt \
        /usr/local/share/ca-certificates/russian_trusted_sub_ca.crt \
        >> "$(python -c 'import certifi; print(certifi.where())')"

COPY . /app
RUN groupadd --system app \
 && useradd --system --gid app --create-home --home-dir /home/app app \
 && mkdir -p /app/storage \
 && chown -R app:app /app /home/app

# При сборке всегда подменять миграцию 0047 на идемпотентную (CREATE INDEX IF NOT EXISTS, _table_exists/_column_exists)
COPY docker/0047_eight_lessons_units_extra.py /app/alembic/versions/0047_eight_lessons_units_extra.py
COPY docker/0079_scheduled_messages.py /app/alembic/versions/0079_scheduled_messages.py

# Schema migrations are executed by the dedicated `migrator` service in docker-compose before app startup.
# `--proxy-headers` is required behind reverse proxies (Caddy/Nginx) to respect X-Forwarded-Proto/For.
USER app
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips=${TRUSTED_PROXY_IPS:-127.0.0.1}"]


