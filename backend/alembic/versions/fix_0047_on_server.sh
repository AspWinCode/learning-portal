#!/bin/bash
# Запустить на сервере из каталога ~/learning-portal (корень проекта):
#   bash backend/alembic/versions/fix_0047_on_server.sh

set -e
F="backend/alembic/versions/0047_eight_lessons_units_extra.py"
cp "$F" "$F.bak"
python3 << 'PY'
path = "backend/alembic/versions/0047_eight_lessons_units_extra.py"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()
# Удаляем вызов ALTER TYPE (тип в БД — VARCHAR, не ENUM)
import re
content = re.sub(
    r"\n\s*#.*studentaccounttransactionkind.*\n\s*op\.execute\([^)]*\"\"\".*?ALTER TYPE studentaccounttransactionkind ADD VALUE[^\"]*\"\"\"\s*\)\s*\n",
    "\n    # kind в student_account_transactions — обычный VARCHAR (миграция 0022), не PG ENUM; значение 'extra_lesson_deduction' пишем как строку, менять тип не нужно\n\n",
    content,
    flags=re.DOTALL,
)
if "ALTER TYPE studentaccounttransactionkind" in content or ("studentaccounttransactionkind" in content and "op.execute" in content):
    # Fallback: построчно убрать только строки с ALTER TYPE
    lines = content.splitlines(keepends=True)
    out = []
    skip_until_empty = False
    for i, line in enumerate(lines):
        if "ALTER TYPE studentaccounttransactionkind" in line:
            skip_until_empty = True
            continue
        if skip_until_empty and (line.strip() == "" or (i + 1 < len(lines) and "op.execute" not in lines[i + 1])):
            skip_until_empty = False
        if "#.*studentaccounttransactionkind.*add" in line.replace(" ", ""):
            out.append("    # kind в student_account_transactions — обычный VARCHAR (миграция 0022), не PG ENUM; значение 'extra_lesson_deduction' пишем как строку, менять тип не нужно\n")
            continue
        out.append(line)
    content = "".join(out)
with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("Файл обновлён. Проверка: grep studentaccounttransactionkind", path)
PY
grep -n "ALTER TYPE\|studentaccounttransactionkind" "$F" || true
