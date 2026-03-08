# Каталог ключевых backend use cases

Документ подготовлен в рамках **Этапа 2** рефакторинга backend.  
Цель: описать и формализовать ключевые сценарные сценарии (use cases), которые должны быть вынесены в сервисный слой и покрыты тестами.

Связь с картой доменов: см. [BACKEND_REFACTOR_DOMAIN_MAP.md](BACKEND_REFACTOR_DOMAIN_MAP.md).

---

## 1. Конвертация лида в ученика (Lead → Student)

**Идентификатор:** `convert_lead_to_student`

**Домен:** CRM → Education (междоменный).

**Текущее место:** `POST /api/sales/leads/{lead_id}/convert-to-student` (routers/sales.py).

**Входные данные:**
- `lead_id` (path);
- опционально: привязка к существующему родителю / существующему ученику (тело запроса при разрешении конфликтов).

**Действия (целевой сценарий):**
1. Загрузить лида; проверить права и статус.
2. Определить или создать родителя (User, role=parent) по данным лида (ФИО, телефон, email).
3. Создать ученика (Student), привязать к родителю, группе/программе при наличии.
4. При необходимости создать student account (Finance) по шаблону.
5. Обновить лида (статус, связь с student_id при наличии в модели).
6. Записать действие в журнал (action log).
7. Вернуть идентификатор созданного ученика и родителя.

**Побочные эффекты:**
- Создание/обновление User (parent), Student, возможно StudentAccount.
- Обновление Lead.
- Запись в action log.

**Источники истины:** Lead — CRM; Student, Parent — Education; StudentAccount — Finance (создание через Finance-сервис или согласованный API).

**Рекомендация:** Выделить use case в сервис, например `LeadConversionService.convert_to_student(lead_id, options)`. Роутер только валидирует вход, вызывает сервис, возвращает DTO.

---

## 2. Конвертация анкеты (student card) в ученика (Anketa → Student)

**Идентификатор:** `convert_student_card_to_student`

**Домен:** CRM (pre-student) → Education; при конфликтах — разрешение с участием существующих Student/Parent.

**Текущее место:** `POST /api/sales/student-cards/{card_id}/convert` (routers/sales.py).

**Входные данные:**
- `card_id` (path);
- опционально: `use_existing_parent_id`, `use_existing_student_id` (при разрешении конфликтов).

**Действия (целевой сценарий):**
1. Загрузить student card (анкету); проверить права и статус (не конвертирована, не отменена).
2. Проверить конфликты: существующий родитель с таким телефоном/email, существующий ученик с таким ФИО/родителем.
3. Если конфликт — вернуть структуру конфликта и ожидать явного выбора (existing_parent / existing_student / new_student).
4. В зависимости от выбора:
   - создать нового родителя и ученика;
   - привязать к существующему родителю и создать ученика;
   - обновить существующего ученика и привязать к родителю.
5. Обновить карточку (статус «конвертирована», привязка к student_id).
6. При необходимости создать student account.
7. Записать в action log.
8. Вернуть идентификатор ученика (и родителя при создании).

**Побочные эффекты:**
- Создание/обновление User (parent), Student, StudentCard; возможно StudentAccount.
- Запись в action log.

**Источники истины:** StudentCard — CRM/pre-student; Student, Parent — Education; StudentAccount — Finance.

**Рекомендация:** Use case `StudentCardConversionService.convert(card_id, resolution?)`. Разрешение конфликтов — часть сценария или отдельный шаг (get_conflicts → resolve → convert).

---

## 3. Пропуск → подбор отработки (Assign makeup for absence)

**Идентификатор:** `assign_makeup_for_absence`

**Домен:** Operations (использует данные Education о слотах групп).

**Текущее место:** `POST /api/sales/absences/{absence_id}/assign-makeup` (routers/sales.py).

**Входные данные:**
- `absence_id` (path);
- тело: `makeup_group_id`, `makeup_lesson_date` (и при необходимости время/слот).

**Действия (целевой сценарий):**
1. Загрузить пропуск (AbsenceFollowUp); проверить, что этап допускает назначение отработки (missed, missed_makeup).
2. Проверить совместимость программы группы пропуска и группы отработки (program-makeup-compatibility).
3. Создать или связать запись об отработке (например, привязка к слоту или создание custom_lesson типа makeup).
4. Обновить этап пропуска (assigned / made_up в зависимости от правил).
5. При необходимости создать задачу менеджеру или уведомление.
6. Вернуть обновлённый пропуск.

