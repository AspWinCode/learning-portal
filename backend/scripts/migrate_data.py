import os
from typing import Any, Dict

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine


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


def execute(dst: Engine, sql: str, params: Dict[str, Any] | None = None):
    with dst.begin() as conn:
        conn.execute(text(sql), params or {})


def table_count(engine: Engine, table: str) -> int:
    with engine.connect() as conn:
        res = conn.execute(text(f"SELECT COUNT(*) FROM {table}"))
        return int(res.scalar_one())


def migrate_roles(src: Engine, dst: Engine) -> None:
    # если в новой БД уже есть роли — пропускаем
    if table_count(dst, "roles") > 0:
        print("roles: destination not empty, skipping")
        return

    rows = fetch_all(src, "SELECT id, name FROM roles ORDER BY id")
    if not rows:
        print("roles: no rows to migrate")
        return

    with dst.begin() as conn:
        conn.execute(text("SET session_replication_role = 'replica'"))
        try:
            conn.execute(
                text(
                    "INSERT INTO roles (id, name) "
                    "VALUES (:id, :name) "
                    "ON CONFLICT (id) DO NOTHING"
                ),
                rows,
            )
        finally:
            conn.execute(text("SET session_replication_role = 'origin'"))

    print(f"roles: migrated {len(rows)} rows")


def migrate_users(src: Engine, dst: Engine) -> None:
    # если в новой БД уже есть пользователи — пропустим, чтобы не перетирать admin'а
    if table_count(dst, "users") > 0:
        print("users: destination not empty, skipping (manual reconciliation needed)")
        return

    rows = fetch_all(src, "SELECT * FROM users ORDER BY id")
    if not rows:
        print("users: no rows to migrate")
        return

    # Соберём список колонок из первой строки
    cols = list(rows[0].keys())
    col_list = ", ".join(cols)
    placeholders = ", ".join(f":{c}" for c in cols)

    with dst.begin() as conn:
        conn.execute(text("SET session_replication_role = 'replica'"))
        try:
            conn.execute(
                text(
                    f"INSERT INTO users ({col_list}) "
                    f"VALUES ({placeholders}) "
                    "ON CONFLICT (id) DO NOTHING"
                ),
                rows,
            )
        finally:
            conn.execute(text("SET session_replication_role = 'origin'"))

    print(f"users: migrated {len(rows)} rows")


def main() -> None:
    print(f"OLD_DATABASE_URL={OLD_DB_URL}")
    print(f"NEW_DATABASE_URL={NEW_DB_URL}")

    src = make_engine(OLD_DB_URL)
    dst = make_engine(NEW_DB_URL)

    print("=== Migrating roles ===")
    migrate_roles(src, dst)

    print("=== Migrating users ===")
    migrate_users(src, dst)

    print("Done. Check counts in both DBs for roles/users.")


if __name__ == "__main__":
    main()

