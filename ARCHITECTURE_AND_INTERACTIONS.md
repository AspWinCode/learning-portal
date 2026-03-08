# Архитектура и взаимодействие страниц

Документ описывает общую архитектуру приложения (frontend + backend), потоки данных, навигацию и то, как страницы связаны друг с другом.

---

## 1. Общая архитектура

```
┌─────────────────────────────────────────────────────────────────┐
│  Браузер (React SPA)                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ AuthProvider  │  │ React Router │  │ Layout + страницы    │   │
│  │ (user, token) │  │ (маршруты)   │  │ (компоненты)         │   │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘   │
│         │                  │                     │               │
│         └──────────────────┴─────────────────────┘               │
│                            │                                     │
│                    ┌───────▼───────┐                             │
│                    │ api (axios)   │  JWT в Header, 401 → /login │
│                    └───────┬───────┘                             │
└────────────────────────────┼────────────────────────────────────┘
                              │ HTTP/JSON
┌─────────────────────────────▼────────────────────────────────────┐
│  Backend (FastAPI)                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐    │
│  │ CORS         │  │ Роутеры      │  │ auth (JWT, get_db)  │    │
│  │ Middleware   │  │ /api/...     │  │ Зависимости         │    │
│  └──────────────┘  └──────┬───────┘  └──────────┬───────────┘    │
│                            │                     │                │
│                    ┌───────▼─────────────────────▼───────┐      │
│                    │ SQLAlchemy SessionLocal (PostgreSQL) │      │
│                    └──────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────────────┘
```

- **Frontend:** одна SPA (React 18, TypeScript). Токен в `localStorage`, при каждом запросе — заголовок `Authorization: Bearer <token>`. При 401 axios-перехватчик сбрасывает токен и делает `window.location.href = '/login'`.
- **Backend:** одно FastAPI-приложение. Роутеры подключены под префиксами `/api/...`. Аутентификация — OAuth2 Password (JWT). Сессия БД создаётся через dependency `get_db()` и закрывается после обработки запроса.

---

## 2. Frontend: структура и слои

### 2.1. Дерево компонентов (упрощённо)

```
index.tsx
  └─ ErrorBoundary
       └─ App
            └─ ThemeProvider (MUI)
                 └─ AuthProvider
                      └─ Router (BrowserRouter)
                           └─ Routes
                                ├─ /login, /set-password, /anketa/specialist  (без Layout)
                                └─ остальные
                                     └─ PrivateRoute
                                          └─ Layout (боковое меню + AppBar)
                                               └─ children (контент страницы)
```

- **ErrorBoundary:** ловит ошибки рендера в поддереве, показывает сообщение и кнопку «Обновить страницу».
- **AuthProvider:** хранит `user`, `token`, `login`, `logout`, `loginAsGuest`, `loading`, `isAuthenticated`. Токен при инициализации читается из `localStorage`; при наличии токена вызывается `authApi.getCurrentUser()`.
- **PrivateRoute:** если `!isAuthenticated` → редирект на `/login`; если заданы `allowedRoles` и роль пользователя не входит (с учётом того, что `admin` включает `owner`) → экран 403.
- **Layout:** обёртка для всех защищённых страниц. Состав пунктов меню и элементы шапки зависят от `user.role` (см. PAGES_DETAILED.md).

### 2.2. Контексты и глобальное состояние

| Контекст | Где используется | Назначение |
|----------|------------------|------------|
| **AuthContext** | Везде (PrivateRoute, Layout, страницы) | Текущий пользователь, токен, вход/выход. Единственный «глобальный» контекст для всей авторизации. |
| **PersonalFinanceContext** | PersonalFinancePage (и вкладки внутри) | Статьи, операции, правила распознавания для раздела «Личные финансы». Часть данных в localStorage. |

Отдельного глобального store (Redux/Zustand) нет: каждая страница сама запрашивает данные через API и хранит их в локальном state. Общие сущности (например, ученик) при переходе между страницами передаются через URL (id) и заново подгружаются.

### 2.3. API-слой (frontend/src/services/api.ts)

- Один экземпляр **axios** с `baseURL` из `REACT_APP_API_URL` (или текущий origin).
- **Request interceptor:** подставляет `Authorization: Bearer <token>` из `localStorage`.
- **Response interceptor:** при 401 удаляет токен и перенаправляет на `/login`.
- Методы сгруппированы по доменам: `authApi`, `usersApi`, `studentsApi`, `groupsApi`, `programsApi`, `gradesApi`, `characteristicsApi`, `reportsApi`, `salesApi`, `financeApi`, `projectsApi`, `tasksApi`, `trainerLessonsApi`, `studentAccountsApi`, `studentCardsApi`, `settingsApi`, `telegramApi`, и т.д. Страницы импортируют нужные объекты и вызывают методы без промежуточного слоя (например, хуков с кешем).

