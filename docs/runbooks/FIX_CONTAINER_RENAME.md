# Контейнеры `learning-portal-backend-1` переименовываются в `<hash>_learning-portal-backend-1`

## Симптом

После почти каждого `docker compose up -d` / `restart` один или несколько сервисов
проекта оказываются с именем вида `dcd6094a387e_learning-portal-backend-1`
(префикс — ID контейнера). `docker compose ps` при этом показывает их как
активный контейнер сервиса, поэтому compose их «не видит как проблему» и сам
не чинит — приходится вручную `docker rm -f` на каждый деплой.

## Первопричина

Три фактора складываются:

1. **Гонка параллельных `docker compose up`.** На хосте есть cron
   `* * * * * /root/autodeploy.sh`, который каждую минуту делает
   безусловный `docker compose up -d` («самолечение»). Его `flock` защищал
   только от самого себя. Ручные деплои (`scripts/remote_deploy.py`,
   `deploy.sh`, команды из `docs/runbooks/DEPLOY_COMMANDS.md`, ручные
   `docker compose build && docker compose up -d`) шли **без этого лока**.
   Когда ручной `up` попадает в ту же минуту, что и cron-овый, два процесса
   compose одновременно меняют один проект. Compose при recreate: (1)
   переименовывает старый контейнер в `<id>_<имя>`, (2) создаёт новый с
   правильным именем, (3) останавливает и удаляет старый. Если на шаге 2–3
   его прерывает второй процесс, остаётся только переименованный контейнер,
   а по метке `config-hash` он совпадает с сервисом → следующий `up`
   считает сервис «актуальным» и имя назад не возвращает. Навсегда.

2. **Долгая остановка контейнеров.** В логах dockerd — пачки
   `ShouldRestart failed ... exitStatus {137}` (SIGKILL): приложение не
   укладывается в 10-секундный grace-period и его убивают. Каждый recreate
   растягивается на 10–30 с, окно гонки из п.1 становится широким.

3. **`depends_on: migrator` (`service_completed_successfully`).** `migrator` —
   одноразовый (`restart: "no"`). При каждом `docker compose up -d` (в т.ч.
   при поминутном «самолечении») он поднимается заново и тянет за собой
   переоценку/recreate у `backend` и всех воркеров — постоянная лишняя
   болтанка контейнеров.

## Что изменено в репозитории

| Файл | Изменение |
|---|---|
| `docker-compose.yml` | Убран `depends_on: migrator` у `backend` и воркеров. `migrator` переведён в профиль `migrate` (обычный `up` его больше не трогает). Добавлен `stop_grace_period: 30s` долгоживущим сервисам. |
| `deploy/autodeploy.sh` | Новый канонический cron-скрипт: единый лок `/tmp/learning-portal-deploy.lock`, явный шаг миграций `docker compose run --rm migrator`, `--remove-orphans`, авто-переименование застрявших контейнеров обратно. |
| `scripts/remote_deploy.py` | Все mutate-команды обёрнуты в тот же `flock`; миграции через `run --rm migrator` вместо `exec`; `--remove-orphans`; шаг «fix renamed containers»; новый режим `--mode fix-orphans`. |
| `deploy.sh` | То же: общий лок, явные миграции, `--remove-orphans`, нормализация имён. |

Миграции теперь — **явный шаг деплоя**, а не hard-dependency. Любой путь
деплоя обязан выполнить `docker compose run --rm migrator` до `up`
(во всех скриптах это уже так).

## Разовая процедура на хосте (после мёржа)

```bash
ssh root@80.87.201.25
cd /root/learning-portal
git pull --ff-only origin main

# 1. поставить новый cron-скрипт вместо /root/autodeploy.sh
crontab -l | grep -v autodeploy.sh | crontab -
( crontab -l 2>/dev/null; echo '* * * * * /root/learning-portal/deploy/autodeploy.sh' ) | crontab -
chmod +x deploy/autodeploy.sh
rm -f /root/autodeploy.sh

# 2. ротация распухшего лога (старый /var/log/autodeploy.log — миллионы строк)
: > /var/log/autodeploy.log 2>/dev/null || true
cat >/etc/logrotate.d/learning-portal-autodeploy <<'EOF'
/var/log/learning-portal-autodeploy.log {
  weekly
  rotate 4
  compress
  missingok
  notifempty
  copytruncate
}
EOF

# 3. одноразово вычистить уже застрявшие контейнеры и выровнять имена
python3 scripts/remote_deploy.py --host 80.87.201.25 --user root --password '***' --mode fix-orphans
# либо вручную:
for svc in backend app_worker app_scheduler app_delivery_worker web; do
  want="learning-portal-${svc}-1"
  cid=$(docker ps -aq --filter label=com.docker.compose.project=learning-portal \
                      --filter label=com.docker.compose.service=$svc | head -n1)
  have=$(docker inspect -f '{{.Name}}' "$cid" | sed 's#^/##')
  [ -n "$cid" ] && [ "$have" != "$want" ] && { docker rm -f "$want" 2>/dev/null; docker rename "$have" "$want"; }
done
docker compose ps
```

## Как деплоить дальше

- **Автоматически:** пуш в `origin/main` → cron подхватит в течение минуты.
- **Вручную с машины разработчика:**
  ```
  python3 scripts/remote_deploy.py --host 80.87.201.25 --user root --password '***' --mode deploy
  ```
- **Вручную на хосте:** `cd /root/learning-portal && ./deploy.sh`
- **Если имена снова разъехались:** `--mode fix-orphans` (или `./deploy.sh` — он тоже нормализует).

Не запускать «голый» `docker compose up -d` руками на хосте — он не берёт лок.
Если очень нужно: `flock -w 600 /tmp/learning-portal-deploy.lock docker compose up -d`.
