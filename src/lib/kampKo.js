import { ref, computed } from 'vue'

// Kø for kampmodus: mål, scorere og bytter som ikke har nådd basen ennå.
//
// På sidelinja er dekningen dårlig. Før ble et mål ført uten nett rullet
// tilbake, og treneren fikk en toast per trykk. Nå legges hver endring i en
// kø i localStorage, i rekkefølge, og flata viser den med en gang. Køen
// sendes når nettet kommer tilbake (online), når appen kommer fram igjen,
// og hvert femte sekund så lenge noe venter. Den overlever at appen lukkes.
//
// Hver post bærer sin egen id. Et forsøk kan ha nådd fram selv om svaret
// ikke kom tilbake, så et nytt forsøk må ikke telle dobbelt: mål sendes med
// id-en som nøkkel, scorere settes inn med id-en som rad-id, og et bytte som
// allerede er gjort, avvises av basen.
//
// Utførerne registreres av composablene (`utforer`). En post uten utfører
// venter til modulen er lastet.

const NOKKEL = 'bb:kampko:v1'
const INTERVALL_MS = 5000

function les() {
  try {
    const raw = localStorage.getItem(NOKKEL)
    const d = raw ? JSON.parse(raw) : []
    return Array.isArray(d) ? d : []
  } catch { return [] }
}

const ko = ref(les())
const utforere = new Map()
const svarLyttere = new Set()
let kjorer = false
let timer = null
let startet = false
// Hvem som er logget inn. Hver post bærer brukeren som la den, og sendes bare
// under samme innlogging. Settes av auth-storen.
let bruker = null

export function settBruker(id) {
  const ny = id || null
  if (ny === bruker) return
  bruker = ny
  if (bruker && ko.value.length) tom()
}

function lagre() {
  try {
    if (ko.value.length) localStorage.setItem(NOKKEL, JSON.stringify(ko.value))
    else localStorage.removeItem(NOKKEL)
  } catch { /* full: køen lever i minnet så lenge fanen gjør det */ }
}

export function nyId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  // Eldre nettlesere: v4 av Math.random er godt nok for en idempotensnøkkel.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

// Antall poster som venter. Flata viser én stille linje så lenge den er > 0.
export const ventende = computed(() => ko.value.length)

export function venterFor(matchId) {
  return ko.value.some(p => p.matchId === matchId)
}

export function poster(matchId) {
  return ko.value.filter(p => p.matchId === matchId)
}

export function utforer(type, fn) {
  utforere.set(type, fn)
  if (ko.value.some(p => p.type === type)) tom()
}

// (post, svar, feil) — feil er satt når posten ble forkastet.
export function paSvar(fn) {
  svarLyttere.add(fn)
  return () => svarLyttere.delete(fn)
}

export function legg(type, matchId, args, id = nyId()) {
  const post = { id, type, matchId, args, uid: bruker, t: Date.now(), forsok: 0 }
  ko.value = [...ko.value, post]
  lagre()
  start()
  tom()
  return post
}

// Ta ut en post som ikke er sendt ennå (angre før nettet kom). Svarer false
// hvis den er på vei eller allerede sendt.
export function trekk(id) {
  const i = ko.value.findIndex(p => p.id === id)
  if (i < 0 || (i === 0 && kjorer)) return false
  ko.value = ko.value.filter(p => p.id !== id)
  lagre()
  return true
}

// Alt som venter for én kamp ut (kampen nullstilles). Posten som er på vei,
// får gå.
export function forkastFor(matchId) {
  ko.value = ko.value.filter((p, i) => p.matchId !== matchId || (i === 0 && kjorer))
  lagre()
}

// Venter til posten har forlatt køen (sendt eller forkastet), høyst `ms`.
export function ventPa(id, ms = 4000) {
  if (!ko.value.some(p => p.id === id)) return Promise.resolve(true)
  return new Promise(resolve => {
    const t = setTimeout(() => { av(); resolve(false) }, ms)
    const av = paSvar(post => { if (post.id === id) { clearTimeout(t); av(); resolve(true) } })
  })
}

// Venter til alt for kampen er sendt (eller forkastet), høyst `ms`. Svarer
// false hvis noe fortsatt venter.
export function ventPaKamp(matchId, ms = 5000) {
  if (!venterFor(matchId)) return Promise.resolve(true)
  tom()
  return new Promise(resolve => {
    const t = setTimeout(() => { av(); resolve(!venterFor(matchId)) }, ms)
    const av = paSvar(() => {
      if (venterFor(matchId)) return
      clearTimeout(t); av(); resolve(true)
    })
  })
}

// Ingen nett, tidsavbrudd eller en server som ikke svarer: prøv igjen senere.
// Alt med en Postgres- eller PostgREST-kode er et svar, og kommer ikke til å
// bli annerledes av et nytt forsøk.
export function erForbigaende(e) {
  if (!e) return false
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const kode = String(e.code || '')
  // Utløpt token: fornyes ved neste forsøk. Ikke 401 generelt: «ingen
  // tilgang» (42501) blir ikke annerledes av å prøve igjen.
  if (/^PGRST30/.test(kode) || /jwt expired/i.test(e.message || '')) return true
  if (kode && kode !== '0') return false
  const status = Number(e.status || 0)
  if (status >= 500 || status === 408 || status === 429) return true
  // En feil uten kode og status er en programfeil, ikke nettet. Den blir ikke
  // bedre av et nytt forsøk, og skal ikke stenge køen.
  return /fetch|network|load failed|timeout|AuthRetryable|ERR_/i.test(`${e.name || ''} ${e.message || ''}`)
}

function varsle(post, svar, feil) {
  for (const fn of svarLyttere) { try { fn(post, svar, feil) } catch { /* lytterens problem */ } }
}

export async function tom() {
  if (kjorer || !ko.value.length) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  kjorer = true
  try {
    while (ko.value.length) {
      const post = ko.value[0]
      // Lagt av en annen bruker på samme telefon: aldri send den under denne
      // innloggingen. Er ingen logget inn ennå, venter køen.
      if (post.uid !== undefined && post.uid !== bruker) {
        if (!bruker) break
        ko.value = ko.value.filter(p => p.id !== post.id)
        lagre()
        continue
      }
      const fn = utforere.get(post.type)
      if (!fn) break
      let svar = null
      let forkastet = null
      try {
        svar = await fn(post.args, post)
      } catch (e) {
        if (erForbigaende(e)) {
          post.forsok++
          lagre()
          break
        }
        forkastet = e
        console.warn('[kampkø] forkastet', post.type, e?.code || '', e?.message || e)
      }
      ko.value = ko.value.filter(p => p.id !== post.id)
      lagre()
      varsle(post, svar, forkastet)
    }
  } finally {
    kjorer = false
    planlegg()
  }
}

function planlegg() {
  clearTimeout(timer)
  timer = null
  if (ko.value.length) timer = setTimeout(tom, INTERVALL_MS)
}

function start() {
  if (startet || typeof window === 'undefined') return
  startet = true
  window.addEventListener('online', () => tom())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tom()
  })
}

// Ved utlogging: en annen person på samme telefon skal ikke sende
// forrige persons endringer.
export function tomKo() {
  ko.value = []
  lagre()
}

if (ko.value.length) { start(); planlegg() }
