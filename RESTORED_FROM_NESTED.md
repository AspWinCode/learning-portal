# Восстановление изменений из вложенной папки (последние 4 дня)

## В чём была проблема

В репозитории есть только ветка **main**. Все коммиты за последние дни (включая 6e3e75f, f0ed724, e207a50) добавляли код во **вложенную** папку `learning-portal-main/`:

- `learning-portal-main/frontend/src/pages/OwnerFunnelsPage.tsx`
- `learning-portal-main/frontend/src/pages/B2BSchoolsPage.tsx`
- `learning-portal-main/backend/app/routers/owner_funnels.py`
- и т.д.

В **корне** репозитория лежат свои `frontend/` и `backend/` — там этой логики не было, поэтому в продакшене (если деплой шёл из корня) всё «пропало».

## Что было реализовано (по коммитам)

| Коммит | Дата | Что сделано |
|--------|------|-------------|
| **56aa6ea** | ~4 дня назад | Session timeout fix, grades editing, user archiving, leads import, trial booking |
| **e207a50** | B2B | B2B schools, projects, city, contacts, pipeline, post-visit questionnaire, create school page, SalesAgreedPage, SalesPostVisitPage, LeadCardPopup |
| **f0ed724** | Sales | Воронка (архив, След. мероприятие), Оплаты, Недозвон, скрыть Отчёты, миграции 0021–0024, SalesReinviteEventPage, SalesSettingsPage (города/школы), SalesLeadsPage (большие правки) |
| **6e3e75f** | Owner funnels | OwnerFunnelsPage (events, schools, drag&drop, cards), TrainerLessonsPage, owner_funnels router, trainer_lessons router, группы (расписание), миграции 0025–0029 |
| **82e0c9e** (текущий HEAD) | Fixes | LeadStatus enum, task manager, Caddy, GroupStatus — часть правок уже в корне |

## Файлы, которые были только во вложенной папке

**Frontend (learning-portal-main/frontend/):**
- `src/pages/OwnerFunnelsPage.tsx` — воронки владельца (мероприятия, школы, drag&drop, карточки)
- `src/pages/B2BSchoolsPage.tsx` — список B2B-школ
- `src/pages/B2BSchoolCreatePage.tsx` — создание школы B2B
- `src/pages/TrainerLessonsPage.tsx` — уроки тренера, календарь
- `src/pages/SalesAgreedPage.tsx`, `SalesPostVisitPage.tsx`, `SalesReinviteEventPage.tsx`
- Обновлённые: `SalesLeadsPage.tsx`, `SalesSettingsPage.tsx`, `GroupsPage.tsx`, `App.tsx`, `Layout.tsx`, `api.ts`, `types/index.ts`, `LeadCardPopup.tsx`

**Backend (learning-portal-main/backend/):**
- `app/routers/b2b.py` — API B2B-школ и проектов
- `app/routers/owner_funnels.py` — API воронок владельца
- `app/routers/trainer_lessons.py` — API уроков тренера
- Обновлённые: `main.py`, `models.py`, `schemas.py`, `routers/groups.py`, `routers/sales.py`, и др.
- Миграции 0021–0029 (в т.ч. lead statuses, sales cities/schools, group schedule, owner funnel items)

## Что сделано при восстановлении

- Из коммита **6e3e75f** файлы по путям `learning-portal-main/...` скопированы в корень: `frontend/`, `backend/`.
- Так в корне проекта снова появляются воронки, B2B-школы, уроки тренера, обновлённые страницы Sales и API.

## Миграции БД

На продакшене мог остаться только **0014** (task_manager). Миграции 0021–0029 добавляют:

- 0021: расширение `alembic_version.version_num`
- 0022: sales_cities
- 0023: sales_schools  
- 0024: pipeline statuses, no_answer_attempt
- 0025: group_schedule, lesson_attendance
- 0026: GroupStatus lowercase
- 0027–0029: owner_funnel_items, card_data, events

Перед применением миграций на проде сделайте бэкап БД. Если текущая версия в `alembic_version` не 0014, согласуйте цепочку миграций (возможны конфликты с уже применёнными 002x).
