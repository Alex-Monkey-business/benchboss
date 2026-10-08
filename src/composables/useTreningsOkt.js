import { ref } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { registerReset } from '../stores/dataReset'
import { scoped, cohortId } from '../lib/scope'

// Økta: hvem som er her, og trenernes inngrep i gruppene. Delt mellom
// trenerne — det én trykker, står hos de andre innen noen sekunder.
//
// Appen har med vilje ingen websocket-klient (se supabase.js). Mens økta er
// åpen og synlig hentes den på nytt hvert femte sekund; det er tre små
// spørringer, og på feltet merkes ikke fem sekunder.
//
// Alt skrives optimistisk: navnet forsvinner med en gang du trykker, og
// lagringen går i bakgrunnen. Feiler den, hentes sannheten på nytt.

const run = ref(null) // { id, session_id, dato, started_at, state, spillere: [], trenere: [] }
const lastet = ref(false)
let aktiv = null // { sessionId, dato }
let timer = null
// Skrivinger på vei. Mens de går, skal ikke en henting legge gammel sannhet
// tilbake over det treneren nettopp trykket.
let underveis = 0

registerReset(() => { run.value = null; lastet.value = false })

function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Datoen treningsdagen gjelder: i dag hvis det er dagen, ellers neste gang
// den kommer. Uten ukedag er det i dag.
export function datoFor(session) {
  const d = new Date()
  const wd = session?.weekday
  if (!wd) return iso(d)
  const idag = d.getDay() === 0 ? 7 : d.getDay()
  d.setDate(d.getDate() + ((wd - idag + 7) % 7))
  return iso(d)
}

const UTVALG = 'id, session_id, title, dato, started_at, state, training_run_players(player_id), training_run_coaches(coach_id)'

function form(r) {
  if (!r) return null
  return {
    id: r.id, session_id: r.session_id, title: r.title, dato: r.dato, started_at: r.started_at,
    state: r.state || {},
    spillere: (r.training_run_players || []).map(x => x.player_id),
    trenere: (r.training_run_coaches || []).map(x => x.coach_id)
  }
}

async function hent() {
  if (!aktiv || !isSupabaseConfigured) { lastet.value = true; return }
  const { sessionId, dato } = aktiv
  const { data, error } = await scoped(
    supabase.from('training_runs').select(UTVALG)
  ).eq('session_id', sessionId).eq('dato', dato).maybeSingle()
  if (underveis || aktiv?.sessionId !== sessionId) return
  if (!error) run.value = form(data)
  lastet.value = true
}

async function skriv(fn) {
  underveis++
  try {
    const { error } = await fn()
    if (error) console.warn('Økta: lagring feilet', error.message)
    return !error
  } finally {
    underveis--
    if (!underveis) hent()
  }
}

function påSynlig() {
  if (document.visibilityState === 'visible') hent()
}

export function useTreningsOkt() {
  return {
    run,
    lastet,

    // Følg økta for én treningsdag. Returnerer stopp.
    folg(session) {
      const dato = datoFor(session)
      if (aktiv?.sessionId !== session.id || aktiv?.dato !== dato) {
        run.value = null
        lastet.value = false
      }
      aktiv = { sessionId: session.id, dato }
      hent()
      clearInterval(timer)
      timer = setInterval(() => { if (document.visibilityState === 'visible') hent() }, 5000)
      document.addEventListener('visibilitychange', påSynlig)
      return () => {
        clearInterval(timer)
        timer = null
        document.removeEventListener('visibilitychange', påSynlig)
      }
    },

    // Start økta med dem som er her. Har en annen trener startet den først,
    // gjelder hans oppmøte — vi skriver ikke over det.
    async start(session, spillere, trenere) {
      const dato = datoFor(session)
      if (!isSupabaseConfigured) {
        run.value = { id: 'demo-run', session_id: session.id, dato, started_at: new Date().toISOString(), state: {}, spillere: [...spillere], trenere: [...trenere] }
        return true
      }
      underveis++
      try {
        const { data: ny, error } = await supabase.from('training_runs')
          .upsert({ session_id: session.id, dato, cohort_id: cohortId() }, { onConflict: 'session_id,dato', ignoreDuplicates: true })
          .select('id')
        if (error) return false
        if (ny?.length) {
          const id = ny[0].id
          const [a, b] = await Promise.all([
            spillere.length ? supabase.from('training_run_players').insert(spillere.map(p => ({ run_id: id, player_id: p, cohort_id: cohortId() }))).select('player_id') : { error: null },
            trenere.length ? supabase.from('training_run_coaches').insert(trenere.map(c => ({ run_id: id, coach_id: c, cohort_id: cohortId() }))).select('coach_id') : { error: null }
          ])
          if (a.error || b.error) console.warn('Økta: oppmøtet ble ikke lagret helt', a.error?.message || b.error?.message)
        }
        return true
      } finally {
        underveis--
        await hent()
      }
    },

    async settSpiller(id, her) {
      const r = run.value
      if (!r) return
      r.spillere = her ? [...new Set([...r.spillere, id])] : r.spillere.filter(x => x !== id)
      if (!isSupabaseConfigured) return
      await skriv(() => her
        ? supabase.from('training_run_players').upsert({ run_id: r.id, player_id: id, cohort_id: cohortId() }, { onConflict: 'run_id,player_id' }).select('player_id')
        : supabase.from('training_run_players').delete().eq('run_id', r.id).eq('player_id', id).select('player_id'))
    },

    async settTrener(id, her) {
      const r = run.value
      if (!r) return
      r.trenere = her ? [...new Set([...r.trenere, id])] : r.trenere.filter(x => x !== id)
      if (!isSupabaseConfigured) return
      await skriv(() => her
        ? supabase.from('training_run_coaches').upsert({ run_id: r.id, coach_id: id, cohort_id: cohortId() }, { onConflict: 'run_id,coach_id' }).select('coach_id')
        : supabase.from('training_run_coaches').delete().eq('run_id', r.id).eq('coach_id', id).select('coach_id'))
    },

    // Én øvelses inngrep: { seed, antall, bytter }. Flettes inn i basen, så to
    // trenere på hver sin øvelse ikke skriver over hverandre.
    async settInngrep(nokkel, verdi) {
      const r = run.value
      if (!r) return
      r.state = { ...r.state, [nokkel]: verdi }
      if (!isSupabaseConfigured) return
      await skriv(() => supabase.rpc('bb_run_set_state', { p_run: r.id, p_key: nokkel, p_value: verdi }))
    },

    // Avbryt en økt som ble startet ved en feil — oppmøtet går med.
    async slett() {
      const r = run.value
      if (!r) return
      run.value = null
      if (!isSupabaseConfigured) return
      await skriv(() => supabase.from('training_runs').delete().eq('id', r.id).select('id'))
    }
  }
}

// Oppmøtet i en sesong, for statistikken. { okter, perSpiller: { id: antall } }
export async function hentOppmote(seasonId) {
  if (!isSupabaseConfigured) return { okter: 0, perSpiller: {} }
  let q = scoped(supabase.from('training_runs').select('id, training_run_players(player_id)'))
  if (seasonId) q = q.eq('season_id', seasonId)
  const { data, error } = await q
  if (error || !data) return { okter: 0, perSpiller: {} }
  const perSpiller = {}
  for (const r of data) for (const p of r.training_run_players || []) perSpiller[p.player_id] = (perSpiller[p.player_id] || 0) + 1
  return { okter: data.length, perSpiller }
}
