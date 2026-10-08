import { ref } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { registerReset } from '../stores/dataReset'
import { scoped, cohortId } from '../lib/scope'

// «Vi er 21» — antallet på dagens trening, delt mellom trenerne.
//
// Én trener setter tallet på feltet, og det står hos de andre innen noen
// sekunder.
//
// Skrivingen venter et øyeblikk etter siste trykk: fem trykk på pila er én
// lagring, ikke fem.

// { [`${sessionId}|${dato}`]: antall }
const antall = ref({})
const ventende = new Map()

registerReset(() => { antall.value = {} })

function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Datoen treningsdagen gjelder: i dag hvis det er dagen, ellers neste gang den
// kommer. Uten ukedag er det i dag.
export function datoFor(session) {
  const d = new Date()
  const wd = session?.weekday
  if (!wd) return iso(d)
  const idag = d.getDay() === 0 ? 7 : d.getDay()
  d.setDate(d.getDate() + ((wd - idag + 7) % 7))
  return iso(d)
}

const nokkel = (sessionId, dato) => `${sessionId}|${dato}`

async function hent() {
  if (!isSupabaseConfigured) return
  const { data, error } = await scoped(
    supabase.from('training_counts').select('session_id, dato, antall')
  ).gte('dato', iso(new Date()))
  if (error || !data) return
  const ut = {}
  for (const r of data) ut[nokkel(r.session_id, r.dato)] = r.antall
  // Det du nettopp trykket og ikke har lagret ennå, vinner over basen.
  for (const [k, v] of ventende) {
    if (v.antall) ut[k] = v.antall
    else delete ut[k]
  }
  antall.value = ut
}

// Henter på nytt hvert åttende sekund mens Trening er åpen og synlig, og med
// en gang appen kommer tilbake i forgrunnen. Appen har med vilje ingen
// websocket-klient (se supabase.js), og en spørring på noen få rader hvert
// åttende sekund koster mindre enn å dra den inn.
const INTERVALL = 8000
let timer = null
let brukere = 0

function påSynlig() {
  if (document.visibilityState === 'visible') hent()
}

function startHenting() {
  brukere++
  if (brukere > 1 || typeof document === 'undefined') return
  document.addEventListener('visibilitychange', påSynlig)
  timer = setInterval(() => { if (document.visibilityState === 'visible') hent() }, INTERVALL)
}

function stoppHenting() {
  brukere = Math.max(0, brukere - 1)
  if (brukere) return
  clearInterval(timer)
  timer = null
  document.removeEventListener('visibilitychange', påSynlig)
}

async function lagre(sessionId, dato, n) {
  if (!isSupabaseConfigured) return
  const key = nokkel(sessionId, dato)
  const q = n
    ? supabase.from('training_counts')
        .upsert({ session_id: sessionId, dato, antall: n, cohort_id: cohortId() }, { onConflict: 'session_id,dato' })
        .select('antall')
    : supabase.from('training_counts').delete().eq('session_id', sessionId).eq('dato', dato).select('session_id')
  const { error } = await q
  // Vant ingen ny trykk mens vi lagret, er vi ferdige med denne.
  if (ventende.get(key)?.n === n) ventende.delete(key)
  if (error) hent()
}

export function useTreningsAntall() {
  return {
    antall,
    // Returnerer stopp — kall den når flaten forsvinner.
    start() {
      hent()
      startHenting()
      let stoppet = false
      return () => { if (!stoppet) { stoppet = true; stoppHenting() } }
    },
    antallFor(session) {
      if (!session) return null
      return antall.value[nokkel(session.id, datoFor(session))] ?? null
    },
    settAntall(session, n) {
      const dato = datoFor(session)
      const key = nokkel(session.id, dato)
      const verdi = n && n > 0 ? Math.min(60, Math.round(n)) : null
      const neste = { ...antall.value }
      if (verdi) neste[key] = verdi
      else delete neste[key]
      antall.value = neste

      const forrige = ventende.get(key)
      if (forrige) clearTimeout(forrige.t)
      const t = setTimeout(() => lagre(session.id, dato, verdi), 500)
      ventende.set(key, { t, n: verdi, antall: verdi })
    }
  }
}
