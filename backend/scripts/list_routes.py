#!/usr/bin/env python3
"""Вывести маршруты приложения (для проверки на сервере: docker compose exec backend python scripts/list_routes.py)."""
import sys
import os

# Корень проекта = родитель каталога backend
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.main import app

def walk_routes(routes, prefix=""):
    for r in routes:
        p = getattr(r, "path", "") or ""
        full = (prefix.rstrip("/") + "/" + p.lstrip("/")) if p else prefix
        if hasattr(r, "methods") and r.methods:
            if "leads" in full:
                yield full, r.methods
        if hasattr(r, "routes"):
            yield from walk_routes(r.routes, full)

print("Маршруты с 'leads' в path:")
found = False
for path, methods in walk_routes(app.routes):
    print(f"  {sorted(methods)[0] if methods else '?'} {path}")
    if path == "/api/sales/leads" and methods and "GET" in methods:
        found = True
if not found:
    print("  GET /api/sales/leads НЕ НАЙДЕН")
print("\nЕсли GET /api/sales/leads нет — на сервере выполните:")
print("  cd ~/learning-portal && git pull origin main && docker compose build backend --no-cache && docker compose up -d backend")
