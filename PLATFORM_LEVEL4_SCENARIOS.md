# 🎬 LEARNING PORTAL - УРОВЕНЬ 4 (ПОЛНЫЕ РАБОЧИЕ СЦЕНАРИИ)

**Дата:** 31.05.2026 | **Версия:** 4.0 | **Статус:** 🎯 УРОВЕНЬ 4 - ПОЛНЫЕ СЦЕНАРИИ И ИНТЕГРАЦИИ

Здесь расписаны **ПОЛНЫЕ РАБОЧИЕ СЦЕНАРИИ** для каждой роли и функции:
- ⏱️ Временная шкала
- 🔀 Альтернативные пути
- ⚠️ Все возможные ошибки
- 🔗 Cross-functional зависимости
- 💾 Database операции с транзакциями
- 🔔 Уведомления и логирование

---

# 👑 СЦЕНАРИИ ДЛЯ ВЛАДЕЛЬЦА (OWNER)

## СЦЕНАРИЙ 1: Полный цикл утверждения зарплаты

### Начало: Первый день месяца, расчёт зарплаты

**Участники:** Owner (Алексей), 3 тренера (Мария, Иван, Елена), система

**Дата/время:** 01.05.2026, 08:00 - 10:15

---

### **Фаза 1: Автоматическая подготовка (00:00-01:00)**

**Timeline:** 30.04.2026 23:59 → 01.05.2026 00:00

```
АВТОМАТИЧЕСКИЙ РАСЧЁТ (APScheduler Job)

Job: payroll.calculate_monthly('May', year=2026)
├─ Запуск: Каждый 1-й день месяца в 00:00 по UTC+3
├─ Timeout: 30 минут
└─ Retry: 3 попытки при ошибке

Этапы расчёта:
```

**1.1 Подготовка данных по часам:**

```python
# Query 1: Получить часы работы для каждого тренера
SELECT 
    trainer_id,
    COUNT(lesson_id) * 1.5 as hours,  -- каждое занятие = 1.5 часа
    SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as lessons_completed
FROM lesson_schedules
WHERE 
    month(lesson_date) = 5 AND 
    year(lesson_date) = 2026 AND
    trainer_id IN (1, 2, 3)  -- активные тренеры
GROUP BY trainer_id

Результат:
┌────────────┬───────┬──────────────────┐
│ trainer_id │ hours │ lessons_completed│
├────────────┼───────┼──────────────────┤
│ 1 (Мария)  │ 40    │ 27               │
│ 2 (Иван)   │ 35    │ 23               │
│ 3 (Елена)  │ 45    │ 30               │
└────────────┴───────┴──────────────────┘
```

**1.2 Расчёт базовой зарплаты:**

```python
# Query 2: Получить ставки для каждого тренера
SELECT trainer_id, hourly_rate, daily_rate
FROM trainer_salary_settings
WHERE trainer_id IN (1, 2, 3)

# Вычисление:
FOR each trainer:
    base_salary = hours * hourly_rate
    
    # Валидация
    IF base_salary < 0:
        ERROR: "Invalid calculation for trainer {name}"
        ACTION: email_admin()
        STATUS: calculation_failed
    
    IF base_salary > max_monthly_limit (e.g., 500,000):
        WARNING: "Unusual high salary"
        log_warning()
        CONTINUE

Результаты:
├─ Мария:  40 * 500 = 20,000 ₽
├─ Иван:   35 * 450 = 15,750 ₽
└─ Елена:  45 * 550 = 24,750 ₽
─────────────────────────────
ИТОГО:               60,500 ₽
```

**1.3 Добавление бонусов:**

```python
# Query 3: Бонусы за выполнение критериев
SELECT trainer_id, bonus_type, amount
FROM trainer_bonuses
WHERE 
    month = 5 AND 
    year = 2026 AND
    status = 'approved'

# Логика бонусов:
FOR each trainer:
    IF avg_student_rating >= 4.0:
        bonus_rating = 1,000 ₽
    
    IF attendance_rate >= 90%:
        bonus_attendance = 500 ₽
    
    IF new_students_count >= 5:
        bonus_new_students = 2,000 ₽
    
    total_bonus = sum(all bonuses)

Результаты:
├─ Мария:  rating(1,000) + attendance(500) = 1,500 ₽
├─ Иван:   none = 0 ₽
└─ Елена:  rating(1,000) + attendance(500) + new_students(2,000) = 3,500 ₽
```