### 2.4. Маршрутизация

- **React Router v6:** `BrowserRouter`, `Routes`, `Route`. Вложенных роутов нет: каждая страница — отдельный `Route` с путём и компонентом.
- **Редиректы:** часть маршрутов задана как `<Navigate to="..." replace />` (например, `/sales/follow-ups` → `/sales/leads?overdue_only=1`).
- **Роль-зависимый редирект:** корневой путь `/` отдаёт компонент `DefaultRedirect`, который по `user.role` делает `Navigate` на `/dashboard`, `/parent-dashboard`, `/programs` или `/tasks`.

---

## 3. Backend: структура и слои

### 3.1. Структура каталогов

```
backend/app/
  main.py           # FastAPI app, CORS, middleware, подключение роутеров
  database.py       # engine, SessionLocal, get_db
  auth.py           # JWT, verify_password, get_current_user, get_current_user_optional
  models.py         # SQLAlchemy модели (User, Student, Group, ...)
  schemas.py        # Pydantic-схемы для запросов/ответов
  routers/          # Роутеры по доменам
  services/         # Бизнес-логика (tochka_client, telegram, payment_overdue_tasks, ...)
```

### 3.2. Роутеры и префиксы

| Префикс | Роутер | Назначение |
|---------|--------|------------|
| `/api/auth` | auth | login, guest, me, password-reset, set-password-by-invite |
| `/api/users` | users | CRUD пользователей, invite-parent |
| `/api/students` | students | CRUD учеников, program-options, invite-parent, attendances |
| `/api/groups` | groups | CRUD групп, расписание, состав |
| `/api/programs` | programs | CRUD программ и версий |
| `/api/grades` | grades | Оценки, прогресс ученика |
| `/api/characteristics` | characteristics | Шаблоны, характеристики, согласование |
| `/api/reports` | reports | Отчёты, экспорт, контроль характеристик, журнал |
| `/api/search` | search | Глобальный поиск |
| `/api/telegram` | telegram | Привязка Telegram (код, deep link) |
| `/api/settings` | settings | Настройки (например, логотип) |
| `/api/abonements` | abonements | Абонементы |
| `/api/sales` | sales | Лиды, события, инструкции, пропуски, оплаты, счета, дашборд, настройки CRM, студенческие карточки, банк и т.д. |
| `/api/trainer-lessons` | trainer_lessons | Слоты занятий, посещаемость, кастомные уроки |
| `/api/student-accounts` | student_accounts | Счета учеников, платежи, списания |
| `/api/projects` | projects | Проекты, этапы, канбан, карточки |
| `/api/finance` | finance | Журнал, счета, транзакции, P&L, импорт, личные операции |
| `/api` (часть путей) | tasks, b2b, campaigns, owner_funnels, owner_calculations | Задачи, B2B, кампании, воронки, расчёты |
| `/api/admin-tools` | admin_tools | Админ-действия (например, сброс пароля тренера) |

Зависимости эндпоинтов: `get_db()` для сессии БД, `get_current_user()` (или optional) для JWT. Роли проверяются в роутере (например, только owner может вызывать определённые методы).

### 3.3. БД и фоновые задачи

- **PostgreSQL:** подключение через `DATABASE_URL`. Миграции — Alembic (`alembic upgrade head`), при старте приложения опционально запускаются автоматически (`RUN_MIGRATIONS_ON_STARTUP`).
- **Фоновые задачи (APScheduler):** в `main.py` при старте планируются, в частности: импорт выписки Точка Банк (каждые 10 мин), создание задач по просрочке оплат (ежедневно), автоповышение класса учеников (1 сентября), утренние задачи по ссылкам на отработки.

---

## 4. Взаимодействие страниц: навигация и URL-параметры

Страницы связаны через **навигацию** (`navigate()`) и **URL query-параметры**. Переход по ссылке часто передаёт идентификатор сущности; целевая страница читает параметр и открывает popup/drawer или выделяет запись.

### 4.1. Схема переходов (кто куда ведёт)

