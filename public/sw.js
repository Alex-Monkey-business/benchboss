// Self-unregistering service worker.
// Replaces the old workbox-based SW that was caching stale bundles.
// On install: skip waiting and delete every cache.
// On activate: claim all clients, unregister self, then reload each client
// so they fetch fresh HTML + bundle directly from the network.

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim()
      const clients = await self.clients.matchAll({ type: 'window' })
      await self.registration.unregister()
      for (const client of clients) {
        client.navigate(client.url)
      }
    })()
  )
})

// Network-first for everything while this SW is alive — never serve from cache.
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request))
})