**1.4 Вычитание штрафов:**

```python
# Query 4: Утверждённые штрафы
SELECT trainer_id, penalty_type, amount
FROM trainer_penalties
WHERE 
    month = 5 AND 
    year = 2026 AND
    status = 'approved'

Результаты:
├─ Мария:  none = 0 ₽
├─ Иван:   absence_without_reason(-500) = -500 ₽
└─ Елена:  none = 0 ₽
```

**1.5 Финальный расчёт:**

```
ИТОГОВАЯ ТАБЛИЦА:

Тренер    | Базовая | Бонусы | Штрафы | ИТОГО
──────────┼─────────┼────────┼────────┼────────
Мария     | 20,000  | 1,500  | 0      | 21,500
Иван      | 15,750  | 0      | -500   | 15,250
Елена     | 24,750  | 3,500  | 0      | 28,250
──────────┼─────────┼────────┼────────┼────────
ИТОГО     | 60,500  | 5,000  | -500   | 65,000 ₽
```

**1.6 Сохранение в БД (TRANSACTION):**

```sql
BEGIN TRANSACTION;

-- Основная таблица расчёта
INSERT INTO payroll_records (
    payroll_id,
    month,
    year,
    total_amount,
    base_amount,
    bonuses_amount,
    penalties_amount,
    status,
    created_at,
    created_by
) VALUES (
    uuid_generate_v4(),
    5,
    2026,
    65000,
    60500,
    5000,
    -500,
    'draft',
    NOW(),
    'system'
);

SET @payroll_id = LAST_INSERT_ID();

-- Запись для каждого тренера
INSERT INTO payroll_records_trainers (
    payroll_id,
    trainer_id,
    base_salary,
    bonuses,
    penalties,
    total,
    status
) VALUES 
    (@payroll_id, 1, 20000, 1500, 0, 21500, 'draft'),
    (@payroll_id, 2, 15750, 0, -500, 15250, 'draft'),
    (@payroll_id, 3, 24750, 3500, 0, 28250, 'draft');

-- Аудит лог
INSERT INTO audit_log (
    action,
    entity_type,
    entity_id,
    details,
    created_at,
    created_by
) VALUES (
    'payroll_calculated',
    'payroll',
    @payroll_id,
    {
        'month': 5,
        'trainers_count': 3,
        'total': 65000,
        'auto_calculated': true
    },
    NOW(),
    'system'
);

COMMIT;
```

**1.7 Уведомление собственнику:**

```
Telegram Bot отправляет Owner-у:

"📊 Расчёт зарплаты готов к утверждению

Месяц: Май 2026
Тренеры: 3 (Мария, Иван, Елена)
Сумма: ₽65,000

⚠️ Внимание:
• Иван имеет штраф ₽500 (без утверждения)

[Просмотреть] [Утвердить]"

HTTP: POST /webhook/telegram
{
    "chat_id": owner_telegram_id,
    "type": "payroll_ready",
    "month": "May 2026",
    "total": 65000
}
```

---

### **Возможные ОШИБКИ на Фазе 1:**

**Ошибка 1: Нет данных о расписании**

```
Условие: Расписание не заполнено для мая
┌─────────────────────────────────────────┐
│ ОШИБКА: No lesson schedule data for May │
└─────────────────────────────────────────┘

Действие системы:
├─ Status: calculation_blocked
├─ Log: ERROR level "No schedule data"
├─ Email Admin: "Cannot calculate payroll - no schedule"
├─ Telegram Owner: "⚠️ Расчёт блокирован - нет расписания"
├─ Retry: Auto-retry в 14:00 и 20:00
└─ Manual option: Admin заполняет часы и запускает пересчёт

Откат: 
└─ No INSERT в БД (transaction не началась)
```

**Ошибка 2: Недостаточно средств**

```
Условие: balance < total_payroll (например, баланс ₽30,000, нужно ₽65,000)

Действие системы:
├─ Status: calculation_warning
├─ Log: WARNING "Insufficient balance"
├─ Email Owner: "⚠️ Баланс (₽30,000) < Зарплата (₽65,000)"
├─ UI Flag: 🔴 RED (при утверждении будет блокировано)
├─ Suggestion: "Пополните счёт перед утверждением"
└─ Calculation: Продолжается нормально (не блокируется)
```

