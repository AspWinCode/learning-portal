import { useEffect, useRef, useState } from 'react';
import type { SheetDetail } from '../types/smartTables';

// Realtime (Phase 6): собственный WebSocket, не Yjs/Liveblocks (см.
// docs/smart-tables-architecture.md, раздел K). Прогрессивное улучшение —
// если соединение не устанавливается (например, прод-nginx ещё не
// настроен на проксирование WS-апгрейда для этого пути), грид продолжает
// работать через обычные HTTP-запросы, просто без live-обновлений от
// других пользователей; автопереподключение с фиксированной паузой.

export interface PresenceUser {
  id: number;
  name: string;
}

interface RealtimeHandlers {
  onSheetUpdate: (sheet: SheetDetail, actorId: number) => void;
}

const RECONNECT_DELAY_MS = 3000;

export function useSmartTableRealtime(sheetId: number | null, handlers: RealtimeHandlers) {
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [connected, setConnected] = useState(false);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (sheetId === null) return undefined;
    const token = localStorage.getItem('token');
    if (!token) return undefined;

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const connect = () => {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(
        `${proto}://${window.location.host}/api/v1/smart-tables/sheets/${sheetId}/ws?token=${encodeURIComponent(token)}`
      );
      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!stopped) reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      };
      ws.onmessage = (event) => {
        let data: any;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
        if (data.type === 'presence') {
          setPresence(data.users || []);
        } else if (data.type === 'operation_applied') {
          handlersRef.current.onSheetUpdate(data.sheet, data.actor_id);
        }
      };
    };
    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      setPresence([]);
      ws?.close();
    };
  }, [sheetId]);

  return { presence, connected };
}
