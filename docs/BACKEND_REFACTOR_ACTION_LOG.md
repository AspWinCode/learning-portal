# Единый формат action log (ТЗ этап 5)

Журнал действий пользователей: кто, что сделал, с какой сущностью.

---

## Место хранения и API

- **Модель:** `ActionLog` (app.models).
- **Запись:** `app.routers.action_log.log_action(db, user_id, action_type, entity_type, entity_id=None, details=None)`.
- **Чтение:** отчёты, например GET /api/reports/action-logs (если реализован).

---

## Сигнатура log_action

```python
def log_action(
    db: Session,
    user_id: Optional[int],      # ID пользователя (None для системных/гостя)
    action_type: str,             # create | update | delete | submit | approve | reject | ...
    entity_type: str,             # lead | student | characteristic | student_account | ...
    entity_id: Optional[int] = None,
    details: Optional[Dict[str, Any]] = None  # доп. данные (даты, id связанных сущностей)
) -> None
```

- **action_type** — глагол операции: `create`, `update`, `delete`, `submit`, `approve`, `reject`, `post_visit_stage` и т.д.
- **entity_type** — тип сущности: `lead`, `student`, `characteristic`, `student_account`, `lead_task`, `student_card` и т.д.
- **entity_id** — идентификатор затронутой сущности (если применимо).
- **details** — произвольный dict; даты и объекты приводятся к ISO-строкам при записи в JSON.

Вызов выполняется после успешного изменения данных; `log_action` сам делает `db.commit()`.

---

## Где вызывать

- Конвертация лида в ученика, конвертация анкеты в ученика.
- Создание/обновление/удаление важных сущностей (счета, задачи лида, характеристики).
- Submit/approve/reject характеристики.
- Смена стадии post-visit по лиду, создание авто-задач.

Роутеры и сервисы вызывают `log_action` после commit изменений, передавая `current_user.id` (или `actor_user_id`) и тип операции.

---

## Рекомендации

- Не передавать в `details` чувствительные данные (пароли, полные персональные данные).
- Использовать стабильные значения `action_type` и `entity_type` для единообразия в отчётах и фильтрах.