**Ошибка 3: Тренер удалён из системы**

```
Условие: Тренер помечен как deleted между расчётами

Действие системы:
├─ Skip trainer: не включать в расчёт
├─ Log: WARNING "Trainer {id} marked as deleted"
├─ Email Owner: "Тренер {name} удалён - пропущен в расчёте"
└─ Result: Расчёт выполнен для оставшихся тренеров
```

**Ошибка 4: Dupicate calculation (Race condition)**

```
Условие: Расчёт запущен дважды одновременно

Действие системы:
├─ 1-й процесс: Успешно создаёт payroll_records
├─ 2-й процесс: Конфликт UNIQUE constraints
├─ Система:
│  ├─ Откатывает 2-й процесс (ROLLBACK)
│  ├─ Log: "Duplicate payroll calculation detected"
│  └─ Оставляет только 1-й результат
└─ Result: 1 правильная запись, 0 дублей
```

---

### **Фаза 2: Owner просматривает расчёт (09:00-09:30)**

**Timeline:** 01.05.2026 09:15

```
ДЕЙСТВИЕ: Owner открывает dashboard

Система:
├─ 1. Проверяет permission:
│  └─ IF user.role != 'Owner' THEN return 403
│
├─ 2. Загружает draft расчёт:
│  └─ SELECT * FROM payroll_records WHERE status='draft' AND month=5
│
├─ 3. Вычисляет дополнительные метрики:
│  ├─ Налоги (НДФЛ 13%): 65,000 * 0.13 = 8,450
│  ├─ Страховые взносы (30.2%): 65,000 * 0.302 = 19,630
│  ├─ Итого к выплате: 65,000 + 8,450 + 19,630 = 93,080
│  └─ Требуется на счёте (с резервом): 100,000
│
├─ 4. Проверяет предупреждения:
│  ├─ IF balance < total THEN flag_balance_warning()
│  ├─ IF penalty_not_approved THEN flag_penalty_warning()
│  └─ IF trainer_archived THEN flag_archived_warning()
│
└─ 5. Отправляет на UI:
   ├─ Таблица расчётов
   ├─ Все warnings
   ├─ Кнопки действий
   └─ История предыдущих расчётов
```

**UI, которую видит Owner:**

```
═══════════════════════════════════════════════════════════
РАСЧЁТ ЗАРПЛАТЫ - МАЙ 2026 (ЧЕРНОВИК)
═══════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────┐
│ ⚠️ ВНИМАНИЕ:                                            │
├─────────────────────────────────────────────────────────┤
│ 🟡 Иван П.: штраф ₽500 не утверждён                    │
│ 🟡 Баланс счёта: ₽30,000 (требуется ₽100,000)          │
│ 🟢 Все тренеры активны                                  │
│ 🟢 Все оценки выставлены                                │
└─────────────────────────────────────────────────────────┘

ТАБЛИЦА РАСЧЁТОВ:
╔════════╦═══════╦═══════╦════════╦═════════╦════════╗
║ Тренер ║ Часов ║ Ставка║ Базовая║ Бонусы  ║ ИТОГО  ║
╠════════╬═══════╬═══════╬════════╬═════════╬════════╣
║ Мария  ║ 40    ║ 500   ║ 20,000 ║ 1,500   ║ 21,500 ║
║ Иван   ║ 35    ║ 450   ║ 15,750 ║ 0 ⚠️    ║ 15,250 ║
║ Елена  ║ 45    ║ 550   ║ 24,750 ║ 3,500   ║ 28,250 ║
╠════════╬═══════╬═══════╬════════╬═════════╬════════╣
║ ИТОГО  ║ 120   ║       ║ 60,500 ║ 5,000   ║ 65,000 ║
╚════════╩═══════╩═══════╩════════╩═════════╩════════╝

Штрафы (вычтены): ₽500 (Иван)

ФИНАНСОВЫЕ РАСЧЁТЫ:
├─ Базовая зарплата:        ₽65,000
├─ НДФЛ (13%):              ₽8,450
├─ Страховые взносы (30.2%): ₽19,630
├─ ИТОГО:                    ₽93,080
└─ Требуется на счёте:       ₽100,000 ❌

ДЕЙСТВИЯ:
├─ [✏️ Редактировать расчёт]
├─ [❌ Отклонить и начать заново]
├─ [❌ Отмена]
└─ [✅ УТВЕРДИТЬ РАСЧЁТ] (disabled из-за баланса)

ИСТОРИЯ РАСЧЁТОВ:
├─ Апрель 2026: ₽58,500 ✅ утверждена
├─ Март 2026:   ₽61,000 ✅ утверждена
└─ Февраль 2026: ₽55,000 ✅ утверждена
```

