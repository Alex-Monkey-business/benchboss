// Network-only service worker.
// Exists for ONE reason: Chrome requires a service worker with a fetch handler
// before it considers the app installable (fires beforeinstallprompt → enables
// the one-tap "Legg til på hjemskjerm" on Android).
//
// It NEVER caches anything — every request goes straight to the network. That
// keeps the installability box ticked without reintroducing the stale-bundle
// problem the old workbox SW caused. version.json polling stays the reload net.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (event) => {
  // Pure passthrough. No cache reads, no cache writes, ever.
  event.respondWith(fetch(event.request))
})