```
Login → / (DefaultRedirect по роли)
Dashboard (owner) → вкладки ведут к тому же URL (локальный state)

Sales:
  SalesDashboard    → /sales/leads?leadId=… | /sales/events | /sales/reinvite-event | /sales/agreed
                      /sales/leads?status=… | /sales/leads?overdue_only=1
  SalesLeadsPage    ← открытие по ?leadId=, ?open=, ?create=1, ?q=, ?status_filter=, ?overdue_only=1
  SalesEventsPage   → /sales/leads?detail=lead_id (карточка лида)
  SalesPostVisit    → /sales/agreed | /sales/leads?open=lead_id
  SalesReinvite     → /sales/leads?open=lead_id
  SalesAgreed       → /sales/leads?open=lead_id | /sales/invoices
  SalesInvoices     → /sales/leads?leadId=…
  SalesAbsences     → /sales/manual-lessons?create=1&absence_id=…&student_id=…
  SalesDebts        → /students?detail=student_id

Students:
  StudentsPage      ← ?tab=ankety | ?tab=parents | ?tab=trainers | ?detail=id | ?cardId=id
  StudentDetailPopup → /students?tab=ankety&cardId=… (открыть анкету из карточки ученика)
  AnketyPage        → /students?detail=student_id (после конвертации)

Projects:
  ProjectsPage      → /projects/:projectId (канбан)
  ProjectKanbanPage → использует StudentDetailPopup (studentId из карточки)

B2B:
  B2BSchoolCreate   → /b2b-schools?open=school_id
  B2BSchoolsPage    ← ?tab=new | ?open=id

Уроки:
  TrainerLessonsPage ← ?date=YYYY-MM-DD
  ManualLessonsPage  ← ?create=1&absence_id=…&student_id=… (из Пропусков)

Личные финансы:
  PersonalFinancePage ← ?tab=… (вкладка)
```

### 4.2. Важные query-параметры по страницам

| Страница | Параметр | Поведение |
|----------|----------|-----------|
| **StudentsPage** | `tab` | students \| ankety \| parents \| trainers — выбор вкладки. |
| | `detail` | ID ученика — открывается StudentDetailPopup. |
| | `cardId` | ID карточки (анкеты) — переключение на вкладку «Анкеты» и открытие формы редактирования анкеты. |
| **SalesLeadsPage** | `leadId`, `open`, `detail` | Открытие карточки лида (popup/drawer). |
| | `create=1` | Открытие формы создания лида. |
| | `q`, `status_filter`, `overdue_only` | Предзаполнение фильтров списка. |
| **TrainerLessonsPage** | `date` | Выбранная дата (YYYY-MM-DD). |
| **ManualLessonsPage** | `create=1`, `absence_id`, `student_id` | Открытие формы создания ручного урока с привязкой к пропуску и ученику. |
| **B2BSchoolsWorkPage** | `tab` | list \| new. |
| **B2BSchoolsPage** (CampaignsTab) | `open` | ID школы — открытие редактирования/просмотра. |
| **PersonalFinancePage** | `tab` | Выбор вкладки (dashboard, operations, articles, recognition и т.д.). |

Таким образом, **страницы взаимодействуют через URL**: переход «со списка лидов в карточку ученика» — это `navigate('/students?detail=123)`, а «из пропусков в ручной урок» — `navigate('/sales/manual-lessons?create=1&absence_id=...&student_id=...')`.

---

## 5. Общие (переиспользуемые) компоненты

Эти компоненты используются на нескольких страницах и связывают их по смыслу.

| Компонент | Где используется | Назначение |
|-----------|------------------|------------|
| **Layout** | Все защищённые маршруты | Боковое меню (по роли), шапка с логотипом, поиск (у sales), меню пользователя. Рендерит `children` (тело страницы). |
| **PrivateRoute** | Все приватные Route в App.tsx | Проверка авторизации и ролей, редирект на login или 403. |
| **StudentDetailPopup** | StudentsPage, ProjectKanbanPage | Модальное окно с деталями ученика: ФИО, группа, посещаемость, пропуски, счета, заморозки, приглашение родителя. Может вызывать `onOpenAnketa(cardId)` → переход на анкеты с `cardId`. |
| **LeadCardPopup** | SalesLeadsPage | Карточка лида: контакты, задачи, счета, коммуникации, конвертация в ученика (после конвертации — переход на `/students?detail=student_id`). |
| **AnketaFormDrawer** | StudentsPage (вкладка «Анкеты») | Drawer для создания/редактирования анкеты (студенческой карточки). После конвертации можно открыть ученика (detail). |

Общий поток «лид → ученик»: на странице лидов пользователь конвертирует лида → API создаёт ученика → фронт делает `navigate('/students?detail=student_id')` → на StudentsPage открывается StudentDetailPopup с этим учеником.

---

## 6. Типовые сценарии (потоки данных)

