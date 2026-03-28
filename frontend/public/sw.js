self.addEventListener('push', (event) => {
  if (!event) return;
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (err) {
    payload = {};
  }
  const title = payload.title || 'Owner Workspace';
  const body = payload.body || 'Новое уведомление';
  const url = payload.url || '/owner-workspace/notifications';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: payload.kind || 'owner-workspace',
      data: { url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification && event.notification.data && event.notification.data.url) || '/owner-workspace/notifications';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
      return undefined;
    })
  );
});
