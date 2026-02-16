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


