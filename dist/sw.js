/* ScoutHub Service Worker — Push Notifications */
const CACHE = 'scouthub-sw-v2';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

/* ── Push event ── */
self.addEventListener('push', function (event) {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* ignore */ }

  const title = data.title || 'Scouty';
  const options = {
    body:             data.message || '',
    icon:             '/logo.png',
    badge:            '/logo.png',
    tag:              data.id || 'scouthub-notif',
    renotify:         true,
    data:             { link: data.link || '/', id: data.id },
    requireInteraction: true,
  };

  // Notify all open app clients immediately (independent of showNotification)
  const notifyClients = self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then(clients => clients.forEach(c => c.postMessage({ type: 'REFETCH_NOTIFICATIONS' })))
    .catch(() => {/* ignore */});

  // showNotification is required by Chrome (otherwise it shows a generic one)
  const show = self.registration.showNotification(title, options).catch(() => {/* ignore */});

  event.waitUntil(Promise.all([show, notifyClients]));
});

/* ── Notification click ── */
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const link = event.notification.data?.link || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      const id = event.notification.data?.id;
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          client.postMessage({ type: 'NAVIGATE', link, id });
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(link);
    })
  );
});
