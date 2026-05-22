# Деплой текущих изменений (без поломки БД)

## Что менялось

- **Фронтенд:** воронка (архив, колонка «След мероприятие»), вкладки (Лиды/Воронка/Оплаты/Отчёты скрыты), карточка лида, обязательный источник, страница «Позвать еще раз на мероприятие», No-show → Неявка, кнопка Инвойс с виджетов.
- **Бэкенд и БД:** миграции 0021–0024 (уже есть в репозитории или добавляются в коммите). Миграция 0024 добавляет значения в enum и колонку `no_answer_attempt` (nullable), выполняется через `IF NOT EXISTS` — **безопасна для БД**.

## 1) Локально: коммит и push

В PowerShell из корня репозитория (`c:\Users\direc\Downloads\learning-portal-main`):

```powershell
cd "c:\Users\direc\Downloads\learning-portal-main"

git add learning-portal-main/frontend/src/App.tsx
git add learning-portal-main/frontend/src/components/Layout.tsx
git add learning-portal-main/frontend/src/pages/SalesLeadsPage.tsx
git add learning-portal-main/frontend/src/pages/SalesReinviteEventPage.tsx
git add learning-portal-main/frontend/src/pages/SalesInvoicesPage.tsx
git add learning-portal-main/frontend/src/pages/SalesEventsPage.tsx
git add learning-portal-main/frontend/src/pages/SalesDashboardPage.tsx
git add learning-portal-main/frontend/src/pages/SalesReportsPage.tsx
git add learning-portal-main/backend/alembic/versions/0021_widen_alembic_version_num.py
git add learning-portal-main/backend/alembic/versions/0022_add_sales_cities.py
git add learning-portal-main/backend/alembic/versions/0023_add_sales_schools.py
git add learning-portal-main/backend/alembic/versions/0024_pipeline_statuses_and_no_answer_attempt.py

git status
git commit -m "Sales: воронка (архив, След мероприятие), вкладка Позвать еще раз, Оплаты, Неявка, без отчётов; миграции 0021-0024"
git push origin main
```

Если у вас ещё есть изменения в `learning-portal-main/backend/` (models, routers, schemas) и во фронте (LeadCardPopup, SalesAgreedPage, SalesSettingsPage, api, types), их тоже нужно добавить и включить в тот же коммит:

```powershell
git add learning-portal-main/backend/app/
git add learning-portal-main/frontend/src/
git status
git commit -m "Sales: воронка, Позвать еще раз, Оплаты, Неявка; бэкенд и миграции 0021-0024"
git push origin main
```

## 2) На VPS: обновление без поломки БД

Подключиться к серверу и обновить код и контейнеры. Миграции **нужно** запустить один раз (добавляют поля/enum), они не ломают существующие данные.

```bash
ssh root@80.87.201.25
cd ~/learning-portal
# или: cd /root/learning-portal

git pull origin main

# Безопасно применить миграции (новые значения enum + колонка no_answer_attempt)
docker compose run --rm backend python -m alembic upgrade head

# Пересобрать и запустить
docker compose up -d --build
docker compose ps
```

Проверить: https://tirskix.space/api/health и сайт в браузере.

## Если миграции уже применялись

Если на сервере уже выполняли `alembic upgrade head` после 0024, при следующем деплое снова запускать `alembic upgrade head` можно — лишние миграции не выполнятся, БД не изменится.
