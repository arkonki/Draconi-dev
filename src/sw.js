import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';

// 1. Standard PWA cleanup and precaching (handled by the plugin)
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
let activeChatContext = { partyId: null, active: false };
let activeEncounterContext = { partyId: null, active: false };

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'ACTIVE_CHAT_CONTEXT') {
    activeChatContext = {
      partyId: event.data.partyId || null,
      active: Boolean(event.data.active),
    };
  }

  if (event.data && event.data.type === 'ACTIVE_ENCOUNTER_CONTEXT') {
    activeEncounterContext = {
      partyId: event.data.partyId || null,
      active: Boolean(event.data.active),
    };
  }
});

clientsClaim();

const APP_ICON = '/icons/icon-192x192.png';

// 2. Google Fonts Caching (Migrated from your vite config)
// Cache Google Fonts Stylesheets
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new CacheFirst({
    cacheName: 'google-fonts-cache',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }),
    ],
  })
);

// Cache Google Fonts Webfonts
registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'gstatic-fonts-cache',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }),
    ],
  })
);

self.addEventListener('push', (event) => {
  if (!event.data) {
    return;
  }

  let payload = {};

  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'New Notification', body: event.data.text() };
  }

  const title = payload.title || 'New Notification';
  const targetPartyId = payload.data?.partyId || null;
  const targetView = payload.data?.view || null;

  if (targetView === 'chat' && activeChatContext.active && targetPartyId && activeChatContext.partyId === targetPartyId) {
    return;
  }

  if (targetView === 'encounter' && activeEncounterContext.active && targetPartyId && activeEncounterContext.partyId === targetPartyId) {
    return;
  }

  const options = {
    body: payload.body || '',
    icon: payload.icon || APP_ICON,
    badge: payload.badge || APP_ICON,
    tag: payload.tag || 'default-notification',
    renotify: payload.renotify ?? true,
    data: payload.data || { url: payload.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// 3. NOTIFICATION CLICK HANDLER
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const relativeTargetUrl = event.notification.data?.url || '/';
  const targetUrl = new URL(relativeTargetUrl, self.location.origin).toString();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      const matchingClient = windowClients.find((client) => client.url === targetUrl);
      if (matchingClient && 'focus' in matchingClient) {
        return matchingClient.focus();
      }

      for (const client of windowClients) {
        if ('focus' in client) {
          if ('navigate' in client && client.url !== targetUrl) {
            return client.navigate(targetUrl).then((navigatedClient) => navigatedClient?.focus());
          }
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
      return undefined;
    }),
  );
});