**Owner видит 🔴 RED флаг "Недостаточно средств"**

---

### **Фаза 2.1: Owner редактирует расчёт (опционально)**

```
СЦЕНАРИЙ: Owner кликает "Редактировать" для Ивана

Форма редактирования:
┌────────────────────────────────────────┐
│ РЕДАКТИРОВАНИЕ: Иван П.                │
├────────────────────────────────────────┤
│ Часы:        [35] часов                │
│ Ставка:      [450] ₽/ч                 │
│ Базовая:     [15,750] ₽ (автоматически)│
│ Бонусы:      [0] ₽                     │
│ Штрафы:      [-500] ₽                  │
│                                        │
│ Штраф - Причина:                      │
│ [Отсутствие без уважительной причины] │
│ Комментарий: [______________________] │
│                                        │
│ [Пересчитать] [Удалить штраф] [X]     │
└────────────────────────────────────────┘

Вариант 1: Owner удаляет штраф
├─ Click: [Удалить штраф]
├─ Штраф: [-500] → [0]
├─ ИТОГО Ивана: 15,250 → 15,750
├─ ИТОГО счёта: 65,000 → 65,500
├─ Log: "Penalty removed for trainer Иван"
└─ Save & Refresh

Вариант 2: Owner изменяет сумму штрафа
├─ Click: [-500] → [-250]
├─ Валидация: IF штраф > базовая*0.5 THEN WARNING
├─ ИТОГО Ивана: 15,250 → 15,500
├─ ИТОГО счёта: 65,000 → 65,250
└─ Log: "Penalty modified for trainer Иван"

Вариант 3: Owner добавляет бонус
├─ Click: [0] → [1000]
├─ Причина: [За отличную работу с новыми студентами]
├─ ИТОГО Ивана: 15,250 → 16,250
├─ ИТОГО счёта: 65,000 → 66,000
└─ Log: "Manual bonus added"
```

---

### **Фаза 3: Пополнение счёта (опционально)**

```
СЦЕНАРИЙ: Owner видит, что баланса недостаточно

Действие 1: Пополнить счёт
├─ Click: [Пополнить счёт]
├─ Переход в раздел "Финансы" → "Счёт компании"
├─ Форма пополнения:
│  ├─ Сумма: [100,000] ₽ (предложено автоматически)
│  ├─ Метод: [Банковский перевод ▼]
│  ├─ Описание: [Пополнение для выплаты зарплаты май]
│  └─ [Пополнить]
│
└─ Система:
   ├─ Создаёт счёт для оплаты
   ├─ Отправляет реквизиты банка
   ├─ Email Owner с деталями платежа
   └─ Ожидает платёж (обычно 1-2 дня)

Действие 2: Отложить расчёт до пополнения
├─ Status: draft (оставить как есть)
├─ Email Owner: "Расчёт подготовлен, ожидает пополнения счёта"
└─ Вернуться позже (когда придут деньги)
```

---

### **Фаза 4: Owner утверждает расчёт (09:45-10:00)**

**После пополнения счёта до ₽100,000**

```
ДЕЙСТВИЕ: Owner кликает "УТВЕРДИТЬ РАСЧЁТ"

Диалог подтверждения:
┌────────────────────────────────────────┐
│ ⚠️ ПОДТВЕРЖДЕНИЕ УТВЕРЖДЕНИЯ          │
├────────────────────────────────────────┤
│ После утверждения изменения            │
│ НЕВОЗМОЖНЫ!                            │
│                                        │
│ Итоговая сумма: ₽65,000                │
│ Налоги: ₽28,080                        │
│ Требуется: ₽93,080                     │
│ На счёте: ₽100,000 ✅                  │
│                                        │
│ [✅ Да, утвердить] [Отмена]            │
└────────────────────────────────────────┘

Click: "Да, утвердить"

BACKEND ПРОЦЕСС (ТРАНЗАКЦИЯ):
```

**Шаг 1: Начало транзакции**

```sql
BEGIN TRANSACTION
ISOLATION LEVEL: SERIALIZABLE
```

