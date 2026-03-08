# Этап 3. Вынос логики из роутеров — план и прогресс

По ТЗ: вынести из роутеров бизнес-вычисления, сложные цепочки, создание связанных объектов, пересчёт статусов и доменные сценарии. Каждый крупный endpoint должен опираться на сервис/use case.

---

## Сделано

### 1. Конвертация лида в ученика (`convert_lead_to_student`)

- **Сервис:** `app/services/lead_conversion.py`
  - `convert_lead_to_student(db, lead_id, actor_user_id)` — весь сценарий: поиск/создание родителя, создание/привязка ученика, анкета (StudentCard), обновление лида, action log.
  - Вспомогательные функции перенесены в модуль: `_get_default_lead_status_option_id`, `_find_or_create_student_card_for_lead`.
- **Роутер:** `POST /api/sales/leads/{lead_id}/convert-to-student` в `sales.py` только:
  - проверяет права (`_require_sales_admin_owner`);
  - вызывает `lead_conversion_convert(db, lead_id, current_user.id)`;
  - по `ValueError` отдаёт 400 или 404;
  - возвращает `LeadConvertToStudentResponse(student_id=..., lead=_fix_lead_strings(result.lead))`.
- **Совместимость:** контракт API и поведение не изменились.

### 2. Конвертация анкеты в ученика (`convert_student_card_to_student`)

- **Сервис:** `app/services/student_card_conversion.py`
  - `convert_student_card_to_student(db, card_id, use_existing_parent_id, use_existing_student_id)` — привязка к существующему ученику, к существующему родителю + новый ученик, или новый родитель + ученик.
  - Исключение `StudentCardConvertConflict(detail)` для 409 (дубли по родителю/ученику).
- **Роутер:** `POST /api/sales/student-cards/{card_id}/convert` в `sales.py`:
  - проверка прав; вызов сервиса; обработка `StudentCardConvertConflict` → 409 + заголовок `X-Conflict-Code`; `ValueError` → 400/404.
- **Совместимость:** контракт API и поведение сохранены.

### 3. Назначение отработки по пропуску (`assign_makeup_for_absence`)

- **Сервис:** `app/services/absence_makeup.py`
  - `assign_makeup_for_absence(db, absence_id, makeup_group_id, makeup_lesson_date)` — обновляет AbsenceFollowUp, вызывает `create_link_task_on_assign`.
- **Роутер:** `POST /api/sales/absences/{absence_id}/assign-makeup` — проверка прав, вызов сервиса, ValueError → 400/404.

### 4. Создание ручного урока (`create_manual_lesson`)

- **Сервис:** `app/services/manual_lesson.py`
  - `create_manual_lesson(db, title, lesson_date, start_time, end_time, trainer_id, lesson_type, comment, students, created_by_id)` — создаёт CustomLesson и CustomLessonStudent; для типа makeup привязывает пропуски (AbsenceFollowUp).
- **Роутер:** `POST /api/sales/custom-lessons` — парсинг времени, валидация lesson_type, вызов сервиса, формирование ответа.

### 5. Зачисление банковской операции на ученика (`apply_bank_operation_to_student`)

- **Сервис:** `app/services/bank_operation.py`
  - `apply_bank_operation_to_student(db, transaction_id, student_id)` — проводка на счёт, привязка телефона при no_match, обновление дат на карточке (student_card_period).
- **Роутер:** `POST /api/sales/bank-transactions/{id}/apply` — вызов сервиса, ValueError → 400/404.

### 6. Список и сводка статусов оплаты (`payment-status`, `payment-status-summary`)

- **Сервис:** `app/services/payment_status.py`
  - `get_payment_status_list(db, status_filter, today)` — список учеников с датой следующей оплаты и статусом.
  - `get_payment_status_summary(db, today)` — сводка просрочек (3+ и 10+ дней).
- **Роутер:** GET /api/sales/payment-status, GET /api/sales/payment-status-summary — вызов сервиса, формирование ответа.

### 7. Отправка/одобрение/отклонение характеристики (`characteristic_review`)

- **Сервис:** `app/services/characteristic_review.py`
  - `submit_characteristic_for_review(db, characteristic_id, trainer_id)`, `approve_characteristic(db, characteristic_id, comment)`, `reject_characteristic(db, characteristic_id, comment)`.
- **Роутер:** POST /api/characteristics/{id}/submit, approve, reject — вызов сервиса; уведомления (Telegram) и log_action остаются в роутере.

### 8. Поствизит: обновление стадии лида (`event_post_visit_lead_next_step`)

- **Сервис:** `app/services/lead_post_visit.py`
  - `update_lead_post_visit_stage(db, lead_id, stage, review, project_date, decline_reason, get_default_lead_status_option_id)` — обновление полей лида; возвращает need_auto_task для создания задачи в роутере.
- **Роутер:** POST /api/sales/leads/{id}/post-visit-stage — вызов сервиса, при need_auto_task создание LeadTask, commit, log_action.

### 9. Задачи по просрочке оплат (`create_manager_tasks_for_overdue_payments`)

- **Проверено:** уже реализовано в `app/services/payment_overdue_tasks.py`, вызывается из main.py по расписанию. Роутера с этой логикой нет — без изменений.

---

## Дальнейшие кандидаты (по приоритету)

Все запланированные use cases из каталога вынесены в сервисы. Оставшиеся улучшения (по ТЗ):

| Направление | Рекомендация |
|-------------|--------------|
| Unit/integration тесты | Добавить тесты на сервисы (lead_conversion, student_card_conversion, bank_operation и др.). |
| Разделение доменов | Вынести роутеры CRM/Operations/Finance из sales.py в отдельные модули (этап 4–5 ТЗ). |

---

## Паттерн для следующих сценариев

1. Создать модуль в `app/services/` с функцией или классом use case.
2. Перенести туда всю бизнес-логику из endpoint'а; при необходимости оставить в роутере только тонкие хелперы (например, форматирование ответа).
3. Сервис получает `db`, id сущностей и `actor_user_id`; при ошибках кидает `ValueError` с текстом для пользователя (или доменные исключения).
4. В роутере: проверка прав → вызов сервиса → маппинг исключений в HTTPException (400/404) → формирование ответа.
5. Добавить unit- или integration-тест на сервис.

---

## Тестирование

Для `convert_lead_to_student` рекомендуется добавить:

- **Unit:** с моком БД (или SQLite in-memory): создание лида с email → вызов сервиса → проверка, что созданы User (parent), Student, обновлён Lead, запись в ActionLog.
- **Integration:** реальная БД (test fixture): полный сценарий через API или через вызов сервиса с тестовой сессией.

Файл тестов: `tests/test_lead_conversion.py` или `tests/services/test_lead_conversion.py`.
