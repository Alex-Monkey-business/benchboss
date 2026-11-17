import { ref, watch } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { registerReset } from '../stores/dataReset'
import { scoped, cohortId } from '../lib/scope'
import { persistRef } from '../lib/persist'
import { cached } from '../lib/query'
import { folgMed, raskIgjen } from '../lib/poll'

// Økta: hvem som er her, og trenernes inngrep i gruppene. Delt mellom
// trenerne — det én trykker, står hos de andre innen noen sekunder.
//
// Appen har med vilje ingen websocket-klient (se supabase.js). Mens økta er
// åpen og synlig hentes den på nytt i samme runde som Del inn (lib/poll):
// hvert fjerde sekund, roligere når ingenting skjer.
//
// Dagens økter for kullet (én liten spørring) er kilden for alt: økta som
// følges, oppmøtet på Hjem og i Del inn. De lagres på telefonen med datoen,
// så Del inn åpner med det den vet — ikke «Laster …» — og ferskes i bakgrunnen.
//
// Alt skrives optimistisk: navnet forsvinner med en gang du trykker, og
// lagringen går i bakgrunnen. Feiler den, hentes sannheten på nytt.

const run = ref(null) // { id, session_id, dato, started_at, state, spillere: [], trenere: [] }
const lastet = ref(false)
let aktiv = null // { sessionId, dato }
// Skrivinger på vei. Mens de går, skal ikke en henting legge gammel sannhet
// tilbake over det treneren nettopp trykket.
let underveis = 0
// Øker ved hver skriving. En henting som startet før en skriving, kan komme
// tilbake etter at skrivingen er ferdig — med raden fra før. Den kastes.
let skriving = 0
// Dagens økter i kullet, med datoen de gjelder: { dato, rader: [form(r)] }.
const idag = persistRef('treningIdag', ref(null))

registerReset(() => { run.value = null; lastet.value = false; idag.value = null })

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

