#!/usr/bin/env python3
"""Слить дубликат B2B-школы в основную запись.

Переносит все ссылки (кампании, события, контакты, лиды, рассылки, sales-линк)
с дубля на основную школу и удаляет дубль.

Запуск на сервере:
  docker compose exec backend python scripts/merge_duplicate_b2b_schools.py --keep <ID> --dup <ID>
  docker compose exec backend python scripts/merge_duplicate_b2b_schools.py --list "IT-ШКОЛА"

--list <подстрока>  показать школы с похожим названием и их id
--keep / --dup      выполнить слияние (--commit чтобы записать, иначе dry-run)
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text  # noqa: E402

from app.database import SessionLocal  # noqa: E402

# (таблица, колонка со ссылкой на b2b_schools.id)
SIMPLE_REFS = [
    ("leads", "b2b_school_id"),
    ("b2b_school_interactions", "b2b_school_id"),
    ("b2b_school_events", "b2b_school_id"),
    ("b2b_school_contacts", "b2b_school_id"),
    ("b2b_documents", "b2b_school_id"),
    ("campaign_events", "host_b2b_school_id"),
    ("email_broadcast_recipients", "school_id"),
    ("sales_schools", "b2b_school_id"),
]


def list_schools(db, needle: str) -> None:
    rows = db.execute(
        text(
            "SELECT id, name, city, pipeline_stage FROM b2b_schools "
            "WHERE name::text ILIKE :q ORDER BY name"
        ),
        {"q": f"%{needle}%"},
    ).fetchall()
    for r in rows:
        sc = db.execute(
            text("SELECT count(*) FROM school_campaigns WHERE b2b_school_id = :i"),
            {"i": r.id},
        ).scalar()
        print(f"  id={r.id:<6} campaigns={sc:<3} {r.city or '—':<20} {r.name}")
    if not rows:
        print("  ничего не найдено")


def merge(db, keep: int, dup: int, commit: bool) -> None:
    if keep == dup:
        sys.exit("--keep и --dup совпадают")
    for tid in (keep, dup):
        if not db.execute(
            text("SELECT 1 FROM b2b_schools WHERE id = :i"), {"i": tid}
        ).first():
            sys.exit(f"школа id={tid} не найдена")

    for table, col in SIMPLE_REFS:
        n = db.execute(
            text(f"UPDATE {table} SET {col} = :keep WHERE {col} = :dup"),
            {"keep": keep, "dup": dup},
        ).rowcount
        if n:
            print(f"  {table}.{col}: перенесено {n}")

    # school_campaigns / school_campaign_events — есть уникальность (school, campaign)
    dup_scs = db.execute(
        text("SELECT id, campaign_id FROM school_campaigns WHERE b2b_school_id = :dup"),
        {"dup": dup},
    ).fetchall()
    for row in dup_scs:
        clash = db.execute(
            text(
                "SELECT id FROM school_campaigns "
                "WHERE b2b_school_id = :keep AND campaign_id = :cid"
            ),
            {"keep": keep, "cid": row.campaign_id},
        ).scalar()
        if clash:
            # запись keep уже в этой кампании — удаляем дублирующую sc
            db.execute(
                text("DELETE FROM school_campaign_events WHERE school_campaign_id = :i"),
                {"i": row.id},
            )
            db.execute(
                text("DELETE FROM school_campaign_logs WHERE school_campaign_id = :i"),
                {"i": row.id},
            )
            db.execute(text("DELETE FROM school_campaigns WHERE id = :i"), {"i": row.id})
            print(f"  school_campaigns id={row.id}: удалена (у keep уже есть в кампании {row.campaign_id})")
        else:
            db.execute(
                text("UPDATE school_campaigns SET b2b_school_id = :keep WHERE id = :i"),
                {"keep": keep, "i": row.id},
            )
            print(f"  school_campaigns id={row.id}: перенесена")

    db.execute(text("DELETE FROM b2b_schools WHERE id = :i"), {"i": dup})
    print(f"  b2b_schools id={dup}: удалена")

    if commit:
        db.commit()
        print("OK — изменения записаны")
    else:
        db.rollback()
        print("dry-run — ничего не записано (добавьте --commit)")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", metavar="ПОДСТРОКА")
    ap.add_argument("--keep", type=int)
    ap.add_argument("--dup", type=int)
    ap.add_argument("--commit", action="store_true")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        if args.list:
            list_schools(db, args.list)
        elif args.keep and args.dup:
            merge(db, args.keep, args.dup, args.commit)
        else:
            ap.print_help()
    finally:
        db.close()


if __name__ == "__main__":
    main()