**Побочные эффекты:**
- Обновление AbsenceFollowUp;
- создание/связь CustomLesson или запись о назначенной отработке;
- возможно создание Task (Operations).

**Источники истины:** Absence — Operations; слоты групп — Education; совместимость программ — Operations (справочник).

**Рекомендация:** Use case `AbsenceService.assign_makeup(absence_id, makeup_group_id, makeup_lesson_date)`. Подбор вариантов слотов — отдельный метод или сервис, читающий Education (расписание) и Operations (compatibility).

---

## 4. Пропуск → создание ручного урока (Create manual lesson for absence)

**Идентификатор:** `create_manual_lesson_for_absence`

**Домен:** Operations (ручные уроки — отработки/доп. платные/пробные).

**Текущее место:** `POST /api/sales/custom-lessons` с привязкой к absence (фронт передаёт absence_id при создании отработки из экрана пропусков).

**Входные данные:**
- параметры ручного урока: дата, время, тренер, тип (makeup / paid_extra / free_trial), ученики;
- для типа makeup: список пар (student_id, absence_id) для закрытия конкретного пропуска.

**Действия (целевой сценарий):**
1. Создать запись CustomLesson (дата, время, тренер, тип, привязка к absence при наличии).
2. Для каждого ученика и при наличии absence_id — обновить пропуск (этап: отработка назначена или отработка проведена).
3. При необходимости создать посещаемость (attendance) в Education для учёта.
4. Вернуть созданный custom lesson.

**Побочные эффекты:**
- Создание CustomLesson;
- обновление AbsenceFollowUp по привязанным пропускам;
- возможно создание записей посещаемости (Education).

**Источники истины:** CustomLesson — Operations; Absence — Operations; Attendance — Education (если ведётся учёт).

**Рекомендация:** Use case `ManualLessonService.create_manual_lesson(params, absence_assignments?)`. Роутер только маппит тело запроса и вызывает сервис.

---

## 5. Банковская операция → привязка к ученику (Apply bank operation to student)

**Идентификатор:** `apply_bank_operation_to_student`

**Домен:** Finance.

**Текущие места:**
- `POST /api/finance/transactions/{transaction_id}/apply-student` (routers/finance.py);
- `POST /api/sales/bank-transactions/{transaction_id}/apply` (routers/sales.py).

**Входные данные:**
- идентификатор банковской операции (transaction_id / bank_operation_id);
- идентификатор ученика (student_id) и при необходимости счёта (account_id);
- опционально: сумма, комментарий.

**Действия (целевой сценарий):**
1. Загрузить банковскую операцию; проверить, что она ещё не разнесена (или допустить переразнесение по правилам).
2. Определить student account (по ученику и при необходимости по шаблону/типу).
3. Создать проводку: зачисление на student account (payment), связь с банковской операцией в журнале (ledger).
4. Обновить статус банковской операции (разнесена, привязка к student_id/account_id).
5. Пересчитать следующую дату оплаты и статус по счёту (payment status).
6. Вернуть обновлённую операцию и/или обновлённый счёт.

**Побочные эффекты:**
- Создание StudentAccountTransaction (или аналога в finance ledger);
- обновление банковской операции (разнесение);
- пересчёт payment status по ученику/счёту;
- возможно создание задачи менеджеру при снятии просрочки (Operations).

**Источники истины:** Bank transaction, ledger — Finance; StudentAccount — Finance; payment status — вычисляемое в Finance.

**Рекомендация:** Единый use case в Finance: `BankOperationService.apply_to_student(transaction_id, student_id, account_id?, amount?, note?)`. Роутер в sales при рефакторинге может проксировать в этот сервис для сохранения совместимости API.

---

## 6. Платёж ученика → пересчёт статуса оплаты (Recalculate student payment status)

**Идентификатор:** `recalculate_student_payment_status`

**Домен:** Finance.

**Текущее место:** Логика размазана: при payment/deduct в student_accounts, при apply bank в sales/finance; чтение — GET /api/sales/payment-status, GET /api/sales/payment-status-summary.

**Входные данные:**
- student_id или account_id (или оба);
- опционально: дата, на которую считать (as_of).

**Действия (целевой сценарий):**
1. По транзакциям счёта (и правилам абонемента/периода) вычислить:
   - следующую дату оплаты (next_payment_date);
   - статус: ok / due_soon / overdue / unpaid.
