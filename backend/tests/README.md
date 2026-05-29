# Тесты backend (ТЗ этап 5)

## Запуск

Из каталога `backend/`:

```bash
pip install -r requirements-dev.txt
python -m pytest tests/ -v
```

Только unit-тесты сервисов:

```bash
python -m pytest tests/unit/services/ -v
```

## Структура

- **tests/unit/services/** — unit-тесты сервисов (моки БД):
  - `test_student_account_finance.py` — создание счёта ученика
  - `test_characteristic_review.py` — submit/approve/reject характеристики
  - `test_student_account_payment.py` — зачисление платежа на счёт
  - `test_lead_conversion.py` — конвертация лида в ученика
  - `test_bank_operation.py` — зачисление банковской операции
  - `test_absence_makeup.py` — назначение отработки по пропуску
  - `test_manual_lesson.py` — создание ручного урока
  - `test_student_card_conversion.py` — конвертация анкеты в ученика
  - `test_payment_overdue_tasks.py` — автозадачи по просрочке оплаты
- **tests/integration/** — интеграционные тесты API (TestClient, фикстура `client`): health, root, auth/login 401.

## Дальнейшее (по ТЗ)

- **Интеграционные тесты** в `tests/integration/`: health/root и (при наличии БД) login 401. На Python 3.8 пропускаются (приложение использует аннотации 3.9+). Запуск: `pytest tests/integration/ -v`. Тесты с маркером `requires_db` пропускаются, если `DATABASE_URL` не задан или плейсхолдер.
- Доп. интеграционные сценарии по желанию: конвертация лида/анкеты, разнесение банковской операции, назначение отработки.