// Oppmøtet lagres bare på selve treningsdagen. Andre dager vises
// kjøreplanen uten at noe lagres — da kan du se hvordan det blir, uten at
// det havner i statistikken. En dag uten ukedag regnes som i dag.
export function erTreningsdag(session) {
  const wd = session?.weekday
  if (!wd) return true
  const d = new Date().getDay()
  return wd === (d === 0 ? 7 : d)
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

// Én spørring for dagens økter. Samtidige kall deler svaret — men bare hvis
// ingen skriving har skjedd siden spørringen startet.
let idagPagar = null // { p, skriving, dato }
function hentIdag(dato = datoFor()) {
  if (idagPagar && idagPagar.skriving === skriving && idagPagar.dato === dato) return idagPagar.p
  const fra = skriving
  const p = (async () => {
    const { data, error } = await scoped(supabase.from('training_runs').select(UTVALG)).eq('dato', dato)
    if (error) return null
    const rader = (data || []).map(form)
    if (fra === skriving && !underveis) idag.value = { dato, rader }
    return rader
  })().finally(() => { if (idagPagar?.p === p) idagPagar = null })
  idagPagar = { p, skriving: fra, dato }
  return p
}

// Det lokale trykket speiles i dagens liste, så Hjem og neste åpning av Del
// inn ser det samme som skjermen — også før neste henting.
watch(run, r => {
  const d = idag.value
  if (!r || r.lokal || !d || d.dato !== r.dato) return
  const rader = d.rader.filter(x => x.session_id !== r.session_id)
  idag.value = { dato: d.dato, rader: [...rader, { ...r, spillere: [...r.spillere], trenere: [...r.trenere] }] }
}, { deep: true })

// Svarer true når økta endret seg (for lib/poll).
async function hent() {
  if (!aktiv || !isSupabaseConfigured) { lastet.value = true; return false }
  const { sessionId, dato } = aktiv
  const fra = skriving
  const rader = await hentIdag(dato)
  if (underveis || fra !== skriving || aktiv?.sessionId !== sessionId || aktiv?.dato !== dato) return false
  // En plan som bare står på telefonen (ikke treningsdag) har ingen rad.
  if (run.value?.lokal && run.value.session_id === sessionId) { lastet.value = true; return false }
  if (!rader) { lastet.value = true; return false }
  const ny = rader.find(r => r.session_id === sessionId) || null
  const endret = JSON.stringify(ny) !== JSON.stringify(run.value)
  if (endret) run.value = ny
  lastet.value = true
  return endret
}

async function skriv(fn) {
  underveis++
  skriving++
  raskIgjen()
  try {
    const { error } = await fn()
    if (error) console.warn('Økta: lagring feilet', error.message)
    return !error
  } catch (e) {
    console.warn('Økta: lagring feilet', e?.message)
    return false
  } finally {
    underveis--
    skriving++
    if (!underveis) hent()
  }
}

export function useTreningsOkt() {
  return {
    run,
    lastet,

    // Følg økta for én treningsdag. Returnerer stopp.
    folg(session) {
      const dato = datoFor(session)
      const byttet = aktiv?.sessionId !== session.id || aktiv?.dato !== dato || (run.value?.lokal && run.value.session_id !== session.id)
      aktiv = { sessionId: session.id, dato }
      if (byttet) {
        // Dagens økter fra telefonen: står økta der, vises den med en gang.
        // Hentingen under fersker den i bakgrunnen.
        if (idag.value?.dato === dato) {
          run.value = idag.value.rader.find(r => r.session_id === session.id) || null
          lastet.value = true
        } else {
          run.value = null
          lastet.value = false
        }
      }
      hent()
      return folgMed('okt', () => hent())
    },

    // Lagre oppmøtet med dem som er her. Har en annen trener lagret først,
    // gjelder det oppmøtet — vi skriver ikke over det.
    // plan(runde) lager fordelingen — gjengene og lagene — som lagres på
    // økta sammen med oppmøtet. Trenerrotasjonen må være kjent først.
    // tving: treningen er valgt med vilje (Del inn), så oppmøtet lagres selv
    // om ukedagen ikke stemmer — økta er flyttet, eller dere kjører en annen.
    async start(session, spillere, trenere, rigger = null, plan = () => ({}), { tving = false } = {}) {
      const dato = datoFor(session)
      const lokal = !isSupabaseConfigured || (!tving && !erTreningsdag(session))
      if (lokal) {
        const runde = isSupabaseConfigured ? await tidligereOkter(dato) : 0
        run.value = { id: 'lokal', lokal: true, session_id: session.id, dato, started_at: new Date().toISOString(), state: { _runde: runde, ...(rigger ? { _rigger: rigger } : {}), ...plan(runde) }, spillere: [...spillere], trenere: [...trenere] }
        lastet.value = true
        return true
      }
      underveis++
      skriving++
      raskIgjen()
      try {
        // Trenerrotasjonen: hvor mange økter kullet har hatt før denne. Den
        // står fast på økta, så alle telefonene fordeler likt hele økta.
        const runde = await tidligereOkter(dato)
        const { data: ny, error } = await supabase.from('training_runs')
          .upsert({ session_id: session.id, dato, cohort_id: cohortId(), state: { _runde: runde, ...(rigger ? { _rigger: rigger } : {}), ...plan(runde) } }, { onConflict: 'session_id,dato', ignoreDuplicates: true })
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
        skriving++
        await hent()
      }
    },

    // Svarer true når det er lagret. Feiler det (typisk: ingen nett), settes
    // trykket tilbake her, og kalleren sier fra.
    async settSpiller(id, her) {
      const r = run.value
      if (!r) return false
      r.spillere = her ? [...new Set([...r.spillere, id])] : r.spillere.filter(x => x !== id)
      if (r.lokal) return true
      const ok = await skriv(() => her
        ? supabase.from('training_run_players').upsert({ run_id: r.id, player_id: id, cohort_id: cohortId() }, { onConflict: 'run_id,player_id' }).select('player_id')
        : supabase.from('training_run_players').delete().eq('run_id', r.id).eq('player_id', id).select('player_id'))
      if (!ok && run.value?.id === r.id) {
        const na = run.value
        na.spillere = her ? na.spillere.filter(x => x !== id) : [...new Set([...na.spillere, id])]
      }
      return ok
    },

    async settTrener(id, her) {
      const r = run.value
      if (!r) return false
      r.trenere = her ? [...new Set([...r.trenere, id])] : r.trenere.filter(x => x !== id)
      if (r.lokal) return true
      const ok = await skriv(() => her
        ? supabase.from('training_run_coaches').upsert({ run_id: r.id, coach_id: id, cohort_id: cohortId() }, { onConflict: 'run_id,coach_id' }).select('coach_id')
        : supabase.from('training_run_coaches').delete().eq('run_id', r.id).eq('coach_id', id).select('coach_id'))
      if (!ok && run.value?.id === r.id) {
        const na = run.value
        na.trenere = her ? na.trenere.filter(x => x !== id) : [...new Set([...na.trenere, id])]
      }
      return ok
    },

    // Én øvelses inngrep: { seed, antall, bytter }. Flettes inn i basen, så to
    // trenere på hver sin øvelse ikke skriver over hverandre.
    async settInngrep(nokkel, verdi) {
      const r = run.value
      if (!r) return
      r.state = { ...r.state, [nokkel]: verdi }
      if (r.lokal) return true
      return skriv(() => supabase.rpc('bb_run_set_state', { p_run: r.id, p_key: nokkel, p_value: verdi }))
    },

    // Nullstill: oppmøtet ble registrert ved en feil, eller for å prøve.
    // Alt går — det teller ikke i statistikken og ikke i trenerrotasjonen.
    async slett() {
      const r = run.value
      if (!r) return
      run.value = null
      if (r.lokal) return
      if (idag.value?.dato === r.dato) idag.value = { dato: r.dato, rader: idag.value.rader.filter(x => x.id !== r.id) }
      await skriv(() => supabase.from('training_runs').delete().eq('id', r.id).select('id'))
    }
  }
}

// Trenerrotasjonen: hvor mange økter kullet har hatt før denne datoen.
async function tidligereOkter(dato) {
  const { count } = await scoped(supabase.from('training_runs').select('id', { count: 'exact', head: true })).lt('dato', dato)
  return count || 0
}

// Dagens oppmøte per treningsdag, for Hjem, Del inn og uka: { session_id: antall }.
// Samme spørring som økta (hentIdag), og fersk i 30 s — Hjem og Del inn
// spurte hver for seg, og Del inn i tillegg samtidig som økta.
function tell(rader) {
  return Object.fromEntries(rader.filter(r => r.session_id).map(r => [r.session_id, r.spillere.length]))
}
const oppmoteFersk = cached(async dato => {
  const rader = await hentIdag(dato)
  return rader ? tell(rader) : null
}, 'oppmoteIdag', { ok: v => v !== null })

export async function hentDagensOppmote() {
  if (!isSupabaseConfigured) return {}
  return (await oppmoteFersk(datoFor())) || dagensOppmoteLagret() || {}
}

// Det telefonen vet om dagens oppmøte uten å spørre — null hvis den ikke vet.
export function dagensOppmoteLagret() {
  const d = idag.value
  return d && d.dato === datoFor() ? tell(d.rader) : null
}

// Oppmøtet i en sesong, for statistikken. { okter, perSpiller: { id: antall } }
async function hentOppmoteDb(seasonId) {
  let q = scoped(supabase.from('training_runs').select('id, training_run_players(player_id)'))
  if (seasonId) q = q.eq('season_id', seasonId)
  const { data, error } = await q
  if (error || !data) return null
  const perSpiller = {}
  for (const r of data) for (const p of r.training_run_players || []) perSpiller[p.player_id] = (perSpiller[p.player_id] || 0) + 1
  return { okter: data.length, perSpiller }
}
const sesongOppmoteFersk = cached(hentOppmoteDb, 'oppmoteSesong', { ok: v => v !== null })

export async function hentOppmote(seasonId) {
  if (!isSupabaseConfigured) return { okter: 0, perSpiller: {} }
  return (await sesongOppmoteFersk(seasonId || null)) || { okter: 0, perSpiller: {} }
}
