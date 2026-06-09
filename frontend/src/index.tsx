import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // Перезагружаем страницу, когда новый SW берёт управление
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        // Проверяем обновления при каждом открытии
        registration.update().catch(() => undefined);

        const activateWaiting = (sw: ServiceWorker) => {
          sw.postMessage({ type: 'SKIP_WAITING' });
        };

        // Если уже есть ожидающий воркер — активируем сразу
        if (registration.waiting) {
          activateWaiting(registration.waiting);
        }

        // Если новый воркер появится позже — тоже активируем
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              activateWaiting(newWorker);
            }
          });
        });
      })
      .catch(() => undefined);
  });
}

