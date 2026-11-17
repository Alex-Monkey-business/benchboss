import { useAuth } from '../stores/auth'

const BUILD_VERSION = typeof __BUILD_VERSION__ !== 'undefined' ? __BUILD_VERSION__ : 'dev'
const POLL_INTERVAL_MS = 60_000

let started = false
// Ny versjon funnet: venter til neste navigasjon. Appen lastes aldri på nytt
// mens noen ser på den — ikke når den kommer fram igjen, og ikke midt i en
// kamp. Neste trykk til en annen skjerm blir en full sidelast rett til
// målet, så ingen merker mer enn et vanlig sideskift.
let ventendeReload = false

// Kampmodus skal aldri lastes på nytt av seg selv (se vakten under): en
// reload midt i kampen tar klokka ut av hånda på treneren.
let pagar = null
let sist = 0
async function check() {
  if (ventendeReload) return
  if (BUILD_VERSION === 'dev') return
  // Fokus og synlighet kommer som et par når appen hentes fram: én sjekk.
  if (pagar || Date.now() - sist < 5000) return pagar
  sist = Date.now()
  pagar = (async () => {
    try {
      const r = await fetch('/version.json?_=' + Date.now(), { cache: 'no-store' })
      if (!r.ok) return
      const { version } = await r.json()
      if (version && version !== BUILD_VERSION) ventendeReload = true
    } catch {} finally { pagar = null }
  })()
  return pagar
}

async function unregisterOldServiceWorkers() {
  if (!('serviceWorker' in navigator)) return
  try {
    const regs = await navigator.serviceWorker.getRegistrations()
    // Only kill the legacy workbox SW (/sw.js) that cached stale bundles.
    // Leave /pwa-sw.js alone — it keeps the app installable and lets it
    // start offline (network-first for pages, only hashed /assets cached).
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
  router?.beforeEach((to, from) => {
    if (!ventendeReload || to.name === 'match-mode') return true
    // Kampmodus holder sesjonen til den er avmontert, som skjer ETTER denne
    // vakten. Går vi ut av kampmodus nå, er det trygt.
    const utAvKamp = from.name === 'match-mode'
    if (!utAvKamp && useAuth().sessionHeld.value) return true
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
