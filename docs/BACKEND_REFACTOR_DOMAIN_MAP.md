# Карта доменов и endpoint'ов backend

Документ подготовлен в рамках **Этапа 1** рефакторинга backend (архитектурный аудит).  
Цель: инвентаризация роутеров и endpoint'ов, отнесение к доменам, выявление смешения и зависимостей.

---

## 1. Целевые домены (по ТЗ)

| Домен | Ответственность |
|-------|-----------------|
| **Auth** | Аутентификация, JWT, текущий пользователь, смена/сброс пароля, приглашения, роли и базовые права |
| **Education** | Ученики, родители, группы, уроки, программы, оценки, характеристики, посещаемость |
| **CRM** | Лиды, воронка, события, post-visit, reinvite, agreed, счета лидам, коммуникации с лидами |
| **Operations** | Задачи, пропуски, отработки, ручные уроки, контроль характеристик, операционные алерты, рабочий контур менеджера |
| **Finance** | Student accounts, платежи учеников, операции банка, журнал, разнесение, дебиторка, финансы по проектам, личные финансы |
| **Management** | Управленческие отчёты, B2B, расчёты, owner funnels, admin tools, настройки системы |

---

## 2. Текущие роутеры и префиксы API

| Роутер | Префикс API | Файл |
|--------|-------------|------|
| auth | `/api/auth` | routers/auth.py |
| users | `/api/users` | routers/users.py |
| students | `/api/students` | routers/students.py |
| groups | `/api/groups` | routers/groups.py |
| programs | `/api/programs` | routers/programs.py |
| grades | `/api/grades` | routers/grades.py |
| characteristics | `/api/characteristics` | routers/characteristics.py |
| trainer_lessons | `/api/trainer-lessons` | routers/trainer_lessons.py |
| student_accounts | `/api/student-accounts` | routers/student_accounts.py |
| reports | `/api/reports` | routers/reports.py |
| search | `/api/search` | routers/search.py |
| telegram | `/api/telegram` | routers/telegram.py |
| settings | `/api/settings` | routers/settings.py |
| abonements | `/api/abonements` | routers/abonements.py |
| **sales** | `/api/sales` | routers/sales.py |
| tasks | `/api` (пути вида /task-templates, /tasks) | routers/tasks.py |
| b2b | `/api` (пути /b2b-schools, …) | routers/b2b.py |
| campaigns | `/api` (пути /campaigns) | routers/campaigns.py |
| owner_funnels | `/api` (пути /owner-funnels) | routers/owner_funnels.py |
| owner_calculations | `/api` (пути /owner/calculations) | routers/owner_calculations.py |
| projects | `/api/projects` | routers/projects.py |
| finance | `/api/finance` | routers/finance.py |
| admin_tools | `/api/admin-tools` | routers/admin_tools.py |

---

## 3. Разметка endpoint'ов по доменам

Для каждого endpoint указаны: **домен** (целевой по ТЗ), **основная сущность**, **побочные эффекты** (если есть), **замечания** (смешение, дублирование, тяжёлая логика в роутере).

---

### 3.1. Auth

| Метод | Путь | Основная сущность | Побочные эффекты | Замечания |
|-------|------|-------------------|------------------|-----------|
| POST | /api/auth/login | User / Token | — | Тонкий, вызов auth.authenticate_user |
| POST | /api/auth/guest | Token | — | Без БД |
| POST | /api/auth/password-reset | — | (alias на request) | Совместимость |
| POST | /api/auth/password-reset/request | User | Код, возможно Telegram | Логика в роутере |
| POST | /api/auth/password-reset/confirm | User | Смена пароля | Логика в роутере |
| POST | /api/auth/set-password-by-invite | User | Установка пароля по токену | Логика в роутере |
| GET | /api/auth/me | User | — | Тонкий |

**Итог:** Домен Auth сосредоточен в одном роутере. Часть сценариев (reset, set-password) можно вынести в auth service.

---

### 3.2. Education

#### students (routers/students.py)

