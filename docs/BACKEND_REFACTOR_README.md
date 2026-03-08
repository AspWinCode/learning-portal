# Рефакторинг backend — документация

Документы подготовлены в соответствии с **Техническим заданием на рефакторинг backend портала обучения** (подготовительный этап и карта сценариев).

---

## Документы

| Документ | Этап ТЗ | Содержание |
|----------|---------|------------|
| **[BACKEND_REFACTOR_DOMAIN_MAP.md](BACKEND_REFACTOR_DOMAIN_MAP.md)** | Этап 1. Архитектурный аудит | Карта доменов и endpoint'ов: инвентаризация роутеров, разметка по доменам (Auth, Education, CRM, Operations, Finance, Management), смешение в `sales`, зависимости между доменами, рекомендации по разделению. |
| **[BACKEND_REFACTOR_USE_CASES.md](BACKEND_REFACTOR_USE_CASES.md)** | Этап 2. Карта use case-сценариев | Каталог ключевых backend use cases: конвертация лида/анкеты в ученика, пропуск → отработка/ручной урок, банковская операция → ученик, пересчёт оплаты, характеристики (submit/approve/reject), просрочка оплаты → задачи менеджеру, поствизит по лиду; приоритеты для сервисов и тестов. |
| **[BACKEND_REFACTOR_STAGE3_PLAN.md](BACKEND_REFACTOR_STAGE3_PLAN.md)** | Этап 3. Вынос логики | План и прогресс: сервисы по use cases (lead_conversion, student_card_conversion, absence_makeup, manual_lesson, bank_operation, payment_status, characteristic_review, lead_post_visit). |
| **[BACKEND_REFACTOR_ETAP3_FINANCE.md](BACKEND_REFACTOR_ETAP3_FINANCE.md)** | Этап 3 ТЗ. Finance | Нормализация финансового контура: общий сервис `student_account_payment.add_payment_to_student_account`, использование в bank_operation и finance apply-student. |
| **[BACKEND_REFACTOR_ACTION_LOG.md](BACKEND_REFACTOR_ACTION_LOG.md)** | Этап 5. Стандарты | Единый формат и использование action log (log_action). |

---

## Этапность по ТЗ (напоминание)

1. **Этап 1. Подготовительный** — аудит, карта доменов, карта use case, источники истины. ✅ Документы готовы.
2. **Этап 2. Сервисный слой** — вынос бизнес-логики в сервисы/use cases, упрощение роутеров.
3. **Этап 3. Finance + Operations** — нормализация финансового контура, отделение от sales, связь с задачами менеджера.
4. **Этап 4. CRM + Student flow** — нормализация lead/card/student flow, разделение CRM и Education.
5. **Этап 5. Права и стандарты** — единый подход к проверке доступа, логирование, тестирование.

**Выполнено дополнительно:**
- **Этап 3 (дозавершение):** POST /api/finance/bank-transactions/{id}/apply — канонический API разнесения банковской операции; POST /api/finance/student-accounts — создание счёта ученика.
- **Этап 4:** создание StudentAccount через сервис `student_account_finance.create_student_account`; students router и Finance API вызывают его.
- **Этап 5 (частично):** общие зависимости прав в `app/dependencies.py`; часть эндпоинтов sales (payment-status, bank-transactions/apply) и finance переведены на `Depends(require_*)`. Документ по action log: [BACKEND_REFACTOR_ACTION_LOG.md](BACKEND_REFACTOR_ACTION_LOG.md).
- **Этап 4 (разметка):** роутер sales описан как compatibility layer (CRM + Operations + Finance), комментарий в коде.

Дальнейшие шаги: использовать карту доменов и каталог use cases при реализации оставшихся пунктов Этапов 4–5 и при написании тестов.