2. Сохранить или вернуть вычисленное состояние (без сохранения, если статус только вычисляемый кэш).
3. При смене статуса на overdue — триггер для создания задачи менеджеру (см. use case 8).

**Побочные эффекты:**
- Возможно обновление полей next_payment_date в StudentAccount или в отдельной таблице статусов;
- при появлении/изменении просрочки — вызов сценария создания задачи (Operations).

**Источники истины:** StudentAccount, транзакции — Finance. Статус — производная от них.

**Рекомендация:** Сервис `PaymentStatusService.recalculate(student_id | account_id, as_of?)`. Вызывать после каждого payment, deduct, apply_bank_operation. Отдельный endpoint для массового пересчёта (например, ночной job) допустим.

---

## 7. Сдача характеристики → согласование → публикация (Submit / Approve / Reject characteristic)

**Идентификатор:** `submit_characteristic_for_review`, `approve_characteristic`, `reject_characteristic`

**Домен:** Education (характеристика); контроль сроков может отражаться в Management/Operations.

**Текущее место:**  
- `POST /api/characteristics/{id}/submit` (routers/characteristics.py);  
- `POST /api/characteristics/{id}/approve`;  
- `POST /api/characteristics/{id}/reject`.

**Входные данные:**
- submit: characteristic_id; approve/reject: characteristic_id, для reject — комментарий (тело).

**Действия (целевой сценарий):**

**Submit:**
1. Проверить, что характеристика в статусе draft/rejected и принадлежит тренеру (или права на отправку).
2. Установить статус «на согласовании» (pending).
3. Опционально: создать задачу или напоминание согласующему (Operations/Management).

**Approve:**
1. Проверить права (admin/owner) и статус (pending).
2. Установить статус approved, зафиксировать дату публикации.
3. Убрать из списка «на согласовании» в отчётах.

**Reject:**
1. Проверить права и статус.
2. Установить статус rejected, сохранить комментарий.
3. Характеристика снова доступна тренеру для редактирования.

**Побочные эффекты:**
- Обновление Characteristic (status, approved_at, reject_comment);
- возможно создание Task для согласующего (если реализовано).

**Источники истины:** Characteristic — Education.

**Рекомендация:** Use cases в `CharacteristicService`: `submit_for_review(id)`, `approve(id)`, `reject(id, comment)`. Роутеры — тонкие обёртки.

---

## 8. Просрочка оплаты → генерация менеджерской задачи (Create manager tasks for overdue payments)

**Идентификатор:** `create_manager_tasks_for_overdue_payments`

**Домен:** Finance (вычисление просрочки) → Operations (создание задач).

**Текущее место:** Фоновый job в main.py (`payment_overdue_tasks`); сервис `app/services/payment_overdue_tasks.py`.

**Входные данные:**
- дата/время запуска (по расписанию: раз в день);
- параметры правил: через сколько дней после next_payment_date создавать задачу, период повтора.

**Действия (целевой сценарий):**
1. Получить список учеников/счетов с статусом overdue (или due_soon по правилам), у которых next_payment_date в прошлом на N дней.
2. Для каждого такого ученика проверить, есть ли уже открытая задача типа «просрочка оплаты» (по шаблону/категории).
3. Если нет — создать Task (Operations), привязанную к ученику/родителю, с дедлайном и текстом.
4. Записать в лог количество созданных задач.

**Побочные эффекты:**
- Создание Task (Operations);
- возможно обновление метки «задача создана» в Finance или в отдельной таблице, чтобы не дублировать.

**Источники истины:** Payment status — Finance; Task — Operations.

**Рекомендация:** Оставить в jobs; внутри вызывать `PaymentStatusService` (или репозиторий) для получения списка просроченных и `TaskService` (Operations) для создания задач. Не держать бизнес-правила (через сколько дней, какой шаблон задачи) в job — вынести в конфиг или в сервис.

---

## 9. Событие → поствизит → следующий шаг по лиду (Event → Post-visit → Lead next step)

**Идентификатор:** `event_post_visit_lead_next_step`

**Домен:** CRM.

**Текущее место:**  
- `POST /api/sales/leads/{lead_id}/post-visit-stage` (routers/sales.py);  
- `GET /api/sales/post-visit/leads` — список лидов для «дожатия».

**Входные данные:**
- post-visit-stage: lead_id, тело (новый этап/статус, комментарий, следующая дата контакта и т.д.).
- post-visit/leads: фильтры (дата события, статус регистрации).