| Метод | Путь | Основная сущность | Побочные эффекты | Замечания |
|-------|------|-------------------|------------------|-----------|
| POST | /api/students/with-parent | Student, User (parent) | Создание родителя при необходимости | Сложный use case в роутере |
| GET | /api/students/parents/search | — | — | Поиск родителей |
| POST | /api/students/ | Student | — | |
| GET | /api/students/ | Student | — | Фильтры по роли |
| GET | /api/students/{id} | Student | — | |
| POST | /api/students/{id}/invite-parent | User (parent) | Письмо/ссылка | Сценарий в роутере |
| GET | /api/students/{id}/attendances | Attendance | — | Связано с Education |
| GET | /api/students/{id}/program-options | Program | — | |
| DELETE | /api/students/{id}/programs/{program_id} | StudentProgram | — | |
| PUT | /api/students/{id} | Student | — | |
| DELETE | /api/students/{id} | Student | — | |
| GET | /api/students/{id}/accounts | StudentAccount | — | **Смешение:** сущность Finance, доступ через Education |
| POST | /api/students/{id}/accounts | StudentAccount | — | **Смешение:** создание счёта — Finance |
| DELETE | /api/students/{id}/accounts/{account_id} | — | — | **Смешение** |

#### groups (routers/groups.py)

| Метод | Путь | Основная сущность | Побочные эффекты | Замечания |
|-------|------|-------------------|------------------|-----------|
| POST | /api/groups/ | Group | — | |
| GET | /api/groups/ | Group | — | |
| GET | /api/groups/{id} | Group | — | |
| PUT | /api/groups/{id} | Group | — | |
| GET/PUT | /api/groups/{id}/lesson-slot-extra-policy | Group | — | |
| POST | /api/groups/{id}/students/{student_id} | — | Привязка ученика к группе | |
| DELETE | /api/groups/{id}/students/{student_id} | — | Отвязка | |
| DELETE | /api/groups/{id} | Group | — | |

#### programs (routers/programs.py)

| Метод | Путь | Основная сущность | Побочные эффекты | Замечания |
|-------|------|-------------------|------------------|-----------|
| POST | /api/programs/ | Program | — | Сложная структура модулей/тем |
| GET | /api/programs/ | Program | — | |
| GET | /api/programs/{id} | Program | — | |
| PUT | /api/programs/{id} | Program | — | |
| POST | archive-topic / unarchive-topic / archive-module / unarchive-module | Program, Topic, Module | — | |
| POST | assign-to-group / assign-to-student | Program | — | |

#### grades (routers/grades.py)

| Метод | Путь | Основная сущность | Побочные эффекты | Замечания |
|-------|------|-------------------|------------------|-----------|
| POST | /api/grades/ | Grade | — | |
| GET | /api/grades/ | Grade | — | |
| GET | /api/grades/{id} | Grade | — | |
| PUT | /api/grades/{id} | Grade | — | |
| GET | /api/grades/student/{id}/progress | — | Агрегат по ученику | Вычисления в роутере |

#### characteristics (routers/characteristics.py)

| Метод | Путь | Основная сущность | Побочные эффекты | Замечания |
|-------|------|-------------------|------------------|-----------|
| POST | /api/characteristics/templates | CharacteristicTemplate | — | |
| GET | /api/characteristics/templates | CharacteristicTemplate | — | |
| POST | /api/characteristics/ | Characteristic | — | |
| POST | /api/characteristics/{id}/submit | Characteristic | Смена статуса | Use case: submit for review |
| PUT | /api/characteristics/{id} | Characteristic | — | |
| POST | /api/characteristics/{id}/approve | Characteristic | — | Use case: approve |
| POST | /api/characteristics/{id}/reject | Characteristic | — | Use case: reject |
| GET | /api/characteristics/ | Characteristic | — | |
| GET | /api/characteristics/{id} | Characteristic | — | |
| GET | /api/characteristics/student/{id}/comparison | — | Агрегат | |
| GET | /api/characteristics/student/{id}/published | Characteristic | — | |

#### trainer_lessons (routers/trainer_lessons.py)

| Метод | Путь | Основная сущность | Побочные эффекты | Замечания |
|-------|------|-------------------|------------------|-----------|
| GET | /api/trainer-lessons/ | LessonSlot | — | По дате |
| POST | /api/trainer-lessons/attendance | Attendance | Списание/учёт | Тяжёлая логика в роутере |
| GET/POST | /api/trainer-lessons/custom-lessons | CustomLesson | — | **По ТЗ:** custom lesson — Operations |
| POST | add-student-to-lesson, remove-student-from-lesson | LessonSlot | — | |
| POST | create-slot, move, cancel, set-trainer | LessonSlot | — | |

