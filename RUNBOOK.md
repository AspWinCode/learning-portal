# RUNBOOK: быстрые команды для работы и деплоя (Windows → GitHub → VPS)

Этот проект деплоится на VPS через Docker Compose.
Рекомендованный поток: **правки только локально на Windows → push в GitHub → на VPS только `git pull` + `docker compose up`**.

## 0) Данные проекта
- Репозиторий: `https://github.com/AspWinCode/learning-portal`
- VPS (FirstVDS): `80.87.201.25`
- Домен: `tirskix.space`

---

## 0.1) Деплой на FirstVDS (после push в GitHub)

Код уже запушен в `main`. Осталось обновить сервер.

**Вариант А — из PowerShell одной командой (подставится пароль по запросу):**
```powershell
ssh root@80.87.201.25 "cd ~/learning-portal || cd /root/learning-portal; git pull origin main; docker compose run --rm backend python -m alembic upgrade head; docker compose up -d --build; docker compose ps"
```

**Вариант Б — по шагам:**

1. Подключиться к VPS:
```powershell
ssh root@80.87.201.25
```

2. На сервере выполнить:
```bash
cd ~/learning-portal
# или: cd /root/learning-portal

git pull origin main

# Применить миграции БД (новые таблицы/поля B2B и т.д.)
docker compose run --rm backend python -m alembic upgrade head

# Пересобрать и запустить контейнеры
docker compose up -d --build
docker compose ps
```

3. Проверить: https://tirskix.space/api/health и открыть сайт в браузере.

---

## 0.2) Точка Банк на продакшене

Чтобы интеграция с Точка Банк работала на сервере, в `.env` в каталоге проекта на VPS должны быть заданы переменные `TOCHKA_CLIENT_ID` и `TOCHKA_CLIENT_SECRET`. Для **автоматического** импорта платежей каждые 10 минут дополнительно задайте `TOCHKA_ACCOUNT_ID` (ID счёта в Точка Банк). Добавьте вручную (один раз) и перезапустите backend:

```bash
cd ~/learning-portal   # или /root/learning-portal
# Добавить в .env (подставьте свои значения из личного кабинета Точка):
echo 'TOCHKA_CLIENT_ID=ваш_client_id' >> .env
echo 'TOCHKA_CLIENT_SECRET=ваш_client_secret' >> .env
echo 'TOCHKA_ACCOUNT_ID=id_счёта_в_точка_банк' >> .env
docker compose up -d --build backend
```

- **Ручной импорт:** `POST /api/sales/tochka/import-and-apply` (тело: `date_from`, `date_to`, опционально `account_id`) — по-прежнему доступен для Sales/Admin/Owner.
- **Авто-импорт:** при заданном `TOCHKA_ACCOUNT_ID` backend раз в 10 минут загружает выписку за последние **14 дней** и начисляет платежи по **нормализованному телефону плательщика** (привязки `phone_payment_bindings` или телефон родителя в карточке); дедупликация по `operation_id` (таблица `bank_transactions`).

После деплоя с новой миграцией один раз выполните на VPS: `docker compose exec backend alembic upgrade head` (если миграции не запускаются автоматически при старте).

Проверка: с сервера или из браузера без входа — `curl -s https://tirskix.space/api/sales/tochka/status/public` (должен вернуть `{"configured": true, "auto_import_configured": true}`). Либо после входа под admin/owner/sales: `GET https://tirskix.space/api/sales/tochka/status`.

**Включить автозачисление:** добавьте на VPS в `.env` переменную `TOCHKA_ACCOUNT_ID` — ID счёта в Точка Банк (из личного кабинета Точка: Счета → нужный счёт → идентификатор счёта, или из API списка счетов). Для расчётного счёта можно попробовать в качестве `TOCHKA_ACCOUNT_ID` сам номер счёта (например `40802810020000440578`), если в ЛК нет отдельного идентификатора. Затем перезапустите backend: `docker compose up -d --build backend`.

**Платежи из Точка Банк не отображаются на сайте:**

1. **Авто-импорт только за последние 3 дня.** Платежи старше 3 дней не подхватываются автоматически. Сделайте **ручной импорт** за нужный период: в интерфейсе **Настройки Sales** → блок **«Точка Банк — ручной импорт платежей»** укажите «Дата с» и «Дата по» и нажмите «Загрузить выписку и зачислить». Либо запросом: `POST /api/sales/tochka/import-and-apply` с телом `{"date_from": "YYYY-MM-DD", "date_to": "YYYY-MM-DD"}` (подставьте период, когда прошли 2 оплаты).

2. **Результат импорта** покажет: сколько платежей зачислено (`applied`), сколько не найдено по ФИО (`no_match`), сколько с несколькими кандидатами (`ambiguous`). Если платёж в `no_match` — ФИО плательщика в выписке не совпало ни с одной карточкой ученика (поле «ФИО родителя» в личной карточке). Проверьте написание ФИО в карточке или добавьте/привяжите карточку к ученику.

3. **Где смотреть зачисленные платежи на сайте:** счёт ученика (баланс и движения) — в карточке ученика / разделе учёта; даты следующих оплат обновляются при зачислении.

4. Убедитесь, что в `.env` заданы `TOCHKA_CLIENT_ID`, `TOCHKA_CLIENT_SECRET` и для авто-импорта — `TOCHKA_ACCOUNT_ID`. Проверка: `curl -s https://tirskix.space/api/sales/tochka/status/public`.

---

## 1) Сегодня: выключить (остановить сайт)

### 1.1 Подключиться к VPS (Windows PowerShell)
```powershell
ssh root@80.87.201.25
```

### 1.2 Остановить контейнеры (на VPS)
```bash
cd ~/learning-portal
docker compose down
```

⚠️ **Не используйте `docker compose down -v`**, если хотите сохранить базу данных.

---

## 2) Завтра: правки → деплой

### 2.1 Локально на Windows: обновить код, внести правки, запушить
```powershell
cd "C:\Users\direc\Downloads\new_project"

git pull
git status

# (внесите правки в редакторе)

git add .
git commit -m "Fix: <коротко что изменили>"
git push
```

Если GitHub просит пароль — используйте **PAT (Personal Access Token)**, а не пароль аккаунта.

### 2.2 На VPS: подтянуть обновления и пересобрать контейнеры
```powershell
ssh root@80.87.201.25
```

На VPS:
```bash
cd ~/learning-portal
git pull
docker compose up -d --build
docker compose ps
```

---

## 3) Проверка после деплоя

### 3.1 Проверка API
```bash
curl -i https://tirskix.space/api/health
```

### 3.2 Логи (если что-то не работает)
```bash
cd ~/learning-portal
docker compose logs -f --tail=200
```

---

## 4) Типовые проблемы

### 4.1 `git pull` на VPS ругается на “local changes would be overwritten”
Причина: на VPS кто-то правил файлы руками (`nano`, `sed`).

Решение (сохранить локальные изменения во временный stash, подтянуть, потом решить что делать со stash):
```bash
cd ~/learning-portal
git status -sb
git stash push -m "vps local changes" -- .
git pull
git stash list
```

Если stash не нужен:
```bash
git stash drop stash@{0}
```

Если stash нужен (аккуратно применить поверх):
```bash
git stash pop
```

### 4.2 Хочу просто перезапустить без пересборки
```bash
cd ~/learning-portal
docker compose restart
```

---

## 5) Данные для входа (если создавали первого админа скриптом)
- Email: `admin@example.com`
- Password: `admin123`


