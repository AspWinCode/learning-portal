# Безопасное обновление без изменений БД

Используйте этот сценарий, когда **менялся только фронтенд** (или бэкенд без новых миграций Alembic). База данных не затрагивается.

---

## 1) Локально: что уезжает на сервер

- Убедитесь, что нет новых файлов миграций в `backend/alembic/versions/`.
- Изменённые файлы в этом обновлении: только фронтенд (`frontend/`). **Миграции не добавлялись.**

---

## 2) Локально: коммит и push

```bash
cd c:\Users\direc\Downloads\new_project
git add frontend/src/App.tsx frontend/src/components/Layout.tsx frontend/src/pages/FinancialModelPage.tsx
git status
git commit -m "Financial model: remove Students/Groups/Trainers tabs and manual GroupID/TeacherID/Direction fields"
git push origin main
```

---

## 3) На VPS (Docker): обновление без миграций

Подключитесь к серверу и перейдите в каталог проекта (например `/root/learning-portal`):

```bash
ssh root@YOUR_SERVER_IP
cd /root/learning-portal
```

Обновить код и пересобрать только то, что нужно:

```bash
git pull origin main
docker compose build web
docker compose up -d
```

- **Не запускайте** `alembic upgrade head` — схема БД не менялась, лишний запуск не нужен.
- Контейнер `db` не перезапускается, данные сохраняются.
- При необходимости пересобрать и бэкенд: `docker compose build backend` и снова `docker compose up -d`.

---

## 4) На VPS (systemd + Nginx, без Docker)

Если бэкенд и фронт подняты через systemd и Nginx:

```bash
cd ~/apps/learning-portal   # или ваш путь
git pull origin main
```

Только фронтенд (миграции не трогаем):

```bash
cd frontend
npm install
npm run build
sudo systemctl reload nginx
```

Бэкенд перезапускать только если менялись файлы в `backend/`:

```bash
cd ../backend
source venv/bin/activate
pip install -r requirements.txt
sudo systemctl restart learning-backend
```

---

## 5) Когда нужно обновлять БД

Запускайте миграции **только** если в репозитории появились новые файлы в `backend/alembic/versions/` и в коммите явно указано изменение схемы. Тогда перед перезапуском бэкенда:

```bash
# Docker
docker compose run --rm backend python -m alembic upgrade head

# или systemd
cd backend && source venv/bin/activate && alembic upgrade head
```

В этом обновлении (удаление вкладок и полей в финансовой модели) **миграции не требуются**.
