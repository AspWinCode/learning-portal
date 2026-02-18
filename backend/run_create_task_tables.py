"""Выполняет create_task_tables.sql к БД из .env (DATABASE_URL). Запуск: python run_create_task_tables.py"""
import os
import sys
from pathlib import Path

# load .env
env_path = Path(__file__).resolve().parent / ".env"
if env_path.exists():
    with open(env_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

try:
    import psycopg2
except ImportError:
    print("Установите psycopg2: pip install psycopg2-binary")
    sys.exit(1)

url = os.environ.get("DATABASE_URL")
if not url:
    print("В .env не задан DATABASE_URL")
    sys.exit(1)

# parse simple postgres URL
if url.startswith("postgresql://"):
    url = url.replace("postgresql://", "postgres://", 1)
import re
m = re.match(r"postgres://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)", url)
if not m:
    print("Не удалось разобрать DATABASE_URL")
    sys.exit(1)
user, password, host, port, dbname = m.groups()

sql_path = Path(__file__).resolve().parent / "create_task_tables.sql"
sql = sql_path.read_text(encoding="utf-8")
# убрать комментарии и пустые строки, выполнить по одному statement
statements = []
for part in sql.split(";"):
    part = part.strip()
    if not part or part.startswith("--"):
        continue
    lines = [l for l in part.split("\n") if not l.strip().startswith("--")]
    statements.append("\n".join(lines))

conn = psycopg2.connect(host=host, port=port, dbname=dbname, user=user, password=password)
conn.autocommit = True
cur = conn.cursor()
for s in statements:
    if not s.strip():
        continue
    try:
        cur.execute(s)
        print("OK:", s.split()[0:3], "...")
    except Exception as e:
        print("Error:", e)
        print("SQL:", s[:200], "...")
cur.close()
conn.close()
print("Готово. Таблицы таск-менеджера созданы.")