**Итог по Education:**  
- Students: провайдит доступ к student accounts (Finance) — граница размыта.  
- Trainer_lessons: посещаемость и слоты — Education; custom-lessons по ТЗ относятся к Operations (ручные уроки/отработки).

---

### 3.3. CRM

Сейчас большая часть CRM живёт в **routers/sales.py**. Ниже — разметка только тех endpoint'ов, которые по ТЗ относятся к CRM.

| Метод | Путь (под /api/sales) | Основная сущность | Побочные эффекты | Замечания |
|-------|------------------------|-------------------|------------------|-----------|
| GET/POST/PUT | /lead-sources | LeadSource | — | Справочник CRM |
| GET/POST/PUT | /lead-statuses | LeadStatusOption | — | |
| GET/POST/PUT | /lead-task-templates | LeadTaskTemplate | — | |
| GET/POST/PUT | /lead-task-statuses | LeadTaskStatusOption | — | |
| GET/POST/PUT | /lead-info-templates | LeadInfoTemplate | — | |
| GET/POST/PUT | /cities | SalesCity | — | |
| GET/POST/PUT | /schools | SalesSchool | — | |
| GET/POST/PUT | /classes | SalesClass | — | |
| GET | /leads | Lead | — | |
| POST | /leads | Lead | — | |
| GET | /leads/send-info-status | — | — | |
| GET/PUT | /leads/{id} | Lead | — | |
| POST | /leads/{id}/convert-to-student | Lead → Student | Создание Student, Parent, привязки | **Критичный use case, смешение CRM→Education** |
| GET/POST | /leads/{id}/tasks | LeadTask | — | |
| POST | /leads/{id}/tasks/{id}/close | LeadTask | — | |
| GET/POST | /leads/{id}/communications | LeadCommunication | — | |
| POST | /leads/{id}/send-info | LeadCommunication | — | |
| POST | /leads/{id}/contact-result | LeadCommunication | — | |
| GET/POST | /leads/{id}/invoices | Invoice | — | Счета лидам |
| GET | /invoices | Invoice | — | |
| POST | /invoices/{id}/send-email | Invoice | Отправка письма | |
| GET/POST/PUT | /events | Event | — | |
| GET/POST | /events/{id}/registrations | EventRegistration | — | |
| POST | cancel/confirm/mark-came/mark-no-show (registrations) | EventRegistration | — | |
| GET | /leads/{id}/event-registrations | EventRegistration | — | |
| POST | /leads/{id}/post-visit-stage | Lead | — | Post-visit сценарий |
| GET | /post-visit/leads | Lead | — | |
| GET | /dashboard | — | Агрегат по лидам/событиям/задачам | **Смешение:** CRM + Operations (задачи) |
| GET | /follow-ups | FollowUpItem | — | Задачи по лидам — граница с Operations |
| GET | /leads/push-stats | — | — | |
| POST | /leads/import-xlsx | Lead | — | |
| GET | /leads/import-template | — | — | |
| GET | /tax-deduction-certificate/status | — | — | Управление/справки |
| POST | /tax-deduction-certificate | — | Генерация PDF | |

**Student cards (анкеты)** — предзапись, конвертация в ученика. По ТЗ: владелец CRM или отдельный pre-student flow; конвертация — отдельный use case.

| Метод | Путь | Основная сущность | Побочные эффекты | Замечания |
|-------|------|-------------------|------------------|-----------|
| GET/POST | /student-cards | StudentCard | — | Pre-student / CRM |
| GET | /student-cards/import-template | — | — | |
| POST | /student-cards/import-xlsx | StudentCard | — | |
| GET/PUT | /student-cards/{id} | StudentCard | — | |
| POST | /student-cards/{id}/convert | StudentCard → Student | Создание Student/Parent, разрешение конфликтов | **Критичный use case** |
| POST | /student-cards/{id}/archive, unarchive | StudentCard | — | |
| POST | /student-cards/{id}/open-parent-cabinet | — | Ссылка для родителя | |
| GET | /students-for-cards | — | Список учеников для выбора при конвертации | |

