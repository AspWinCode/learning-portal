import os
from typing import Any, Dict, List

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import ProgrammingError


OLD_DB_URL = os.getenv(
    "OLD_DATABASE_URL",
    "postgresql://learning_user:change_me_strong_password@db:5432/learning_portal",
)
NEW_DB_URL = os.getenv(
    "NEW_DATABASE_URL",
    "postgresql://learning_user_fixed:change_me_strong_password_fixed@db_fixed:5432/learning_portal_fixed",
)


def make_engine(url: str) -> Engine:
    return create_engine(url, pool_pre_ping=True)


def fetch_all(src: Engine, sql: str, params: Dict[str, Any] | None = None):
    with src.connect() as conn:
        return conn.execute(text(sql), params or {}).mappings().all()


def list_tables(engine: Engine) -> List[str]:
    sql = """
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
    """
    with engine.connect() as conn:
        rows = conn.execute(text(sql)).scalars().all()
    return list(rows)


def table_exists(engine: Engine, table: str) -> bool:
    sql = """
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = :t
    """
    with engine.connect() as conn:
        row = conn.execute(text(sql), {"t": table}).first()
    return row is not None


def columns_for(engine: Engine, table: str) -> List[str]:
    sql = """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = :t
        ORDER BY ordinal_position
    """
    with engine.connect() as conn:
        rows = conn.execute(text(sql), {"t": table}).scalars().all()
    return list(rows)


def copy_table(src: Engine, dst: Engine, table: str) -> None:
    # alembic_version не трогаем — схема уже на 0075
    if table == "alembic_version":
        print(f"{table}: skip (alembic_version)")
        return

    # если таблицы нет в старой БД — просто очищаем в новой (оставляем пустой)
    if not table_exists(src, table):
        print(f"{table}: source table missing, truncating destination")
        with dst.begin() as conn:
            conn.execute(text("SET session_replication_role = 'replica'"))
            try:
                conn.execute(text(f'TRUNCATE TABLE "{table}" RESTART IDENTITY CASCADE'))
            finally:
                conn.execute(text("SET session_replication_role = 'origin'"))
        return

    src_cols = set(columns_for(src, table))
    dst_cols = set(columns_for(dst, table))
    cols = sorted(src_cols & dst_cols)

    if not cols:
        print(f"{table}: no common columns, skipping")
        return

    col_list = ", ".join(f'"{c}"' for c in cols)
    placeholders = ", ".join(f":{c}" for c in cols)

    # читаем все строки из старой БД
    rows = fetch_all(src, f'SELECT {col_list} FROM "{table}"')
    total = len(rows)
    print(f"{table}: source rows = {total}")

    with dst.begin() as conn:
        conn.execute(text("SET session_replication_role = 'replica'"))
        try:
            # очищаем и сбрасываем последовательности
            conn.execute(text(f'TRUNCATE TABLE "{table}" RESTART IDENTITY CASCADE'))

            if total > 0:
                conn.execute(
                    text(
                        f'INSERT INTO "{table}" ({col_list}) '
                        f"VALUES ({placeholders})"
                    ),
                    rows,
                )
        finally:
            conn.execute(text("SET session_replication_role = 'origin'"))

    print(f"{table}: copied {total} rows")


def main() -> None:
    print(f"OLD_DATABASE_URL={OLD_DB_URL}")
    print(f"NEW_DATABASE_URL={NEW_DB_URL}")

    src = make_engine(OLD_DB_URL)
    dst = make_engine(NEW_DB_URL)

    tables = list_tables(dst)
    print("Tables in NEW DB (public):")
    for t in tables:
        print(f"  - {t}")

    print("\n=== Copying all tables from OLD -> NEW ===")

    for table in tables:
        copy_table(src, dst, table)

    print("\nDone. New DB now has data cloned from old DB (schema остаётся новой).")
    print("Проверь выборочно несколько таблиц (COUNT, пару записей).")


if __name__ == "__main__":
    main()