### 6.1. Вход и первый экран

1. Пользователь открывает `/login`, вводит email/пароль (или «Войти как гость»).
2. Frontend: `authApi.login()` / `authApi.guestLogin()` → в ответе `access_token` → сохраняется в `localStorage` и в state AuthContext, вызывается `authApi.getCurrentUser()` → в state записывается `user`.
3. `navigate('/')` → рендерится `DefaultRedirect` → по `user.role` выполняется `Navigate` на `/dashboard`, `/parent-dashboard`, `/programs` или `/tasks`.
4. Рендерится выбранная страница внутри `Layout`; меню строится по роли.

### 6.2. Sales: от лида до ученика

1. **Sales Dashboard** → клик по задаче/лиду → `navigate('/sales/leads?leadId=...')`.
2. **SalesLeadsPage** при монтировании/обновлении читает `location.search`, при наличии `leadId`/`open`/`detail` открывает LeadCardPopup с этим лидом.
3. В карточке лида: «Конвертировать в ученика» → вызов API конвертации → в ответе `student_id` → `navigate('/students?detail=student_id')`.
4. **StudentsPage** по `detail` открывает StudentDetailPopup с данным учеником.

### 6.3. Пропуск → отработка

1. **SalesAbsencesPage**: по пропуску нажимают «Подобрать отработку» → диалог с вариантами слотов. Если подходящего нет — «Создать ручной урок».
2. `navigate('/sales/manual-lessons?create=1&absence_id=...&student_id=...')`.
3. **ManualLessonsPage** в `useEffect` читает `create`, `absence_id`, `student_id` из `searchParams`, открывает форму создания урока с типом «Отработка» и предзаполненным учеником и привязкой к пропуску.

### 6.4. Анкета → ученик (StudentsPage)

1. Вкладка «Анкеты»: список карточек (student cards). Открытие по `?cardId=...` (например, из письма или из StudentDetailPopup по ссылке «Анкета»).
2. **AnketaFormDrawer** в режиме редактирования или конвертации. При конвертации возможен конфликт (уже есть ученик/родитель) — выбор варианта и повторный вызов API.
3. После успешной конвертации: `navigate('/students?detail=res.student_id')` или открытие того же popup по `setStudentDetailId(res.student_id)`.

### 6.5. Оплаты / банк → ученик

1. **SalesDebtsPage** (вкладка «Операции банка»): разнесение операции на ученика — выбор ученика в диалоге, вызов API.
2. В таблице статусов оплат или в списке операций есть кнопка «Перейти к ученику» → `navigate('/students?detail=student_id')`.

Эти сценарии показывают, что **связь между страницами — через URL и навигацию**, а не через общий store. Состояние «какой лид/ученик открыт» живёт в URL (query) или в локальном state страницы, которая читает query при монтировании.

---

## 7. Безопасность и права

- **Frontend:** маршруты обёрнуты в `PrivateRoute` с `allowedRoles`. Меню в Layout строится по роли — пользователь не видит пунктов, к которым у него нет доступа. Это защита от случайного перехода и удобство; полноценная проверка — на backend.
- **Backend:** эндпоинты используют `get_current_user()` (и при необходимости проверку роли). Тренер получает только свои группы/ученики, родитель — только своих детей; список учеников, отчёты, финансы и т.д. фильтруются по роли на стороне сервера.

---

## 8. Резюме

| Аспект | Реализация |
|--------|------------|
| **Архитектура** | SPA (React) + REST API (FastAPI) + PostgreSQL. JWT в заголовке, один домен или CORS. |
| **Состояние frontend** | AuthContext глобально; страницы — локальный state + запросы к API; PersonalFinanceContext — только для раздела личных финансов. |
| **Взаимодействие страниц** | Навигация (`navigate`) + URL query (`detail`, `leadId`, `tab`, `create`, `absence_id`, `student_id` и т.д.). Общие попапы/drawer (StudentDetailPopup, LeadCardPopup, AnketaFormDrawer) открываются по id из URL или из локального state после перехода. |
| **Потоки** | Лид → конвертация → ученик (переход на Students + popup). Пропуск → ручной урок (переход на ManualLessons с query). Анкета → конвертация → ученик (тот же Students + detail). Оплаты/банк → привязка к ученику и переход на Students?detail=. |
| **Backend** | Модульные роутеры, зависимость БД и текущего пользователя, проверка прав в эндпоинтах, фоновые задачи через APScheduler. |

Этого достаточно, чтобы понимать, как устроено приложение и как страницы и разделы связаны между собой при доработках и отладке.
