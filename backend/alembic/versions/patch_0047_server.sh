#!/bin/bash
# На сервере: вставить в терминал целиком (или сохранить как patch_0047_server.sh и запустить bash patch_0047_server.sh).
# Запускать из корня проекта: cd ~/learning-portal && bash backend/alembic/versions/patch_0047_server.sh

set -e
cd "$(dirname "$0")/../.."
F="backend/alembic/versions/0047_eight_lessons_units_extra.py"
[ -f "$F" ] || { echo "File $F not found"; exit 1; }
cp "$F" "$F.bak.$(date +%s)"

python3 << 'PY'
p = "backend/alembic/versions/0047_eight_lessons_units_extra.py"
with open(p, "r", encoding="utf-8") as f:
    s = f.read()
# Заменить старые create_index на op.execute с IF NOT EXISTS
old = '''    op.create_index("ix_lesson_slot_extra_policy_id", "lesson_slot_extra_policy", ["id"])
    op.create_index("ix_lesson_slot_extra_policy_group_id", "lesson_slot_extra_policy", ["group_id"])
    op.create_index("ix_lesson_slot_extra_policy_lesson_date", "lesson_slot_extra_policy", ["lesson_date"])'''
new = '''    # Индексы с IF NOT EXISTS на случай повторного запуска (PostgreSQL)
    op.execute("CREATE INDEX IF NOT EXISTS ix_lesson_slot_extra_policy_id ON lesson_slot_extra_policy (id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_lesson_slot_extra_policy_group_id ON lesson_slot_extra_policy (group_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_lesson_slot_extra_policy_lesson_date ON lesson_slot_extra_policy (lesson_date)")'''
if old not in s:
    print("Патч не применён: блок create_index не найден или уже заменён.")
    print("Проверьте: grep create_index", p)
    exit(1)
s = s.replace(old, new)
with open(p, "w", encoding="utf-8") as f:
    f.write(s)
print("Патч применён.")
PY

grep -n "CREATE INDEX IF NOT EXISTS" "$F" || true
echo ""
echo "Дальше: docker compose build backend --no-cache && docker compose run --rm backend python -m alembic stamp 0046_custom_lessons && docker compose run --rm backend python -m alembic upgrade head && docker compose up -d backend"
