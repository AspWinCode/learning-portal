# Этап 3 ТЗ: Finance + Operations — нормализация финансового контура

Выполнено в рамках рефакторинга backend (ТЗ, этап 3).

---

## 1. Единое место зачисления на счёт ученика

**Сервис:** `app/services/student_account_payment.py`

- **`add_payment_to_student_account(db, student_id, amount, note, payment_date)`** — каноническая операция Finance: получение/создание StudentAccount, создание проводки PAYMENT, обновление баланса, пересчёт дат на карточке (`update_card_payment_dates`). Commit не выполняет — вызывающий код коммитит транзакцию.

**Использование:**

- **`app/services/bank_operation.py`** — разнесение банковской операции (BankTransaction) на ученика: привязка телефона, вызов `add_payment_to_student_account`, запись TochkaAppliedPayment, обновление статуса операции.
- **`routers/finance.py`** — `POST /api/finance/transactions/{id}/apply-student`: зачисление операции журнала (FinanceTransaction) на ученика через `add_payment_to_student_account`, затем проставление tx.status и tx.student_id.

Итог: логика «пополнение счёта ученика + пересчёт дат» сосредоточена в одном сервисе, дублирование убрано.

---

## 2. Источник истины по банковским операциям

- **BankTransaction** (операции из Точка Банк / импорт XLSX): разнесение на ученика — через сервис **`bank_operation.apply_bank_operation_to_student`**. Роутер **`POST /api/sales/bank-transactions/{id}/apply`** — слой совместимости (префикс sales сохранён по ТЗ), внутри вызывает этот сервис.
- **FinanceTransaction** (операции журнала): зачисление на ученика — через **`add_payment_to_student_account`** в роутере **`POST /api/finance/transactions/{id}/apply-student`**.

Связь «просрочка оплаты → задачи менеджеру» уже реализована в `app/services/payment_overdue_tasks.py`, вызывается из `main.py` по расписанию.

---

## 3. Дальнейшие шаги (по ТЗ)

- **Этап 4:** разделение sales.py на зоны CRM / Operations / Finance или сохранение единого префикса `/api/sales` с вызовом доменных сервисов.
- **Этап 5:** единый подход к правам, логированию, тестам (в т.ч. unit-тесты на `student_account_payment`, `bank_operation`, finance apply-student).
