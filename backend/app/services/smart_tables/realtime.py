"""Realtime-слой — Phase 6: собственный WebSocket + operation-log broadcast,
не Yjs/Liveblocks (выбор обоснован в docs/smart-tables-architecture.md,
раздел K: переиспользует уже спроектированный SpreadsheetOperation/
operation_log, не тянет новых зависимостей, данные не уходят к третьей
стороне).

Прод разворачивается одним uvicorn-процессом без --workers (см.
backend/Dockerfile) — поэтому in-memory ConnectionManager не костыль, а
осознанный выбор для MVP. Если прод перейдёт на несколько воркеров/подов,
broadcast нужно будет вынести в Redis pub/sub (Redis уже используется в
проекте для кэша — см. FastAPICache в app/main.py).

Нет полноценного CRDT-мержа при одновременном редактировании одной
ячейки: последняя применённая операция побеждает (last-writer-wins),
конфликт не показывается визуально — это сознательный компромисс MVP,
достаточный для внутренней команды (не тысячи одновременных правок
одной ячейки), а не публичного multiplayer-продукта.
"""
from __future__ import annotations

import json
from typing import Dict, List, Optional, Set

from fastapi import WebSocket

from app.models import User


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: Dict[int, Set[WebSocket]] = {}
        self._users: Dict[int, Dict[WebSocket, dict]] = {}

    async def connect(self, sheet_id: int, ws: WebSocket, user: User) -> None:
        await ws.accept()
        self._connections.setdefault(sheet_id, set()).add(ws)
        self._users.setdefault(sheet_id, {})[ws] = {
            "id": user.id,
            "name": getattr(user, "full_name", None) or getattr(user, "email", "?"),
        }
        await self._broadcast_presence(sheet_id)

    async def disconnect(self, sheet_id: int, ws: WebSocket) -> None:
        self._connections.get(sheet_id, set()).discard(ws)
        self._users.get(sheet_id, {}).pop(ws, None)
        await self._broadcast_presence(sheet_id)

    def presence(self, sheet_id: int) -> List[dict]:
        seen: Dict[int, dict] = {}
        for info in self._users.get(sheet_id, {}).values():
            seen[info["id"]] = info
        return list(seen.values())

    async def _broadcast_presence(self, sheet_id: int) -> None:
        await self.broadcast(sheet_id, {"type": "presence", "users": self.presence(sheet_id)})

    async def broadcast(self, sheet_id: int, message: dict, exclude: Optional[WebSocket] = None) -> None:
        text = json.dumps(message, ensure_ascii=False, default=str)
        dead = []
        for ws in self._connections.get(sheet_id, set()):
            if ws is exclude:
                continue
            try:
                await ws.send_text(text)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._connections.get(sheet_id, set()).discard(ws)
            self._users.get(sheet_id, {}).pop(ws, None)


manager = ConnectionManager()
