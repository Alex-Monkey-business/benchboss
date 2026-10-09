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

// Oppmøtet gjelder dagen det registreres: den dagen folk faktisk var der.
// Ikke neste gang ukedagen kommer — da lå et oppmøte registrert på en
// torsdag og ventet på lørdagens trenere, som om de allerede hadde startet.
// Flyttes en trening til en annen dag, stemmer datoen likevel.
export function datoFor() {
  return iso(new Date())
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

    // Hvem som var rigger sist — standard for neste økt.
    async sisteRigger() {
      if (!isSupabaseConfigured) return null
      const { data } = await scoped(supabase.from('training_runs').select('state'))
        .order('dato', { ascending: false }).order('started_at', { ascending: false }).limit(5)
      return (data || []).map(r => r.state?._rigger).find(Boolean) || null
    },

    // Lagre oppmøtet med dem som er her. Har en annen trener lagret først,
    // gjelder det oppmøtet — vi skriver ikke over det.
    async start(session, spillere, trenere, rigger = null) {
      const dato = datoFor(session)
      if (!isSupabaseConfigured) {
        run.value = { id: 'demo-run', session_id: session.id, dato, started_at: new Date().toISOString(), state: { _runde: 0, ...(rigger ? { _rigger: rigger } : {}) }, spillere: [...spillere], trenere: [...trenere] }
        return true
      }
      underveis++
      try {
        // Trenerrotasjonen: hvor mange økter kullet har hatt før denne. Den
        // står fast på økta, så alle telefonene fordeler likt hele økta.
        const { count } = await scoped(supabase.from('training_runs').select('id', { count: 'exact', head: true })).lt('dato', dato)
        const { data: ny, error } = await supabase.from('training_runs')
          .upsert({ session_id: session.id, dato, cohort_id: cohortId(), state: { _runde: count || 0, ...(rigger ? { _rigger: rigger } : {}) } }, { onConflict: 'session_id,dato', ignoreDuplicates: true })
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

    // Nullstill: oppmøtet ble registrert ved en feil, eller for å prøve.
    // Alt går — det teller ikke i statistikken og ikke i trenerrotasjonen.
    async slett() {
      const r = run.value
      if (!r) return
      run.value = null
      if (!isSupabaseConfigured) return
      await skriv(() => supabase.from('training_runs').delete().eq('id', r.id).select('id'))
    }
  }
}

// Dagens oppmøte per treningsdag, for dagsiden og uka: { session_id: antall }.
export async function hentDagensOppmote() {
  if (!isSupabaseConfigured) return {}
  const { data, error } = await scoped(supabase.from('training_runs').select('session_id, training_run_players(player_id)'))
    .eq('dato', datoFor())
  if (error || !data) return {}
  return Object.fromEntries(data.filter(r => r.session_id).map(r => [r.session_id, (r.training_run_players || []).length]))
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
