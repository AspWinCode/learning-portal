// Fix SW: bypasses cached 403 errors for zip.js and other resources
const BYPASS_PATTERNS = [
  '/external/zip.js/',
  '/res/',
  '/CppPlatform/',
  '/JsPlatform/'
];

self.addEventListener('fetch', event => {
  const url = event.request.url;
  const needsBypass = BYPASS_PATTERNS.some(p => url.includes(p));
  if (needsBypass) {
    event.respondWith(
      fetch(event.request.url, {cache: 'no-store'}).catch(() => fetch(event.request))
    );
  }
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
});
