const BUILD_VERSION = typeof __BUILD_VERSION__ !== 'undefined' ? __BUILD_VERSION__ : 'dev'
const POLL_INTERVAL_MS = 60_000

let started = false

async function check() {
  if (BUILD_VERSION === 'dev') return
  try {
    const r = await fetch('/version.json?_=' + Date.now(), { cache: 'no-store' })
    if (!r.ok) return
    const { version } = await r.json()
    if (version && version !== BUILD_VERSION) {
      window.location.reload()
    }
  } catch {}
}

async function unregisterOldServiceWorkers() {
  if (!('serviceWorker' in navigator)) return
  try {
    const regs = await navigator.serviceWorker.getRegistrations()
    const hasOldWorkbox = regs.some((r) => r.active?.scriptURL?.endsWith('/sw.js'))
    for (const reg of regs) await reg.unregister()
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
    if (hasOldWorkbox) window.location.reload()
  } catch {}
}

export function startVersionCheck() {
  if (started) return
  started = true
  unregisterOldServiceWorkers()
  setInterval(check, POLL_INTERVAL_MS)
  window.addEventListener('focus', check)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check()
  })
}
