# Исправление ошибки Caddy "ambiguous site definition"

## Что было не так

Caddy падал с ошибкой: `ambiguous site definition: https://tirskix.space` — один и тот же сайт оказывался в двух блоках. В Caddyfile оставлен **один** блок с явным адресом `https://{$DOMAIN}`.

## На VPS: проверка и перезапуск

Подключитесь к серверу и перейдите в каталог, **откуда вы запускаете docker compose** (там, где лежит `docker-compose.yml`). Например:

```bash
cd /root/learning-portal/learning-portal-main
# Если у вас вложенная папка с проектом — перейдите в неё, где есть frontend/ и docker-compose.yml:
# cd /root/learning-portal/learning-portal-main/learning-portal-main
```

### 1. Убедиться, что подтянулся новый Caddyfile

```bash
git pull
cat frontend/Caddyfile
```

Должен быть **один** блок вида `https://{$DOMAIN} { ... }`, без `http://{$DOMAIN} https://{$DOMAIN}` и без двух блоков с одним доменом.

### 2. Пересобрать образ web без кэша

Чтобы в образ попал именно этот Caddyfile:

```bash
docker compose build --no-cache web
```

### 3. Проверить переменную DOMAIN

```bash
grep DOMAIN .env 2>/dev/null || true
export DOMAIN=tirskix.space
docker compose config
```

В конфиге у сервиса `web` должно быть `DOMAIN: tirskix.space` (или из `.env`).

### 4. Запустить контейнеры

```bash
docker compose up -d
docker compose logs web --tail 20
```

В логах не должно быть `ambiguous site definition`. Если ошибка осталась — пришлите вывод:

```bash
docker compose run --rm web cat /etc/caddy/Caddyfile
```

Так вы увидите, какой Caddyfile реально попал в образ.
