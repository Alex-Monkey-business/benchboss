// Composablene skiller i dag ikke mellom «ingen rader» og «spørringen feilet»
// — begge ender som en tom liste, og `loaded` settes til true uansett. Når
// RLS kommer, blir «du har ikke tilgang» også en tom liste uten feil. Da
// rendrer views tom-tilstander som lyver.
//
// fetchRows returnerer null-rader ved feil, slik at kalleren kan holde
// status: 'error' og la UI-et si «kunne ikke laste» i stedet for «ingenting her».

import { registerReset } from '../stores/dataReset'

export const STATUS = {
  IDLE: 'idle',
  LOADING: 'loading',
  OK: 'ok',
  ERROR: 'error'
}

// Én forespørsel om gangen per henter. Hjem og bunnmenyen ba om cups og
// seriestatus i samme millisekund, og begge gikk til basen. Med denne deler
// de svaret. Argumentene er nøkkelen, så fetchMatches(a) og fetchMatches(b)
// er to ulike forespørsler.
//
// `name` gjør registeret delt på tvers av composable-kall: useCups() lager en
// ny fetchCups hver gang den kalles, men alle deler samme pågående henting.
const delt = new Map()
export function dedupe(fn, name = null) {
  const inflight = name ? delt : new Map()
  return (...args) => {
    const k = (name || '') + '|' + JSON.stringify(args)
    if (inflight.has(k)) return inflight.get(k)
    const p = Promise.resolve().then(() => fn(...args)).finally(() => inflight.delete(k))
    inflight.set(k, p)
    return p
  }
}

export async function fetchRows(builder, label) {
  const { data, error } = await builder
  if (error) {
    console.warn('[query]', label, error.code || '', error.message)
    return { rows: null, error }
  }
  return { rows: data ?? [], error: null }
}

// ── Ferskhet ────────────────────────────────────────────────────────────────
//
// Hver fane hentet alt på nytt ved hvert besøk: Hjem → Kamper → Hjem var tre
// fulle runder mot basen for data som var fire sekunder gammel. Nå regnes et
// svar som ferskt i 30 sekunder. Innenfor vinduet tegner skjermen det den har
// og spør ikke; etterpå (eller når appen kommer fram igjen etter mer enn 30 s)
// hentes det som før.
//
// Hver skriving mot basen (se supabase.js) gjør alt gammelt med en gang, så
// det du selv nettopp endret aldri skjules bak cachen. Generasjonen hindrer
// at en henting som startet FØR skrivingen, merker et gammelt svar som ferskt.
export const FERSK_MS = 30_000

const fersk = new Map() // nøkkel → { t, verdi }
const pagar = new Map() // nøkkel → { p, gen }
let generasjon = 0

function nokkelFor(name, args) { return name + '|' + JSON.stringify(args) }

// Alt (eller alt som starter med `prefix`) er gammelt fra nå.
export function invalidate(prefix = '') {
  generasjon++
  if (!prefix) { fersk.clear(); return }
  for (const k of fersk.keys()) if (k.startsWith(prefix + '|')) fersk.delete(k)
}

// cached(fn, 'navn') → en henter som bare går til basen når forrige svar er
// eldre enn maxAge. Samtidige kall deler samme forespørsel (som dedupe).
// `ok(verdi)` sier om svaret skal regnes som ferskt — en feilet henting skal
// prøves igjen ved neste besøk, ikke om 30 sekunder.
//
// `enPlass`: henteren fyller én delt liste (kampene for ÉN sesong). Da er
// bare siste nøkkel fersk — ellers ga A → B → A innen 30 s B sine kamper.
export function cached(fn, name, { maxAge = FERSK_MS, ok = null, enPlass = false } = {}) {
  function settFersk(k, verdi) {
    if (enPlass) for (const n of fersk.keys()) if (n !== k && n.startsWith(name + '|')) fersk.delete(n)
    fersk.set(k, { t: Date.now(), verdi })
  }
  function kjor(args, tving) {
    const k = nokkelFor(name, args)
    const treff = fersk.get(k)
    if (!tving && treff && Date.now() - treff.t < maxAge) return Promise.resolve(treff.verdi)
    const igang = pagar.get(k)
    if (igang && igang.gen === generasjon) return igang.p
    const gen = generasjon
    const p = Promise.resolve().then(() => fn(...args)).then(verdi => {
      if (gen === generasjon && (!ok || ok(verdi))) settFersk(k, verdi)
      // Fylte en annen nøkkel lista, er den ikke lenger fersk for de andre.
      else if (enPlass) for (const n of [...fersk.keys()]) if (n !== k && n.startsWith(name + '|')) fersk.delete(n)
      return verdi
    }).finally(() => { if (pagar.get(k)?.p === p) pagar.delete(k) })
    pagar.set(k, { p, gen })
    return p
  }
  const hent = (...args) => kjor(args, false)
  // Hent nå uansett (etter en import, en synk, et «oppdater»): svaret teller
  // som ferskt for de neste som spør.
  hent.force = (...args) => kjor(args, true)
  // Et svar som kom en annen vei (med en annen henting) teller også.
  hent.mark = (...args) => settFersk(nokkelFor(name, args), undefined)
  hent.invalidate = () => invalidate(name)
  return hent
}

registerReset(() => { invalidate(); pagar.clear() })