**Шаг 2: Основное обновление статуса**

```sql
UPDATE payroll_records 
SET 
    status = 'approved',
    approved_by = 1,  -- owner_id
    approved_at = NOW(),
    approved_timestamp = '2026-05-01T09:45:15Z'
WHERE 
    payroll_id = @payroll_draft_id AND
    status = 'draft' AND
    month = 5 AND year = 2026

-- Проверка: должна изменить ровно 1 запись
IF ROWS_AFFECTED != 1 THEN
    -- Race condition: кто-то уже утвердил
    ROLLBACK
    RETURN error "Payroll already approved"
END IF
```

**Шаг 3: Создание финальных записей для тренеров**

```sql
INSERT INTO trainer_payments (
    payment_id,
    trainer_id,
    payroll_id,
    amount,
    base_salary,
    bonuses,
    penalties,
    status,
    created_at
) SELECT
    uuid_generate_v4(),
    trainer_id,
    @payroll_id,
    total,
    base_salary,
    bonuses,
    penalties,
    'pending_transfer',
    NOW()
FROM payroll_records_trainers
WHERE payroll_id = @payroll_id AND status = 'draft'

-- Результат: 3 записи INSERT
-- (Мария, Иван, Елена)
```

**Шаг 4: Резервирование средств со счёта**

```sql
UPDATE company_account 
SET 
    balance = balance - 65000,
    reserved_amount = reserved_amount + 65000,
    last_transaction = NOW()
WHERE company_id = @owner_company_id

-- Проверка:
IF balance < 0 THEN
    ROLLBACK
    RETURN error "Insufficient balance"
END IF

-- Результат: balance ₽100,000 → ₽35,000
--            reserved: ₽0 → ₽65,000
```

**Шаг 5: Запись в финансовый журнал**

```sql
INSERT INTO financial_transactions (
    transaction_id,
    type,
    amount,
    description,
    balance_before,
    balance_after,
    created_at,
    status
) VALUES (
    uuid_generate_v4(),
    'payroll_approval',
    65000,
    'Payroll approved for May 2026 (3 trainers)',
    100000,
    35000,
    NOW(),
    'pending'
)
```

**Шаг 6: Добавление в очередь уведомлений**

```sql
INSERT INTO notification_queue (
    notification_id,
    recipient_id,
    recipient_type,
    type,
    message,
    channel,
    status,
    created_at,
    scheduled_for
) VALUES
    -- Уведомление тренерам
    (uuid(), 1, 'trainer', 'payroll_approved', 
     '{"amount": 21500, "month": "May"}', 
     'telegram', 'queued', NOW(), NOW()),
    
    (uuid(), 2, 'trainer', 'payroll_approved', 
     '{"amount": 15250, "month": "May"}', 
     'telegram', 'queued', NOW(), NOW()),
    
    (uuid(), 3, 'trainer', 'payroll_approved', 
     '{"amount": 28250, "month": "May"}', 
     'telegram', 'queued', NOW(), NOW()),
    
    -- Уведомление Owner-у
    (uuid(), @owner_id, 'owner', 'payroll_approved_confirmation',
     '{"total": 65000, "trainers": 3}',
     'telegram', 'queued', NOW(), NOW())

-- Результат: 4 уведомления добавлены в очередь
```

**Шаг 7: Аудит логирование**

```sql
INSERT INTO audit_log (
    log_id,
    action,
    entity_type,
    entity_id,
    user_id,
    user_role,
    details,
    ip_address,
    user_agent,
    timestamp
) VALUES (
    uuid_generate_v4(),
    'payroll_approved',
    'payroll_records',
    @payroll_id,
    @owner_id,
    'Owner',
    JSON_OBJECT(
        'month', 5,
        'year', 2026,
        'total_amount', 65000,
        'trainers_count', 3,
        'status_change', 'draft → approved',
        'timestamp_utc', '2026-05-01T09:45:15Z',
        'trainers', JSON_ARRAY(1, 2, 3)
    ),
    '192.168.1.100',
    'Mozilla/5.0...',
    NOW()
)
```

**Шаг 8: Коммит транзакции**

```sql
COMMIT TRANSACTION

-- Все 5 UPDATE/INSERT выполнены успешно
-- Данные зафиксированы в БД
-- Дальше выполняются post-commit действия
```

---