---

### 3.4. Operations

По ТЗ: задачи, пропуски, отработки, ручные уроки, контроль характеристик, операционные алерты, рабочий контур менеджера.

#### tasks (routers/tasks.py) — префикс /api

| Метод | Путь | Основная сущность | Побочные эффекты | Замечания |
|-------|------|-------------------|------------------|-----------|
| GET/POST | /task-templates | TaskTemplate | — | |
| GET/PUT/DELETE | /task-templates/{id} | TaskTemplate | — | |
| GET | /tasks | Task | — | |
| GET | /tasks/today | Task | — | |
| GET | /tasks/stats | — | Агрегат | |
| GET | /tasks/day-desk-summary, /tasks/day-desk | — | Агрегат для рабочего стола | Тяжёлая логика в роутере |
| POST | /tasks | Task | — | |
| GET/PUT/DELETE | /tasks/{id} | Task | — | |
| PATCH | /tasks/{id}/subtasks/{subtask_id} | TaskSubtask | — | |
| POST | /tasks/{id}/complete | Task | — | |
| PATCH | /tasks/{id}/postpone, pin-today | Task | — | |
| POST | /tasks/{id}/counters/increment | Task | — | |
| GET | /tasks/parent-responses/stats | — | — | |

#### sales.py — часть, относящаяся к Operations

| Метод | Путь | Основная сущность | Побочные эффекты | Замечания |
|-------|------|-------------------|------------------|-----------|
| GET | /lesson-tasks/today, tomorrow, week | LessonTask | — | Задачи на звонки по урокам |
| POST | /lesson-tasks/call-result | LessonTask | Результат звонка | |
| GET | /sales-instructions | SalesInstruction | — | Инструкции для менеджера (можно Management) |
| POST/PUT/DELETE | /sales-instructions, /instruction-images | SalesInstruction | — | |
| GET | /absences | AbsenceFollowUp | — | **Источник истины: Operations** |
| PATCH | /absences/{id} | AbsenceFollowUp | — | |
| POST | /absences/{id}/assign-makeup | AbsenceFollowUp | Назначение отработки | **Use case: assign_makeup_for_absence** |
| GET | /absences/{id}/suggest-makeups | — | Варианты слотов | Зависит от Education (слоты) |
| POST/GET/PUT/DELETE | /custom-lessons | CustomLesson | — | **Ручные уроки / отработки — Operations** |
| GET/POST/DELETE | /program-makeup-compatibility | ProgramMakeupCompatibility | — | Правила отработок |

**Замечание:** freezes и close-by-fact в sales.py привязаны к ученику; freezes — скорее Education/Finance, close-by-fact — сценарий закрытия по факту (Finance/Operations).

---

### 3.5. Finance

#### finance (routers/finance.py) — префикс /api/finance

| Метод | Путь | Основная сущность | Побочные эффекты | Замечания |
|-------|------|-------------------|------------------|-----------|
| GET | /accounts | FinanceAccount | — | |
| GET | /targets | FinanceTarget | — | |
| GET | /articles, POST/PATCH/DELETE | FinanceArticle | — | |
| GET | /ledger/transactions | — | Журнал | |
| GET | /balances | — | Остатки на дату | |
| GET | /pnl | — | P&L | |
| POST | /import | — | Импорт | |
| POST | /personal-operation | — | Личная операция | |
| POST | /manual-transaction | — | Ручная проводка | |
| POST | /migrate-personal-finance | — | Миграция данных | |
| GET | /ledger/bank | — | Банковский журнал | |
| GET | /transactions | — | Список банковских операций | |
| PATCH/DELETE | /transactions/{id} | — | — | |
| POST | /transactions/{id}/apply-student | — | Разнесение на ученика | **Use case: apply_bank_operation_to_student** |

#### student_accounts (routers/student_accounts.py)

