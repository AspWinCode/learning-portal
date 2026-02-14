#!/usr/bin/env python
"""
Проверка значений ENUM в PostgreSQL.
Запуск: из папки backend выполнить: python check_enum_values.py

Покажет реальные значения для groupstatus, studentstatus, programstatus и т.д.
Если в БД значения в верхнем регистре (ACTIVE), а приложение шлёт 'active' — будет ошибка.
"""
import os
import sys

# подхватить .env
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL or "postgresql" not in DATABASE_URL:
    print("Задайте DATABASE_URL в .env (postgresql://...)")
    sys.exit(1)

# имена enum-типов из миграций
ENUMS = [
    "groupstatus",
    "studentstatus",
    "programstatus",
    "topicstatus",
    "characteristicstatus",
    "studentprogramlinkstatus",
]

def main():
    try:
        import psycopg2
    except ImportError:
        print("Установите psycopg2: pip install psycopg2-binary")
        sys.exit(1)

    import re
    # убрать async из URL если есть (psycopg2 не понимает)
    url = re.sub(r"^postgresql\+async", "postgresql", DATABASE_URL, flags=re.I)
    url = re.sub(r"^postgresql\+psycopg", "postgresql", url, flags=re.I)

    try:
        conn = psycopg2.connect(url)
    except Exception as e:
        print(f"Ошибка подключения: {e}")
        sys.exit(1)

    cur = conn.cursor()
    print("Значения ENUM в базе:\n")

    for enum_name in ENUMS:
        try:
            cur.execute("SELECT unnest(enum_range(NULL::%s))" % enum_name)
            values = [row[0] for row in cur.fetchall()]
            print(f"  {enum_name}: {values}")
        except Exception as e:
            print(f"  {enum_name}: (тип не найден или ошибка) {e}")

    print("\nПример данных из таблиц:")
    try:
        cur.execute("SELECT status FROM groups LIMIT 5")
        print("  groups.status:", [row[0] for row in cur.fetchall()])
    except Exception as e:
        print("  groups.status:", e)
    try:
        cur.execute("SELECT status FROM students LIMIT 5")
        print("  students.status:", [row[0] for row in cur.fetchall()])
    except Exception as e:
        print("  students.status:", e)

    cur.close()
    conn.close()
    print("\nГотово.")

if __name__ == "__main__":
    main()