### **Фаза 5: Post-commit действия (параллельные, асинхронные)**

```
После COMMIT транзакции система запускает асинхронные процессы:

ПРОЦЕСС 1: Отправка Telegram уведомлений (очередь)
├─ Время: 09:46:00
├─ Worker: notification_sender.py
├─ Для каждого тренера:
│  ├─ Получить chat_id из настроек
│  ├─ Сформировать сообщение
│  ├─ POST /telegram/sendMessage
│  ├─ Await response
│  └─ IF success: update queue.status = 'sent'
│     IF failed: retry_count++, reschedule
│
├─ Сообщение Мария:
│  "✅ Ваша зарплата за май утверждена!\n
│   Сумма: ₽21,500\n
│   Дата перевода: 05.05.2026\n
│   [Подробнее]"
│
├─ Сообщение Иван:
│  "✅ Ваша зарплата за май утверждена!\n
│   Сумма: ₽15,250\n
│   ⚠️ Включен штраф: ₽500\n
│   Дата перевода: 05.05.2026"
│
└─ Сообщение Елена:
   "✅ Ваша зарплата за май утверждена!\n
    Сумма: ₽28,250\n
    💰 Включены бонусы: ₽3,500\n
    Дата перевода: 05.05.2026"

ПРОЦЕСС 2: Отправка Email уведомлений
├─ Время: 09:46:15
├─ Service: email_service.py
├─ Queue: notification_queue WHERE channel='email'
└─ Email template: "payroll_approved.html"
   ├─ To: trainer.email
   ├─ Subject: "Расчёт зарплаты за май 2026"
   ├─ Body: HTML с деталями
   └─ Attachments: (опционально) платёжка.pdf

ПРОЦЕСС 3: Уведомление Owner-у
├─ Telegram: "✅ Расчёт утверждён успешно\nОбщая сумма: ₽65,000"
├─ Dashboard: Refresh статуса
└─ Notify bell icon: показать в UI

ПРОЦЕСС 4: Генерация отчётов (background job)
├─ Время: 09:47:00
├─ Job: generate_payroll_reports
├─ Создает:
│  ├─ Ведомость (PDF)
│  ├─ Платёжка (XML для банка)
│  ├─ Расчётный лист (XLSX)
│  └─ Архив (все в ZIP)
└─ Сохраняет в document_storage

ПРОЦЕСС 5: Уведомление бухгалтера (если настроено)
├─ Если role 'Accountant' назначен:
│  ├─ Email: "Новый расчёт зарплаты готов к проверке"
│  └─ Дополнительные реквизиты для учёта

ПРОЦЕСС 6: Интеграция с банком (если автоматический перевод)
├─ Время: 09:50:00 (с задержкой)
├─ API: bank_api.send_payroll_transfer()
├─ Параметры:
│  ├─ amount: 65000
│  ├─ trainers: [
│  │    {id: 1, account: '..', amount: 21500},
│  │    {id: 2, account: '..', amount: 15250},
│  │    {id: 3, account: '..', amount: 28250}
│  │  ]
│  └─ description: 'Payroll May 2026'
├─ Response: bank_transfer_id = 'XFER_2026050100001'
├─ Status: 'pending' (ожидает обработки в банке)
└─ Log: INSERT в transfer_history
```

---

### **Возможные ОШИБКИ при утверждении:**

**Ошибка 1: Race Condition (дублирование)**

```
Сценарий: Owner кликает дважды (or browser refresh)

1️⃣ Первый клик:
   ├─ Transaction начата
   ├─ payroll_records UPDATE: draft → approved
   ├─ COMMIT успешно
   └─ Уведомления отправлены

2️⃣ Второй клик (пока идёт обработка):
   ├─ Transaction начата
   ├─ payroll_records UPDATE: ??? (status уже 'approved')
   ├─ WHERE status = 'draft' matches 0 rows
   ├─ ROWS_AFFECTED = 0
   ├─ Check fails: ROWS_AFFECTED != 1
   ├─ ROLLBACK transaction
   └─ Error response: "Payroll already approved"

UI Owner видит:
├─ Первое сообщение: "✅ Расчёт утверждён"
├─ Второе сообщение: "❌ Ошибка: расчёт уже утверждён"
└─ Данные: все корректны (только одна версия)
```

**Ошибка 2: Insufficient Balance (деньги закончились)**

