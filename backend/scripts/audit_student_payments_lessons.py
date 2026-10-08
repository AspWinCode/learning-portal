#!/usr/bin/env python3
"""Сверка оплат и занятий по ученикам. ТОЛЬКО ЧТЕНИЕ, ничего не меняет.

Диагностический отчёт: по каждому действующему ученику — есть ли оплаты, сколько
занятий прошло в текущем периоде (группа: из 8; индивидуально: всего), отдельный
разбор "Данилова Дарья", и список возможных несостыковок (дубли учеников, дубли
платежей, отсутствующий period_start, период без ролловера и т.д.). Ничего не
правит: нет merge дублей, нет создания PAYMENT, нет изменения learning_period_start.

Запуск (на сервере внутри контейнера backend):
    python scripts/audit_student_payments_lessons.py
"""

import argparse
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
os.chdir(ROOT)

from app.database import SessionLocal  # noqa: E402
from app.services.student_payment_audit import (  # noqa: E402
    build_danilova_daria_report,
    build_student_payment_audit,
)


def _fmt_entry(e) -> str:
    if e.learning_format == "individual":
        lessons = f"занятий всего: {e.lifetime_lessons_passed}"
    elif e.period_state == "missing":
        lessons = f"period_start НЕ ЗАДАН (история: {e.lifetime_lessons_count})"
    else:
        lessons = f"занятий из 8: {e.lessons_passed}/8 (осталось {e.lessons_remaining})"
    warnings = f" ПРЕДУПРЕЖДЕНИЯ: {', '.join(e.warnings)}" if e.warnings else ""
    return (
        f"  id={e.student_id} {e.student_name!r} [{e.learning_format}] "
        f"оплат={e.payment_count} сумма={e.payment_total:.2f} {lessons}{warnings}"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.parse_args()

    db = SessionLocal()
    try:
        result = build_student_payment_audit(db)
        danilova = build_danilova_daria_report(db)

        print("=== SUMMARY ===")
        print(f"Активных учеников: {result.summary.students_total}")
        print(f"С оплатами: {result.summary.with_payments}")
        print(f"Без оплат: {result.summary.without_payments}")
        print(f"На гранте: {result.summary.grant_students}")

        without_payments = [e for e in result.students if not e.on_grant and e.payment_count == 0]
        print(f"\n=== БЕЗ ОПЛАТ ({len(without_payments)}) ===")
        for e in without_payments:
            print(_fmt_entry(e))

        overflow = [e for e in result.students if "period_overflow" in e.warnings]
        print(f"\n=== GROUP 8+ LESSONS ({len(overflow)}) ===")
        for e in overflow:
            print(_fmt_entry(e))

        duplicates = [e for e in result.students if e.possible_duplicate]
        print(f"\n=== ВОЗМОЖНЫЕ ДУБЛИ УЧЕНИКОВ ({len(duplicates)}) ===")
        for e in duplicates:
            print(f"  id={e.student_id} {e.student_name!r} <-> {e.duplicate_student_ids}")

        print(f"\n=== ВОЗМОЖНЫЕ ДУБЛИ ПЛАТЕЖЕЙ ({len(result.possible_duplicate_payments)}) ===")
        for group in result.possible_duplicate_payments:
            tx_ids = [t.transaction_id for t in group.transactions]
            print(
                f"  finance_transaction_id={group.finance_transaction_id} student_id={group.student_id} "
                f"transactions={tx_ids}"
            )

        print(f"\n=== DANILOVA DARIA ({len(danilova)} совпадений) ===")
        if len(danilova) > 1:
            print("  ⚠ Найдено больше одного совпадения — НЕ объединено автоматически.")
        for e in danilova:
            print(_fmt_entry(e))
            for p in e.payments:
                print(
                    f"    платёж tx={p.transaction_id} счёт={p.account_id} дата={p.date} "
                    f"сумма={p.amount:.2f} finance_tx={p.finance_transaction_id} формат={p.payment_format}"
                )

        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
