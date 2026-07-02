import { useCallback, useEffect, useState } from 'react';
import { ownerWorkspaceApi } from '../services/api';
import type { OwnerWorkspaceWebPushStatus } from '../types';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const normalized = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(normalized);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return window.btoa(binary);
}

/** Подключение web push для текущего устройства/браузера (в т.ч. установленного PWA). */
export function useWebPush() {
  const [status, setStatus] = useState<OwnerWorkspaceWebPushStatus | null>(null);
  const [browserSupported, setBrowserSupported] = useState(false);
  const [permission, setPermission] = useState<string>('default');
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const supported =
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      typeof Notification !== 'undefined';
    setBrowserSupported(supported);
    setPermission(typeof Notification !== 'undefined' ? Notification.permission : 'default');
    try {
      setStatus(await ownerWorkspaceApi.getMyWebPushStatus());
    } catch {
      setStatus(null);
    }
    if (!supported) {
      setConnected(false);
      return;
    }
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      const subscription = await registration.pushManager.getSubscription();
      setConnected(Boolean(subscription));
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const connect = useCallback(async () => {
    if (busy) return;
    if (!status?.configured || !status.public_key) {
      setError('Web push не настроен на сервере.');
      return;
    }
    if (!browserSupported || typeof Notification === 'undefined') {
      setError('Этот браузер не поддерживает web push.');
      return;
    }
    setBusy(true);
    try {
      let perm = Notification.permission;
      if (perm !== 'granted') {
        perm = await Notification.requestPermission();
      }
      setPermission(perm);
      if (perm !== 'granted') {
        setError('Браузер не выдал разрешение на push-уведомления.');
        return;
      }
      const registration = await navigator.serviceWorker.register('/sw.js');
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(status.public_key),
        });
      }
      await ownerWorkspaceApi.upsertMyWebPushSubscription({
        endpoint: subscription.endpoint,
        p256dh: arrayBufferToBase64(subscription.getKey('p256dh')),
        auth: arrayBufferToBase64(subscription.getKey('auth')),
        user_agent: navigator.userAgent,
      });
      await ownerWorkspaceApi.patchMyPreferences({ notify_web_push_enabled: true });
      setError(null);
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Не удалось подключить web push.');
    } finally {
      setBusy(false);
    }
  }, [browserSupported, busy, refresh, status]);

  const disconnect = useCallback(async () => {
    if (busy || !browserSupported) return;
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      const subscription = await registration.pushManager.getSubscription();
      const endpoint = subscription?.endpoint || '';
      if (subscription) await subscription.unsubscribe();
      if (endpoint) await ownerWorkspaceApi.removeMyWebPushSubscription(endpoint);
      setError(null);
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Не удалось отключить web push.');
    } finally {
      setBusy(false);
    }
  }, [browserSupported, busy, refresh]);

  return { status, browserSupported, permission, connected, busy, error, connect, disconnect };
}