```
Сценарий: Между подготовкой и утверждением потратили деньги

Условие:
├─ Было: balance = ₽100,000
├─ Между расчётом и утверждением: выплата другая на ₽50,000
└─ Стало: balance = ₽50,000 < needed (₽65,000)

На шаге 4 (резервирование средств):
├─ UPDATE company_account SET balance = balance - 65000
├─ balance < 0 (now ₽-15,000)
├─ Check: IF balance < 0 THEN...
├─ ROLLBACK entire transaction
└─ Error: "Insufficient balance. Have: ₽50,000, Need: ₽65,000"

UI Owner видит:
├─ ❌ Ошибка утверждения
├─ Message: "Недостаточно средств"
├─ Current balance: ₽50,000
├─ Required: ₽65,000
└─ Action: "Пополните счёт и повторите"

Результат:
├─ payroll_records: всё ещё в статусе 'draft'
├─ company_account: balance не изменился
└─ Может повторить попытку после пополнения
```

**Ошибка 3: Trainer Deleted (тренер удалён)**

```
Сценарий: Между расчётом и утверждением удалили тренера

Условие:
├─ Мария добавлена в payroll_records_trainers
├─ Admin удалил Марию (status = 'deleted')
├─ Попытка утвердить

На шаге 3 (INSERT trainer_payments):
├─ Получаем trainer_id = 1 (Мария)
├─ Foreign key check: trainer_id должен существовать в trainers
├─ Trainer marked as deleted → FAIL
├─ Option 1: ROLLBACK (strict FK)
├─ Option 2: Skip trainer (lenient FK)

При Option 2 (skip):
├─ INSERT trainer_payments: только для Иван и Елена
├─ Мария пропущена
├─ Log: WARNING "Trainer Мария deleted, skipped in payroll"
├─ Email Owner: "⚠️ Один тренер пропущен в расчёте"
├─ Payroll статус: 'approved_with_warnings'
└─ Сумма: 15,250 + 28,250 = ₽43,500 (вместо ₽65,000)
```

**Ошибка 4: Network Error (Telegram API недоступен)**

```
Сценарий: При отправке уведомления Telegram offline

Timeline:
├─ 09:45: Транзакция COMMIT успешно
├─ 09:46: Worker пытается отправить Telegram
├─ Telegram API: Connection timeout
├─ Retry 1: failed (5s)
├─ Retry 2: failed (30s)
├─ Retry 3: failed (5m)

Действие системы:
├─ notification_queue.retry_count = 3
├─ notification_queue.status = 'failed'
├─ Email fallback: отправить вместо Telegram
├─ Log: "Telegram failed, using email fallback"
├─ Admin notification: "Проверьте Telegram интеграцию"

UI Owner видит:
├─ ✅ "Расчёт утверждён"
├─ ⚠️ "Один канал уведомлений недоступен"
├─ Telegram: ❌ (failed)
├─ Email: ✅ (sent as fallback)
└─ SMS: ⏳ (не настроена)

Через 1 час: когда Telegram вернёшься online:
├─ Worker retry: отправляет уведомление
├─ notification_queue.status = 'sent'
└─ Trainer получает сообщение с задержкой
```

---

### **Фаза 6: Owner видит результат (10:00-10:15)**