**Действия (целевой сценарий):**
1. Определить лидов, посетивших мероприятие (event registration, mark_came) и не переведённых в следующий этап.
2. Для выбранного лида: обновить статус/этап (post_visit_stage), записать коммуникацию (contact_result), при необходимости создать задачу (LeadTask) на следующий контакт.
3. Список «post-visit leads» — выборка лидов по событиям и статусам для экрана «Дожать на обучение».

**Побочные эффекты:**
- Обновление Lead;
- создание/обновление LeadCommunication, LeadTask.

**Источники истины:** Lead, Event, EventRegistration — CRM.

**Рекомендация:** Use case `LeadPostVisitService.update_stage(lead_id, body)` и `LeadPostVisitService.list_leads_for_follow_up(filters)`. Роутеры только валидируют и вызывают сервис.

---

## 10. Ученик → родитель → счета → статусы (Student → Parent → Accounts → Statuses)

**Идентификатор:** не один use case, а цепочка сущностей и сценариев.

**Домены:** Education (Student, Parent); Finance (StudentAccount, платежи, статусы).

**Ключевые точки:**
- Создание ученика с родителем: уже описано в students (with-parent) и в конвертациях.
- Приглашение родителя: `POST /api/students/{id}/invite-parent` — генерация ссылки/токена, отправка (Auth/Education или интеграции).
- Создание счёта ученику: сейчас из students вызывается создание StudentAccount (Finance). Целевой вариант: явный use case в Finance, например `StudentAccountService.create_for_student(student_id, template_id?, name?)`, вызываемый из Education-роутера или из единого «создать ученика» сценария.
- Просмотр статусов оплаты по ученикам: чтение через Finance (payment-status), отображение в одном рабочем окне менеджера — это слой представления; источник истины остаётся в Finance.

**Рекомендация:** Зафиксировать в доменной карте: Student, Parent — Education; StudentAccount, транзакции, payment status — Finance. Единое рабочее окно менеджера может собирать данные из нескольких доменов через отдельный слой агрегации (или несколько вызовов API без изменения источников истины).

---

## 11. Дополнительные сценарии (кратко)

| Идентификатор | Описание | Домен | Текущее место |
|---------------|----------|--------|----------------|
| **create_attendance** | Сохранение посещаемости по слоту (был/не был, причина) | Education | POST /api/trainer-lessons/attendance |
| **create_slot / move_slot / cancel_slot** | Управление слотом занятия | Education | trainer_lessons |
| **create_grade** | Выставление оценки по теме | Education | POST /api/grades/ |
| **create_student_with_parent** | Создание ученика и при необходимости родителя | Education | POST /api/students/with-parent |
| **import_tochka_and_apply** | Импорт выписки Точка Банк + авторазнесение по телефону/ФИО | Finance (+ интеграция) | POST /api/sales/tochka/import-and-apply |
| **suggest_makeups** | Подбор вариантов слотов для отработки по пропуску | Operations (+ Education) | GET /api/sales/absences/{id}/suggest-makeups |

---

## 12. Приоритеты для выноса в сервисы и тестов

По ТЗ приоритеты:

**Критично (вынос в сервисы + тесты):**
1. `convert_lead_to_student`
2. `convert_student_card_to_student`
3. `assign_makeup_for_absence`
4. `create_manual_lesson_for_absence`
5. `apply_bank_operation_to_student`
6. `recalculate_student_payment_status`
7. `create_manager_tasks_for_overdue_payments`

**Высокий приоритет:**
8. `submit_characteristic_for_review` / `approve_characteristic` / `reject_characteristic`
9. `event_post_visit_lead_next_step` (и список post-visit leads)
10. Чёткое разграничение: создание StudentAccount только через Finance-сервис; вызов из Education — явный вызов use case Finance.

**Тестирование (минимум):**
- Unit-тесты на сервисы (конвертации, разнесение банка, пересчёт оплаты, назначение отработки, ручной урок, согласование характеристики, создание задач по просрочке).
- Integration-тесты на ключевые сценарии: конвертация лида в ученика, конвертация анкеты, привязка банковской операции к ученику, назначение отработки по пропуску, создание ручного урока для пропуска, генерация задачи по просрочке оплаты, submit/approve/reject характеристики.

Данный каталог можно использовать при реализации Этапов 3–5 рефакторинга и при составлении плана тестов.