| Метод | Путь | Основная сущность | Побочные эффекты | Замечания |
|-------|------|-------------------|------------------|-----------|
| GET | /api/student-accounts/{id} | StudentAccount | — | **Источник истины: Finance** |
| PATCH | /api/student-accounts/{id} | StudentAccount | — | |
| POST | /api/student-accounts/{id}/payment | StudentAccount | Пополнение, пересчёт | **Use case: payment → recalc status** |
| POST | /api/student-accounts/{id}/deduct | StudentAccount | Списание | |
| GET | /api/student-accounts/{id}/transactions | StudentAccountTransaction | — | |
| DELETE | transactions/{id} | StudentAccountTransaction | — | |
| DELETE | /api/student-accounts/{id} | StudentAccount | — | |

#### sales.py — часть, относящаяся к Finance

| Метод | Путь | Основная сущность | Побочные эффекты | Замечания |
|-------|------|-------------------|------------------|-----------|
| GET | /tochka/status, public | — | Статус интеграции | |
| POST | /tochka/import-and-apply | BankTransaction | Импорт + разнесение | **Дублирование/смешение с finance** |
| GET | /bank-transactions | BankTransaction | — | **Источник истины должен быть в Finance** |
| POST | /phone-payment-bindings | — | Привязка телефона к платежу | |
| POST | /bank-transactions/{id}/apply | BankTransaction | Разнесение | **Дублирование apply в finance** |
| PATCH | /bank-transactions/{id}/expense-category | BankTransaction | — | |
| DELETE | /bank-transactions/{id} | BankTransaction | — | |
| POST | /bank-transactions/import-xlsx | BankTransaction | Импорт из файла | |
| GET | /payment-status | — | Вычисляемый статус оплат | **Use case: recalculate_student_payment_status** |
| GET | /payment-status-summary | — | Агрегат просрочек | Сигнал для Operations (задачи) |
| GET/POST/DELETE | /students/{id}/freezes | StudentFreeze | Заморозка абонемента | Граница Education/Finance |
| GET/POST | /students/{id}/close-by-fact-preview, close-by-fact | — | Закрытие по факту | Сценарий Finance |
| GET/DELETE | /account-templates | AccountTemplate | Шаблоны счетов учеников | Finance |

**Итог по Finance:**  
- Логика банка и разнесения размазана: часть в `finance`, часть в `sales` (tochka, bank-transactions, payment-status).  
- Student accounts — отдельный роутер, но создание счёта вызывается из `students` (Education).  
- Необходимо зафиксировать единый источник истины: банковские операции и журнал — в Finance; payment-status и overdue — вычисления Finance, потребление в Operations для задач.

---

### 3.6. Management