```
ДЕЙСТВИЕ: Owner обновляет страницу (или получает notification)

Dashboard обновляется:
┌─────────────────────────────────────────────────┐
│ ✅ РАСЧЁТ ЗАРПЛАТЫ УТВЕРЖДЁН                    │
├─────────────────────────────────────────────────┤
│ Месяц: Май 2026                                │
│ Дата утверждения: 01.05.2026 09:45             │
│ Утвердил: Алексей Петров (Owner)               │
│                                                 │
│ Итого выплачено: ₽65,000                        │
│ Тренеры: 3 (Мария, Иван, Елена)                │
│                                                 │
│ СТАТУС УВЕДОМЛЕНИЙ:                             │
│ ├─ Telegram: ✅ 3/3 отправлено                  │
│ ├─ Email: ✅ 3/3 отправлено                     │
│ └─ SMS: — (не настроена)                        │
│                                                 │
│ ОЖИДАЕМАЯ ДАТА ПЕРЕВОДА: 05.05.2026              │
│                                                 │
│ ИСТОРИЯ ПЛАТЕЖЕЙ:                               │
│ ├─ Мария С.    ₽21,500 ⏳ Ожидает перевода      │
│ ├─ Иван П.     ₽15,250 ⏳ Ожидает перевода      │
│ └─ Елена И.    ₽28,250 ⏳ Ожидает перевода      │
│                                                 │
│ ДЕЙСТВИЯ:                                       │
│ ├─ [🖨️ Распечатать ведомость]                   │
│ ├─ [📊 Скачать отчёт]                           │
│ ├─ [💳 Генерировать платёжку]                   │
│ └─ [📧 Отправить ещё раз]                       │
└─────────────────────────────────────────────────┘

Тренеры видят в своих кабинетах:

МАРИЯ С. (Trainer):
├─ Dashboard notification: "✅ Зарплата утверждена"
├─ "Моя зарплата" → Май 2026: ₽21,500
├─ Статус: Ожидает перевода на счёт
├─ Ожидаемая дата: 05.05.2026
└─ [Скачать расчётный лист]

ИВАН П. (Trainer):
├─ Dashboard: "✅ Зарплата утверждена"
├─ "Моя зарплата" → Май 2026: ₽15,250
├─ ⚠️ Включен штраф: -₽500 (отсутствие)
└─ [Оспорить штраф] [Подробнее]

ЕЛЕНА И. (Trainer):
├─ Dashboard: "✅ Зарплата утверждена"
├─ "Моя зарплата" → Май 2026: ₽28,250
├─ 💰 Бонусы: +₽3,500 (отличные оценки)
└─ [Детали бонусов]
```

---

### **Фаза 7: Банковский перевод (05.05.2026, 10:00)**

```
АВТОМАТИЧЕСКИЙ ПЕРЕВОД (если настроено)

Timeline: 05.05.2026 10:00

Job: process_pending_trainer_payments()
├─ Query: SELECT * FROM trainer_payments WHERE status='pending_transfer'
├─ Count: 3 платежа
└─ Для каждого:

   Мария (trainer_id=1):
   ├─ amount: ₽21,500
   ├─ account: XX...XXXX (зашифрована)
   ├─ bank: ВТБ
   ├─ API call: bank_api.transfer({
   │    from_account: company_account,
   │    to_account: trainer_account,
   │    amount: 21500,
   │    description: 'Зарплата май 2026'
   │  })
   ├─ Response: { status: 'success', transfer_id: 'XFER...' }
   ├─ Update: trainer_payments.status = 'transferred'
   ├─ Update: trainers.balance_received += 21500
   └─ Log: INSERT transaction_log

   (Аналогично для Ивана и Елены)

Статус на счете тренера:
├─ Дата операции: 05.05.2026
├─ Описание: "Зарплата май 2026 Learning Portal"
├─ Сумма: 21,500 ₽
├─ Статус: ✅ Исполнено
└─ Дата зачисления: 05.05.2026 14:30

UI тренера обновляется:
├─ Status: ⏳ Ожидает перевода → ✅ Переведено
├─ "Дата получения: 05.05.2026"
└─ История платежей обновлена
```

---

## ✅ ИТОГИ СЦЕНАРИЯ "УТВЕРЖДЕНИЕ ЗАРПЛАТЫ"

**Ключевые моменты:**

| Этап | Время | Участники | Действие | Результат |
|------|-------|-----------|----------|-----------|
| Подготовка | 00:00 | Система | Auto-calc | draft payroll |
| Просмотр | 09:15 | Owner | Открывает dashboard | Видит расчёт + warnings |
| Проверка | 09:30 | Owner | Проверяет баланс | Видит ❌ недостаточно |
| Пополнение | 09:35 | Owner | Пополняет счёт | balance ₽100,000 |
| Утверждение | 09:45 | Owner | Кликает утвердить | Transaction COMMIT |
| Уведомления | 09:46 | Система | Отправляет (параллельно) | 3 Telegram + 3 Email |
| Итог | 10:00 | Все | Dashboard refresh | Все видят ✅ approved |
| Перевод | 05.05 10:00 | Система + Банк | Auto-transfer | Деньги на счётах |

**Обработано ошибок:** 4 основных + 10 детальных вариантов  
**Количество транзакций БД:** 8 UPDATE/INSERT в single transaction  
**Параллельных процессов:** 6 асинхронных workers  
**Интеграций:** Telegram, Email, Bank API, Document storage  

---

Продолжить с другими сценариями?
