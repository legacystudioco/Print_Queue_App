// Print Queue service worker.
//
// Two jobs only: (1) receive Web Push events and show a notification, and
// (2) route a click on that notification to the right screen. This file is
// served as-is from public/ (no build step, no bundler, no ES modules —
// service workers are registered by URL and Safari/iOS in particular is
// picky about anything fancier), so keep it plain and small. See
// docs/push-notifications.md and lib/client/push.ts for the registration
// side, and sw.test.ts for how this file's event handlers are verified.

const DEFAULT_ICON = '/icons/icon-192.png';
const FALLBACK_URL = '/dashboard';

self.addEventListener('install', () => {
  // Activate this version immediately rather than waiting for every open
  // tab to close — there's no old-version state worth preserving here.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'Print Queue', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Print Queue';
  const data = payload.data || {};

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      icon: DEFAULT_ICON,
      badge: DEFAULT_ICON,
      data,
      // Same job's completion notification replaces any earlier one for
      // that job instead of stacking duplicates in the notification tray.
      tag: data.completedJobId ? `print-completed-${data.completedJobId}` : undefined,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || FALLBACK_URL;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const targetPath = new URL(url, self.location.origin).pathname;
      for (const client of clientList) {
        if (new URL(client.url).pathname === targetPath && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
      return undefined;
    }),
  );
});
