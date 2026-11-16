import { useAuth } from '../stores/auth'

const BUILD_VERSION = typeof __BUILD_VERSION__ !== 'undefined' ? __BUILD_VERSION__ : 'dev'
const POLL_INTERVAL_MS = 60_000

let started = false
// Ny versjon funnet mens kampen pågår: venter til neste navigasjon.
let ventendeReload = false

// Kampmodus skal aldri lastes på nytt av seg selv. En reload midt i kampen
// tar klokka ut av hånda på treneren, mister wake lock og et ulagret bytte.
function kampPagar() {
  if (/\/kamp\/[^/]+\/live/.test(window.location.pathname)) return true
  return !!useAuth().sessionHeld.value
}

async function check() {
  if (ventendeReload) return
  if (BUILD_VERSION === 'dev') return
  try {
    const r = await fetch('/version.json?_=' + Date.now(), { cache: 'no-store' })
    if (!r.ok) return
    const { version } = await r.json()
    if (version && version !== BUILD_VERSION) {
      if (kampPagar()) ventendeReload = true
      else window.location.reload()
    }
  } catch {}
}

async function unregisterOldServiceWorkers() {
  if (!('serviceWorker' in navigator)) return
  try {
    const regs = await navigator.serviceWorker.getRegistrations()
    // Only kill the legacy workbox SW (/sw.js) that cached stale bundles.
    // Leave the network-only /pwa-sw.js alone — it never caches and is what
    // keeps the app installable on Android.
    let removedOldWorkbox = false
    for (const reg of regs) {
      if (reg.active?.scriptURL?.endsWith('/sw.js')) {
        await reg.unregister()
        removedOldWorkbox = true
      }
    }
    if (removedOldWorkbox) {
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      }
      window.location.reload()
    }
  } catch {}
}

export function startVersionCheck(router) {
  if (started) return
  started = true
  // Den utsatte oppdateringen tas ved neste navigasjon ut av kampmodus: en
  // full sidelast rett til målet, så ingen merker mer enn et vanlig sideskift.
  router?.beforeEach(to => {
    if (!ventendeReload || to.name === 'match-mode' || useAuth().sessionHeld.value) return true
    window.location.assign(router.resolve(to.fullPath).href)
    return false
  })
  unregisterOldServiceWorkers()
  setInterval(check, POLL_INTERVAL_MS)
  window.addEventListener('focus', check)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check()
  })
}
