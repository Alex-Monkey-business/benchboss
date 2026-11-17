// Service worker: appen starter uten nett.
//
// På sidelinja er dekningen dårlig. Uten denne ga en kald start uten nett
// nettleserens feilside, selv om kampen sto i køen på telefonen.
//
// Den rører bare to ting, og bare GET på samme domene:
//
// 1. /assets/* — filnavnene har innholdshash, en ny versjon er en ny fil.
//    Cache først, nettet bare for filer den ikke har. Trygt: en fil med
//    samme navn er alltid samme innhold.
// 2. Navigasjoner (sidelast) — nettet FØRST, alltid. Er du på nett, får du
//    alltid fersk index.html, nøyaktig som uten worker. Bare når nettet
//    feiler, svarer den med siste index.html den så. Det er slik appen
//    unngår det den hang på før: en worker som serverte gammel tilstand.
//
// Alt annet — Supabase, version.json, bilder, andre domener — går forbi
// workeren, rett på nettet. version.json-sjekken er fortsatt det som laster
// en ny versjon.
//
// Filene ligger i én cache per versjon (bygg). Før ble de eldste filene
// kastet når det ble for mange, og det kunne være filer en åpen fane
// fortsatt trengte. Nå beholdes denne versjonen og den forrige; eldre
// versjoner kastes hele når en ny index.html kommer.

const META = 'bb-meta'
const FILER = 'bb-assets-'
const INDEX = '/index.html'
const BYGG = '/__bb-bygg'
const BEHOLD = 2

let bygg = null // nyeste først

async function lesBygg() {
  if (bygg) return bygg
  try {
    const r = await (await caches.open(META)).match(BYGG)
    bygg = r ? await r.json() : []
  } catch { bygg = [] }
  if (!Array.isArray(bygg) || !bygg.length) bygg = ['start']
  return bygg
}

async function nyttBygg(id) {
  const liste = await lesBygg()
  if (liste[0] === id) return
  bygg = [id, ...liste.filter(x => x !== id)].slice(0, BEHOLD)
  const meta = await caches.open(META)
  await meta.put(BYGG, new Response(JSON.stringify(bygg), { headers: { 'Content-Type': 'application/json' } }))
  const keys = await caches.keys()
  await Promise.all(keys
    .filter(k => k.startsWith(FILER) && !bygg.includes(k.slice(FILER.length)))
    .map(k => caches.delete(k)))
}

// Byggets id: inngangsfila i index.html har innholdshash.
function byggId(html) {
  const m = html.match(/\/assets\/[^"'\s>]+\.js/)
  return m ? m[0] : null
}

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    // Fra forrige utgave (én felles cache): ta med siste index.html, så en
    // kald start uten nett virker også rett etter oppdateringen.
    if (keys.includes('bb-v1')) {
      try {
        const gammel = await (await caches.open('bb-v1')).match(INDEX)
        if (gammel) await (await caches.open(META)).put(INDEX, gammel)
      } catch { /* da kommer den med neste sidelast */ }
    }
    await Promise.all(keys.filter(k => k !== META && !k.startsWith(FILER)).map(k => caches.delete(k)))
    await self.clients.claim()
  })())
})

async function fil(request) {
  const treff = await caches.match(request)
  if (treff) return treff
  const res = await fetch(request)
  if (res.ok && res.type === 'basic') {
    const kopi = res.clone()
    lesBygg()
      .then(liste => caches.open(FILER + liste[0]))
      .then(c => c.put(request, kopi))
      .catch(() => {})
  }
  return res
}

async function side(request) {
  try {
    const res = await fetch(request)
    const type = res.headers.get('content-type') || ''
    if (res.ok && type.includes('text/html')) {
      // En ren kopi: et svar som kom via en omdirigering kan ikke brukes som
      // svar på en navigasjon senere.
      const tekst = await res.clone().text()
      const kopi = new Response(tekst, { status: 200, headers: { 'Content-Type': type } })
      caches.open(META).then(c => c.put(INDEX, kopi)).catch(() => {})
      // Før svaret går: filene siden ber om straks, skal i denne versjonens cache.
      const id = byggId(tekst)
      if (id) await nyttBygg(id).catch(() => {})
    }
    return res
  } catch (e) {
    const lagret = await caches.match(INDEX)
    if (lagret) return lagret
    throw e
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (req.mode === 'navigate') {
    event.respondWith(side(req))
    return
  }
  if (url.pathname.startsWith('/assets/')) event.respondWith(fil(req))
})
