#!/usr/bin/env python3
"""Отчёт о возможных дублях банковских операций. ТОЛЬКО ЧТЕНИЕ, ничего не меняет.

Группирует bank_transactions по счёту, канонической дате, сумме и направлению и выводит
группы из двух и более записей. Такие группы нужно разобрать вручную: одинаковые расходы
могут быть разными реальными переводами. Миграция 0150 автоматически трогает только пары
«заглушка → реальное имя» для приходов.

Запуск (на сервере внутри контейнера backend):
    python scripts/report_bank_duplicates.py [--date-from YYYY-MM-DD] [--date-to YYYY-MM-DD]
"""

import argparse
import os
import sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
os.chdir(ROOT)

from app.database import SessionLocal  # noqa: E402
from app.models import BankTransaction, FinanceTransaction  # noqa: E402
from app.services.bank_identity import normalize_bank_operation_date  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--date-from", default="")
    parser.add_argument("--date-to", default="")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        rows = db.query(BankTransaction).all()
        ft_by_op = defaultdict(list)
        for ft in db.query(FinanceTransaction).filter(FinanceTransaction.bank_operation_id.isnot(None)).all():
            ft_by_op[ft.bank_operation_id].append(ft)

        groups = defaultdict(list)
        for bt in rows:
            canonical = normalize_bank_operation_date(bt.payment_date)
            if args.date_from and canonical < args.date_from:
                continue
            if args.date_to and canonical > args.date_to:
                continue
            if bt.status == "ignored":
                continue
            direction = "expense" if bt.status == "expense" else "income"
            key = (bt.tochka_account_id or "xlsx", canonical, round(abs(bt.amount or 0), 2), direction)
            groups[key].append(bt)

        suspicious = {k: v for k, v in groups.items() if len(v) > 1}
        print(f"Групп с двумя и более записями: {len(suspicious)}")
        for (account, day, amount, direction), items in sorted(suspicious.items(), key=lambda kv: kv[0][1]):
            print(f"\n{day}  {amount:.2f}  {direction}  счёт={account}  записей={len(items)}")
            for bt in items:
                ft_count = len(ft_by_op.get(bt.operation_id, []))
                # Только признаки, без содержимого платежа целиком
                name = (bt.payer_name or "")[:40]
                phone_tail = (bt.payer_phone or "")[-4:]
                print(
                    f"  bt_id={bt.id} status={bt.status} name={name!r} phone=***{phone_tail} "
                    f"raw_date={bt.payment_date!r} finance_rows={ft_count} op={bt.operation_id[:12]}..."
                )
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