| Роутер / путь | Endpoint'ы | Основная сущность | Замечания |
|---------------|------------|-------------------|-----------|
| reports | GET /api/reports/characteristics-compliance | — | Контроль характеристик (отчёт) |
| reports | GET /api/reports/students | — | Отчёт по ученикам |
| reports | GET /api/reports/trainers | — | Отчёт по тренерам |
| reports | GET /api/reports/action-logs | ActionLog | Журнал действий |
| reports | POST /api/reports/export | — | Экспорт XLSX/CSV |
| reports | GET /api/reports/analytics/grade-dynamics/{id} | — | Аналитика |
| search | GET /api/search/ | — | Глобальный поиск (читает все домены) |
| settings | GET/POST /api/settings/logo | — | Логотип |
| settings | GET/POST /api/settings/b2b-districts | — | Настройки B2B |
| abonements | CRUD /api/abonements | Abonement | Справочник (Management/Owner) |
| b2b | Все /api/b2b-schools/*, /api/b2b-projects/* | B2BSchool, B2BProject | B2B-школы, планы, контакты, события |
| campaigns | Все /api/campaigns/* | Campaign, SchoolCampaign | Кампании и привязка школ |
| owner_funnels | Все /api/owner-funnels/* | OwnerFunnelEvent, OwnerFunnelItem | Воронки владельца |
| owner_calculations | Все /api/owner/calculations/* | — | Расчёты по тренерам, ставки, бонусы, выплаты |
| admin_tools | POST /api/admin-tools/reset-trainer-password/{id} | User | Сброс пароля тренера |
| users | CRUD /api/users, invite-parent | User | Пользователи (часть Auth/Management) |

**Итог:** Отчёты, настройки, B2B, кампании, owner funnels, расчёты, admin tools — логично относить к Management. `users` — на границе Auth (текущий пользователь) и Management (управление пользователями).

---

## 4. Карта зависимостей доменов

```
                    ┌─────────────┐
                    │    Auth     │
                    └──────┬──────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
  │  Education  │   │     CRM     │   │  Management  │
  │ (students,  │   │ (leads,     │   │ (reports,    │
  │  groups,    │   │  events,    │   │  b2b,        │
  │  lessons,   │   │  cards→     │   │  settings,   │
  │  programs,  │   │  student)   │   │  users)      │
  │  grades,    │   └──────┬──────┘   └──────┬───────┘
  │  chars)     │          │                 │
  └──────┬──────┘          │                 │
         │                 │                 │
         │    convert      │                 │
         │◄────────────────┘                 │
         │                                    │
         │                 ┌─────────────────┘
         │                 │
         ▼                 ▼
  ┌─────────────┐   ┌─────────────┐
  │ Operations  │   │   Finance    │
  │ (tasks,     │   │ (accounts,  │
  │  absences,  │   │  bank,       │
  │  makeups,   │   │  ledger,     │
  │  custom     │   │  payment     │
  │  lessons)   │   │  status)     │
  └──────┬──────┘   └──────┬───────┘
         │                 │
         │  payment        │  overdue →
         │  overdue        │  manager
         │  tasks          │  tasks
         │◄────────────────┘
```

- **CRM → Education:** конвертация лида в ученика, конвертация student card в ученика.  
- **Education → Operations:** посещаемость (attendance) — источник для создания пропусков (absence); слоты групп — для подбора отработок.  
- **Finance → Operations:** статус оплаты / просрочка — источник задач менеджеру (payment overdue tasks).  
- **Management:** читает/агрегирует данные из остальных доменов (отчёты, B2B, расчёты).

---

## 5. Сводная таблица: текущий роутер → целевой домен

| Текущий роутер | Преобладающий домен | Смешанные/чужие части |
|----------------|---------------------|-------------------------|
| auth | Auth | — |
| users | Auth / Management | — |
| students | Education | Доступ к student accounts (Finance), создание счёта |
| groups | Education | — |
| programs | Education | — |
| grades | Education | — |
| characteristics | Education | — |
| trainer_lessons | Education | custom-lessons → Operations |
| student_accounts | Finance | — |
| reports | Management | — |
| search | Management (cross-domain) | — |
| telegram | Auth / интеграции | — |
| settings | Management | — |
| abonements | Management | — |
| **sales** | **CRM + Operations + Finance** | Лиды/события/карточки (CRM); absences, custom-lessons, lesson-tasks, instructions (Operations); bank-transactions, payment-status, freezes, close-by-fact, tochka (Finance); dashboard — микс |
| tasks | Operations | — |
| b2b | Management | — |
| campaigns | Management | — |
| owner_funnels | Management | — |
| owner_calculations | Management | — |
| projects | Operations / Management | Канбан проектов (родители/ученики по этапам) |
| finance | Finance | — |
| admin_tools | Management | — |

---

## 6. Рекомендации по рефакторингу (кратко)

1. **sales.py:** разделить на три зоны ответственности: CRM (leads, events, cards, invoices, post-visit, dashboard CRM-часть), Operations (absences, custom-lessons, lesson-tasks, program-makeup, instructions), Finance (bank-transactions, tochka, payment-status, freezes, close-by-fact, account-templates). Либо сохранить единый префикс `/api/sales` как compatibility layer, но внутри вызывать доменные сервисы (CRM / Operations / Finance).  
2. **Student accounts:** канонический владелец — Finance. Создание счёта по ученику — либо endpoint в Finance с привязкой к student_id, либо вызов Finance-сервиса из Education при необходимости.  
3. **Конвертации (lead→student, card→student):** оформить как явные use cases в сервисном слое; роутеры только вызывают сервис и возвращают ответ.  
4. **Пропуски и отработки:** источник истины по absence — Operations; создание absence на основе attendance — сценарий с вызовом Education (посещаемость) и созданием сущности в Operations.  
5. **Банк и разнесение:** единый источник истины в Finance; эндпоинты в sales для bank-transactions и tochka со временем проксировать в Finance или помечать deprecated с перенаправлением на /api/finance/...  

Данный документ можно использовать как основу для Этапа 2 (каталог use cases) и для планирования переноса логики в сервисный слой (Этапы 3–5).
