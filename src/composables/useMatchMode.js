import { ref, computed, watch } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { registerReset } from '../stores/dataReset'
import { sesongHenter, flett } from '../lib/sesongRader'
import { planTransfer, transferableSeconds } from '../lib/timeTransfer'
import { legg, trekk, poster, venterFor, utforer, paSvar, nyId, ventPa, ventPaKamp } from '../lib/kampKo'
import { medVentendeMal } from './useMatchGoals'
import { persistRef } from '../lib/persist'
import { harOppstilling } from '../lib/matchCta'

// Event-sourced match mode. Spilletid telles ALDRI med en teller — den regnes
// ut fra kampklokka (match_sessions) + opphold på banen (match_stints).
// setInterval under driver KUN displayet; sannheten ligger i databasen og
// rekonstrueres fra running_since ved innlasting (overlever refresh/låst skjerm).

const session = ref(null)     // { match_id, status, clock_base_seconds, running_since, period }
const stints = ref([])        // kan spenne flere kamper når statistikk er lastet
const now = ref(Date.now())   // display-tikk
// Serverens klokke minus telefonens. Klokka regnes med serverens tid, så to
// trenere på hver sin telefon ser samme minutt selv om telefonene går ulikt.
const serverOffset = ref(0)
// Siste tilstand fra serveren utover sesjon og perioder: resultat og scorere.
// Flata leser den, så en annen treners mål også vises her.
const remote = ref(null)
// match_id → kampmodus-status, for hele kullet i én spørring fra kamplista.
// Kampsida vet da før den har hentet noe om kampen går, er ferdig eller har
// spilletid, og tegner riktig fase og riktige rader i første bilde.
// Huskes mellom oppstarter: ellers sa Hjem-kortet «Start kamp» om en kamp som
// gikk, til hentingen var ferdig.
const statusByMatch = persistRef('kampstatus', ref({}))
// Kampen `session` sist ble hentet for. `session` er null både når kampen ikke
// har noen sesjon og når den aldri er hentet; denne skiller de to.
let sesjonHentetFor = null
// match_id → er laget satt opp. Mangler nøkkelen, vet vi det ikke ennå.
// `session` er én for hele appen og står ofte på en annen kamp. Da sa
// kampsida og Hjem-kortet «Sett opp lag» om et lag som var satt opp, helt til
// sesjonen var hentet — på dårlig nett lenge, og for alltid om kallet feilet.
// Huskes mellom oppstarter, så første bilde sier det vi visste sist.
const oppstiltByMatch = persistRef('oppstilt', ref({}))
// Sesonger der vi har spurt etter alle sesjoner: en kamp uten rad der har
// ingen oppstilling.
const statusSesonger = ref({})

// Kun data. Tikk-timeren eies av komponentene som monterer den (ref-tellet),
// og skal ikke røres her.
registerReset(() => { session.value = null; stints.value = []; statusByMatch.value = {}; sesjonHentetFor = null; oppstiltByMatch.value = {}; statusSesonger.value = {} })

// Husk om laget er satt opp for kampene i `par` ([matchId, lineup]).
// lineup null = ingen sesjon, altså ikke satt opp.
function huskOppstilt(par) {
  let neste = null
  for (const [matchId, lineup] of par) {
    const ja = harOppstilling(lineup)
    if ((neste || oppstiltByMatch.value)[matchId] === ja) continue
    neste = neste || { ...oppstiltByMatch.value }
    neste[matchId] = ja
  }
  if (neste) oppstiltByMatch.value = neste
}

function husk(matchId, status) {
  if ((statusByMatch.value[matchId] ?? null) === (status ?? null)) return
  const neste = { ...statusByMatch.value }
  if (status) neste[matchId] = status
  else delete neste[matchId]
  statusByMatch.value = neste
}

// Sesjonsradene for kampene i `ider` (Hjem henter dagens og neste kamp):
// status og oppstilling i de samme kartene som kamplista og kampsida leser.
// En kamp uten rad har ingen sesjon.
function huskSesjoner(ider, rader) {
  const radFor = new Map(rader.map(r => [r.match_id, r]))
  for (const id of ider) husk(id, radFor.get(id)?.status)
  huskOppstilt(ider.map(id => [id, radFor.get(id)?.lineup || null]))
}
// Kampmodus endrer sesjonen underveis (start, slutt). Kartet følger med, så
// kampsida viser riktig fase når du går tilbake dit.
watch(session, s => {
  if (!s?.match_id) return
  husk(s.match_id, s.status)
  huskOppstilt([[s.match_id, s.lineup]])
})

// Ref-tellet 1s-intervall — kun for å redrive currentClock i UI.
let tickTimer = null
let tickRefs = 0
function startClockTick() {
  tickRefs++
  if (tickTimer) return
  tickTimer = setInterval(() => { now.value = Date.now() }, 1000)
}
function stopClockTick() {
  tickRefs = Math.max(0, tickRefs - 1)
  if (tickRefs === 0 && tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }
}

function nowIso() {
  return new Date().toISOString()
}

// De to spilte demo-kampene er ferdige 2×30. Uten session-raden er
// `clock_base_seconds` null, og da er både søylene og justeringen døde —
// transferableSeconds har ingen kamplengde å måle vinduet mot.
const DEMO_SESSIONS = {
  'dm-1': { match_id: 'dm-1', status: 'finished', clock_base_seconds: 3600, running_since: null, period: 2, period_count: 2, period_minutes: 30, lineup: null },
  'dm-2': { match_id: 'dm-2', status: 'finished', clock_base_seconds: 3600, running_since: null, period: 2, period_count: 2, period_minutes: 30, lineup: null }
}

// Lukkede stints fra de to spilte demo-kampene, så spilletid er synlig uten
// Supabase — både på Statistikk og på kampen.
const DEMO_STINTS = [
  { id: 'ds-1', match_id: 'dm-1', player_id: 'p-1', role: 'keeper', position: 'gk', on_clock: 0, off_clock: 3600 },
  { id: 'ds-2', match_id: 'dm-1', player_id: 'p-2', role: 'field', position: 'd1', on_clock: 0, off_clock: 3300 },
  { id: 'ds-3', match_id: 'dm-1', player_id: 'p-3', role: 'field', position: 'd2', on_clock: 0, off_clock: 2700 },
  { id: 'ds-4', match_id: 'dm-1', player_id: 'p-4', role: 'field', position: 'm1', on_clock: 600, off_clock: 3600 },
  { id: 'ds-5', match_id: 'dm-1', player_id: 'p-5', role: 'field', position: 'f1', on_clock: 1800, off_clock: 3600 },
  { id: 'ds-6', match_id: 'dm-2', player_id: 'p-10', role: 'field', position: 'm1', on_clock: 0, off_clock: 3600 },
  { id: 'ds-7', match_id: 'dm-2', player_id: 'p-12', role: 'field', position: 'd1', on_clock: 0, off_clock: 2400 },
  { id: 'ds-8', match_id: 'dm-2', player_id: 'p-14', role: 'field', position: 'f1', on_clock: 900, off_clock: 3600 }
]

// Aktuell kampklokke i sekunder (avledet — aldri lagret direkte).
function computeClock(sess, nowMs) {
  nowMs += serverOffset.value
  if (!sess) return 0
  if (sess.status === 'running' && sess.running_since) {
    const elapsed = (nowMs - Date.parse(sess.running_since)) / 1000
    return Math.max(0, Math.floor(sess.clock_base_seconds + elapsed))
  }
  return sess.clock_base_seconds || 0
}

// ── Flere trenere på samme kamp ─────────────────────────────────────────────
// Hver handling er en databasefunksjon (mm_*) som låser kampen, sjekker at den
// står slik denne telefonen tror, og svarer med hele den ferske tilstanden.
// Svarer den ok=false, har noen andre kommet først; tilstanden er da allerede
// tegnet på nytt, og feilen bærer `konflikt` så flata kan si fra. Mellom
// handlingene henter skjermen tilstanden jevnlig (sync).
let pending = 0
let gen = 0

function applyState(matchId, st) {
  if (!st) return
  if (st.now) serverOffset.value = Date.parse(st.now) - Date.now()
  session.value = st.session || null
  sesjonHentetFor = matchId
  huskOppstilt([[matchId, st.session?.lineup || null]])
  stints.value = stints.value.filter(s => s.match_id !== matchId).concat(medVentendeBytter(matchId, st.stints || []))
  remote.value = { matchId, score: medVentendeMaal(matchId, st.score || null), goals: medVentendeMal(matchId, st.goals || []) }
}

// ── Uten nett ───────────────────────────────────────────────────────────────
// Mål og bytter går gjennom kampkøen (lib/kampKo.js). Det som venter, legges
// oppå serverens tilstand hver gang den tegnes, så et mål eller et bytte gjort
// uten nett blir stående på skjermen til det er sendt.
function medVentendeMaal(matchId, score) {
  const ko = poster(matchId).filter(p => p.type === 'maal')
  if (!ko.length || !score) return score
  let h = score.home_score, b = score.away_score
  for (const p of ko) {
    if (p.args.p_hjemme) h = Math.max(0, (h || 0) + p.args.p_hjemme)
    if (p.args.p_borte) b = Math.max(0, (b || 0) + p.args.p_borte)
  }
  return { ...score, home_score: h, away_score: b }
}

function medVentendeBytter(matchId, rader) {
  const ko = poster(matchId).filter(p => p.type === 'bytte')
  if (!ko.length) return rader
  let ut = rader
  for (const p of ko) ut = gjettBytte(ut, matchId, p.args.p_ut, p.args.p_inn, p.args.p_klokke, 'ko-' + p.id)
  return ut
}

function gjettBytte(liste, matchId, utId, innId, klk, id) {
  const out = liste.find(s => s.match_id === matchId && s.player_id === utId && s.off_clock == null)
  if (!out || liste.some(s => s.match_id === matchId && s.player_id === innId && s.off_clock == null)) return liste
  return liste.map(x => x.id === out.id ? { ...x, off_clock: klk } : x)
    .concat([{ id, match_id: matchId, player_id: innId, role: out.role, position: out.position, on_clock: klk, off_clock: null }])
}

function koFeil(error, status) {
  return Object.assign(error || new Error('Fikk ikke lagret'), { status })
}

// Ny signatur først; finnes den ikke i basen ennå (migrasjonen kommer etter
// koden), den gamle. Svaret huskes, så den nye ikke prøves ved hvert kall.
const gammel = { mm_maal: false, mm_bytte: false }

async function nyEllerGammel(fn, args) {
  if (gammel[fn]) return null
  const r = await supabase.rpc(fn, args)
  if (r.error?.code === 'PGRST202') { gammel[fn] = true; return null }
  if (r.error) throw koFeil(r.error, r.status)
  return r
}

function stilling(st) {
  return { h: st?.score?.home_score || 0, b: st?.score?.away_score || 0 }
}

utforer('maal', async (args, post) => {
  const { p_match, p_hjemme, p_borte } = args
  const ny = await nyEllerGammel('mm_maal', args)
  if (ny) return ny.data
  // Gammel base: ingen nøkkel, så et nytt forsøk kan telle målet to ganger.
  // Stillingen før første forsøk huskes på posten. Kom ikke svaret, sjekkes
  // stillingen før målet sendes igjen: står målet der, nådde det fram. Har
  // stillingen endret seg på en annen måte, vet vi ikke, og da sendes det
  // ikke på nytt.
  const t = await supabase.rpc('mm_tilstand', { p_match })
  if (t.error) throw koFeil(t.error, t.status)
  const na = stilling(t.data)
  const g = post.grunnlag
  if (g) {
    const venter = { h: Math.max(0, g.h + (p_hjemme || 0)), b: Math.max(0, g.b + (p_borte || 0)) }
    const likt = (x, y) => x.h === y.h && x.b === y.b
    if (!likt(na, g)) {
      if (likt(na, venter)) return { ...t.data, ok: true }
      throw Object.assign(new Error('Usikkert om målet ble lagret'), { code: 'BB_USIKKERT', usikkert: true })
    }
  }
  post.grunnlag = na
  const r = await supabase.rpc('mm_maal', { p_match, p_hjemme, p_borte })
  if (r.error) throw koFeil(r.error, r.status)
  return r.data
})

utforer('bytte', async ({ p_match, p_ut, p_inn, p_klokke }) => {
  const ny = await nyEllerGammel('mm_bytte', { p_match, p_ut, p_inn, p_klokke })
  if (ny) return ny.data
  const r = await supabase.rpc('mm_bytte', { p_match, p_ut, p_inn })
  if (r.error) throw koFeil(r.error, r.status)
  return r.data
})

// Byttekvitteringer for bytter som gikk gjennom køen: post-id → stint-id-er.
// Angre trenger dem.
const koKvitteringer = new Map()

paSvar((post, svar) => {
  if (post.type !== 'maal' && post.type !== 'bytte' && post.type !== 'scorer' && post.type !== 'fjernScorer') return
  gen++
  if (post.type === 'bytte' && svar?.ok) koKvitteringer.set(post.id, { outStintId: svar.out_stint || null, inStintId: svar.in_stint || null })
  // Siste svar når køen for kampen er tom, er hele den ferske tilstanden.
  if (svar && 'session' in svar && !venterFor(post.matchId) && session.value?.match_id === post.matchId) applyState(post.matchId, svar)
})

class Konflikt extends Error {
  constructor() { super('Kampen ble endret på en annen telefon'); this.konflikt = true }
}

async function rpc(fn, args, matchId) {
  pending++
  gen++
  try {
    const { data, error } = await supabase.rpc(fn, args)
    if (error) throw error
    applyState(matchId, data)
    if (data?.ok === false) throw new Konflikt()
    return data
  } finally {
    pending--
  }
}

// Optimistisk: flata flytter seg i samme trykk, svaret fra serveren erstatter
// gjetningen. Feiler det, legges forrige tilstand tilbake før serveren spørres
// på nytt. På sidelinja er 300 ms venting det som gjør at du trykker én gang
// til og bytter to.
async function optimistisk(matchId, gjett, fn, args) {
  const forSesjon = session.value ? { ...session.value } : null
  const forPerioder = stints.value.filter(x => x.match_id === matchId).map(x => ({ ...x }))
  try { gjett() } catch { /* gjetningen er bare pynt */ }
  try {
    return await rpc(fn, args, matchId)
  } catch (e) {
    // Bare denne kampen legges tilbake: andre kampers perioder kan ha blitt
    // hentet på nytt i mellomtiden.
    if (!e?.konflikt) {
      if (!session.value || session.value.match_id === matchId) session.value = forSesjon
      stints.value = stints.value.filter(x => x.match_id !== matchId).concat(forPerioder)
    }
    throw e
  }
}

// Kampstatusene (lista) og periodene (Statistikk) for ÉN sesong, ferske i
// 30 s. Før gjaldt begge hele kullet, alle sesonger. Kampmodus selv går
// utenom: der er det mm_tilstand og fetchStints(matchId) som gjelder.
// Oppstillingen er med, så kampsida vet om laget er satt opp før den har
// hentet noe selv. Den er liten: plassene og første bytte.
const statuserFersk = sesongHenter('match_sessions', 'match_id, status, lineup', 'mmStatus', (rader, kampIder) => {
  const neste = { ...statusByMatch.value }
  for (const id of kampIder) delete neste[id]
  for (const r of rader) neste[r.match_id] = r.status
  statusByMatch.value = neste
  const lineupFor = new Map(rader.map(r => [r.match_id, r.lineup]))
  huskOppstilt([...kampIder].map(id => [id, lineupFor.get(id) || null]))
})

// Bare kolonnene statistikken og spilletida leser — ikke cohort_id/created_at.
const STINT_KOLONNER = 'id, match_id, player_id, role, position, on_clock, off_clock'
const perioderFersk = sesongHenter('match_stints', STINT_KOLONNER, 'stints', (rader, kampIder) => {
  stints.value = flett(stints.value, rader, kampIder)
})

export function useMatchMode() {
  const currentClock = computed(() => computeClock(session.value, now.value))
  const isRunning = computed(() => session.value?.status === 'running')

  // ── Henting ───────────────────────────────────────────────────────────────
  async function fetchSession(matchId) {
    if (!isSupabaseConfigured) {
      if (session.value?.match_id !== matchId) {
        session.value = DEMO_SESSIONS[matchId] ? { ...DEMO_SESSIONS[matchId] } : null
      }
      sesjonHentetFor = matchId
      huskOppstilt([[matchId, session.value?.lineup || null]])
      return session.value
    }
    const { data, error } = await supabase
      .from('match_sessions')
      .select('*')
      .eq('match_id', matchId)
      .maybeSingle()
    // Feilet hentingen (nett), vet vi ingenting nytt. Å sette null her gjorde
    // en kamp i gang om til «ikke startet» på skjermen — behold det vi har.
    if (error) return session.value
    session.value = data || null
    sesjonHentetFor = matchId
    husk(matchId, data?.status)
    huskOppstilt([[matchId, data?.lineup || null]])
    return session.value
  }

  // Er laget satt opp? true/false, eller undefined når vi ikke vet det ennå.
  // Den hentede sesjonen vinner; så det vi husker; så sesongens sesjonsliste.
  function oppstillingFor(matchId, seasonId = null) {
    if (!matchId) return undefined
    if (session.value?.match_id === matchId) return harOppstilling(session.value.lineup)
    const kjent = oppstiltByMatch.value[matchId]
    if (kjent !== undefined) return kjent
    return seasonId && statusSesonger.value[seasonId] ? false : undefined
  }

  // Bare to kolonner, for sesongens kamper. Billig nok til å kjøres hver
  // gang kamplista åpnes.
  async function fetchSessionStatuses(seasonId) {
    if (!isSupabaseConfigured) {
      statusByMatch.value = Object.fromEntries(Object.values(DEMO_SESSIONS).map(s => [s.match_id, s.status]))
      huskOppstilt(Object.values(DEMO_SESSIONS).map(s => [s.match_id, s.lineup]))
      statusSesonger.value = { ...statusSesonger.value, [seasonId]: true }
      return statusByMatch.value
    }
    if (await statuserFersk(seasonId) === true && !statusSesonger.value[seasonId]) {
      statusSesonger.value = { ...statusSesonger.value, [seasonId]: true }
    }
    return statusByMatch.value
  }

  async function fetchStints(matchId) {
    if (!isSupabaseConfigured) {
      // Samme som for mål: uten seeding filtrerer kampdetalj mot en tom liste
      // og viser ingen spilletid før Statistikk har vært innom.
      if (stints.value.length === 0) stints.value = [...DEMO_STINTS]
      return stints.value.filter(s => s.match_id === matchId)
    }
    const { data } = await supabase
      .from('match_stints')
      .select('*')
      .eq('match_id', matchId)
    if (data) {
      stints.value = stints.value.filter(s => s.match_id !== matchId).concat(data)
    }
    return stints.value.filter(s => s.match_id === matchId)
  }

  // Sesongens stints — sesongstatistikk.
  // Demo: et lite sett lukkede stints fra dm-1 (Rød) og dm-2 (Grønn) så
  // spilletid per lag er synlig på statistikksiden uten Supabase.
  async function fetchSeasonStints(seasonId) {
    if (!isSupabaseConfigured) {
      if (stints.value.length === 0) stints.value = [...DEMO_STINTS]
      return stints.value
    }
    await perioderFersk(seasonId)
    return stints.value
  }

  // ── Session-skriving ────────────────────────────────────────────────────────
  async function writeSession(matchId, patch) {
    const next = { match_id: matchId, ...session.value, ...patch, updated_at: nowIso() }
    if (!isSupabaseConfigured) {
      session.value = next
      return next
    }
    const { data, error } = await supabase
      .from('match_sessions')
      .upsert(next, { onConflict: 'match_id' })
      .select()
      .single()
    if (error) throw error
    if (data) session.value = data
    return session.value
  }

  // Skrivene er optimistiske: lista oppdateres før svaret kommer, så banen
  // flytter seg i samme trykk. På sidelinja er 300 ms venting det som gjør at
  // du trykker én gang til og bytter to. Feiler skrivet, rulles lista tilbake
  // og feilen kastes videre — flata viser den.
  async function insertStints(rows) {
    if (!isSupabaseConfigured) {
      const created = rows.map((r, i) => ({ id: 'ms-' + Date.now() + '-' + i, off_clock: null, ...r }))
      stints.value.push(...created)
      return created
    }
    const temp = rows.map((r, i) => ({ id: 'tmp-' + Date.now() + '-' + i, off_clock: null, ...r }))
    stints.value.push(...temp)
    const { data, error } = await supabase.from('match_stints').insert(rows).select()
    const tempIds = new Set(temp.map(t => t.id))
    if (error || !data) {
      stints.value = stints.value.filter(s => !tempIds.has(s.id))
      throw error || new Error('Perioden ble ikke lagret')
    }
    stints.value = [...stints.value.filter(s => !tempIds.has(s.id)), ...data]
    return data
  }

  async function patchStint(stintId, patch) {
    const idx = stints.value.findIndex(s => s.id === stintId)
    const prev = idx > -1 ? stints.value[idx] : null
    if (prev) stints.value[idx] = { ...prev, ...patch }
    if (!isSupabaseConfigured) return
    const { data, error } = await supabase
      .from('match_stints')
      .update(patch)
      .eq('id', stintId)
      .select()
      .single()
    if (error) {
      const i = stints.value.findIndex(s => s.id === stintId)
      if (i > -1 && prev) stints.value[i] = prev
      throw error
    }
    if (data) {
      const i = stints.value.findIndex(s => s.id === stintId)
      if (i > -1) stints.value[i] = data
    }
  }

  async function deleteStint(stintId) {
    const prev = stints.value.find(s => s.id === stintId)
    stints.value = stints.value.filter(s => s.id !== stintId)
    if (!isSupabaseConfigured) return
    const { data, error } = await supabase
      .from('match_stints').delete().eq('id', stintId).select('id')
    // Spilletid er hele poenget med denne skjermen. Forsvinner en periode fra
    // lista uten å forsvinne fra basen, er summene feil resten av kampen.
    if (error || !data?.length) {
      if (prev) stints.value.push(prev)
      throw error || new Error('Perioden ble ikke slettet')
    }
  }

  function openStintFor(matchId, playerId) {
    return stints.value.find(
      s => s.match_id === matchId && s.player_id === playerId && s.off_clock == null
    )
  }

  // Lagre setup-tilstand (oppstilling { slotId: playerId } + kamplengde) —
  // overlever refresh og deles mellom trenere. Rører aldri en kamp i gang.
  async function saveSetup(matchId, patch) {
    if (session.value && session.value.status !== 'setup') return
    if (!isSupabaseConfigured) return writeSession(matchId, { status: 'setup', ...patch })
    await rpc('mm_lagre_oppsett', { p_match: matchId, p_lineup: patch.lineup }, matchId)
  }

  // ── Kamphandlinger ───────────────────────────────────────────────────────────
  // Avspark fra setup: start klokka og åpne stints for de som starter.
  // lineup = [{ playerId, role, position }] — én per slot i formasjonen.
  // config = { period_count, period_minutes } — skrives atomisk med starten
  // så en ventende debounced setup-lagring aldri kan rase med avsparket.
  async function startMatch(matchId, lineup, config = {}) {
    if (isSupabaseConfigured) {
      return rpc('mm_start', {
        p_match: matchId,
        p_lineup: lineup.map(p => ({ player_id: p.playerId, role: p.role || 'field', position: p.position || null })),
        p_config: config
      }, matchId)
    }
    await writeSession(matchId, {
      status: 'running',
      clock_base_seconds: 0,
      running_since: nowIso(),
      period: 1,
      ...config
    })
    const rows = lineup.map(p => ({
      match_id: matchId,
      player_id: p.playerId,
      role: p.role || 'field',
      position: p.position || null,
      on_clock: 0
    }))
    await insertStints(rows)
  }

  // Pause (halvtid/stopp): frys elapsed inn i clock_base_seconds.
  async function pauseClock(matchId) {
    if (session.value?.status !== 'running') return
    const frozen = computeClock(session.value, Date.now())
    if (isSupabaseConfigured) {
      return optimistisk(matchId,
        () => { session.value = { ...session.value, status: 'paused', clock_base_seconds: frozen, running_since: null, updated_at: new Date(Date.now() + serverOffset.value).toISOString() } },
        'mm_klokkehandling', { p_match: matchId, p_handling: 'pause', p_forventet: 'running' })
    }
    await writeSession(matchId, {
      status: 'paused',
      clock_base_seconds: frozen,
      running_since: null
    })
  }

  // Fortsett: klokka teller videre fra der den frøs (samme totale spilletid).
  async function resumeClock(matchId) {
    if (session.value?.status !== 'paused') return
    if (isSupabaseConfigured) {
      return optimistisk(matchId,
        () => { session.value = { ...session.value, status: 'running', running_since: new Date(Date.now() + serverOffset.value).toISOString() } },
        'mm_klokkehandling', { p_match: matchId, p_handling: 'fortsett', p_forventet: 'paused' })
    }
    await writeSession(matchId, { status: 'running', running_since: nowIso() })
  }

  // Auto-pause ved omgangsslutt — frys klokka eksakt på grensen.
  async function endHalfAt(matchId, seconds) {
    if (session.value?.status !== 'running') return
    if (isSupabaseConfigured) {
      return optimistisk(matchId,
        () => { session.value = { ...session.value, status: 'paused', clock_base_seconds: seconds, running_since: null, updated_at: new Date(Date.now() + serverOffset.value).toISOString() } },
        'mm_klokkehandling', { p_match: matchId, p_handling: 'omgang_slutt', p_forventet: 'running', p_sekunder: seconds })
    }
    await writeSession(matchId, { status: 'paused', clock_base_seconds: seconds, running_since: null })
  }

  // Start neste omgang — fortsett klokka og tell opp periode.
  async function startNextHalf(matchId) {
    if (isSupabaseConfigured) {
      return optimistisk(matchId,
        () => { session.value = { ...session.value, status: 'running', running_since: new Date(Date.now() + serverOffset.value).toISOString(), period: (session.value?.period || 1) + 1 } },
        'mm_klokkehandling', { p_match: matchId, p_handling: 'neste_omgang', p_forventet: 'paused' })
    }
    await writeSession(matchId, {
      status: 'running',
      running_since: nowIso(),
      period: (session.value?.period || 1) + 1
    })
  }

  // «Startet dere tidligere?» — flytt starten på omgangen som går N sekunder
  // bakover. Serveren flytter også bytter og mål som er ført etter trykket.
  async function startedEarlier(matchId, seconds) {
    if (session.value?.status !== 'running' || !(seconds > 0)) return
    if (isSupabaseConfigured) {
      return optimistisk(matchId,
        () => { session.value = { ...session.value, running_since: new Date(Date.parse(session.value.running_since) - seconds * 1000).toISOString() } },
        'mm_klokkehandling', { p_match: matchId, p_handling: 'tidligere_start', p_forventet: 'running', p_sekunder: Math.round(seconds) })
    }
    const base = session.value.clock_base_seconds || 0
    stints.value = stints.value.map(x => x.match_id !== matchId ? x : {
      ...x,
      on_clock: x.on_clock > base ? x.on_clock + seconds : x.on_clock,
      off_clock: x.off_clock != null && x.off_clock > base ? x.off_clock + seconds : x.off_clock
    })
    await writeSession(matchId, { running_since: new Date(Date.parse(session.value.running_since) - seconds * 1000).toISOString() })
  }

  // Bytte: lukk utgående spillers stint, åpne ny for innbytter
  // (arver rolle OG formasjons-slot).
  //
  // Returnerer en kvittering som undoSubstitute tar imot. Byttet går uten
  // bekreftelse på sidelinja; angre er det som gjør det trygt.
  async function substitute(matchId, { outPlayerId, inPlayerId }) {
    const clk = currentClock.value
    if (isSupabaseConfigured) {
      // Gjennom køen: banen flytter seg i samme trykk, også uten nett. Klokka
      // følger med, så et bytte sendt senere får riktig minutt.
      stints.value = gjettBytte(stints.value, matchId, outPlayerId, inPlayerId, clk, 'tmp-' + Date.now())
      const post = legg('bytte', matchId, { p_match: matchId, p_ut: outPlayerId, p_inn: inPlayerId, p_klokke: clk })
      return { koId: post.id, ut: outPlayerId, inn: inPlayerId, klk: clk }
    }
    const out = openStintFor(matchId, outPlayerId)
    const role = out?.role || 'field'
    const position = out?.position || null
    if (out) await patchStint(out.id, { off_clock: clk })
    const [inn] = await insertStints([{ match_id: matchId, player_id: inPlayerId, role, position, on_clock: clk }])
    return { outStintId: out?.id || null, inStintId: inn?.id || null }
  }

  // Angre et bytte: den nye perioden slettes, den gamle åpnes igjen. Ikke et
  // nytt bytte tilbake — det ville gitt to perioder på noen sekunder hver og
  // et tall i statistikken som aldri skjedde. Nekter hvis noe har hendt siden:
  // innbytteren er byttet ut igjen, eller den gamle perioden er rørt.
  async function undoSubstitute(matchId, receipt) {
    if (!receipt) return false
    if (receipt.koId) {
      // Ikke sendt ennå: ta det ut av køen og tegn banen på nytt uten det.
      if (trekk(receipt.koId)) {
        const { ut, inn, klk } = receipt
        const lukket = stints.value.filter(x => x.match_id === matchId && x.player_id === ut && x.off_clock === klk).pop()
        stints.value = stints.value
          .filter(x => !(x.match_id === matchId && x.player_id === inn && x.off_clock == null && x.on_clock === klk))
          .map(x => x === lukket ? { ...x, off_clock: null } : x)
        return true
      }
      // På vei akkurat nå: vent på svaret, så kan det angres som vanlig.
      if (!koKvitteringer.has(receipt.koId)) await ventPa(receipt.koId)
      const k = koKvitteringer.get(receipt.koId)
      if (!k) return false
      receipt = k
    }
    // Låst på serveren: sjekken mot telefonens kopi holder ikke når en annen
    // trener kan ha byttet innbytteren ut igjen de siste sekundene.
    if (isSupabaseConfigured) {
      try {
        await optimistisk(matchId, () => {
          stints.value = stints.value.filter(x => x.id !== receipt.inStintId)
            .map(x => x.id === receipt.outStintId ? { ...x, off_clock: null } : x)
        }, 'mm_angre_bytte', { p_match: matchId, p_ut_stint: receipt.outStintId, p_inn_stint: receipt.inStintId })
        return true
      } catch (e) {
        if (e?.konflikt) return false
        // Funksjonen er ikke i basen ennå (migrasjonen kommer etter koden).
        if (e?.code !== 'PGRST202') throw e
      }
    }
    const inn = stints.value.find(s => s.id === receipt.inStintId)
    if (!inn || inn.off_clock != null) return false
    const out = receipt.outStintId ? stints.value.find(s => s.id === receipt.outStintId) : null
    if (receipt.outStintId && (!out || out.off_clock == null)) return false
    await deleteStint(inn.id)
    if (out) await patchStint(out.id, { off_clock: null })
    return true
  }

  // Bytt plass live: to utespillere bytter formasjons-slot. Posisjon brukes
  // aldri i statistikk (kun rolle + spilletid telles), så vi relabler bare
  // `position` på de to åpne stintene — klokke og spilletid røres ikke.
  async function swapFieldPositions(matchId, aPlayerId, bPlayerId) {
    if (aPlayerId === bPlayerId) return
    if (isSupabaseConfigured) {
      return optimistisk(matchId, () => {
        const a = openStintFor(matchId, aPlayerId), b = openStintFor(matchId, bPlayerId)
        if (!a || !b) return
        stints.value = stints.value.map(x => x.id === a.id ? { ...x, position: b.position } : x.id === b.id ? { ...x, position: a.position } : x)
      }, 'mm_bytt_plass', { p_match: matchId, p_a: aPlayerId, p_b: bPlayerId })
    }
    const a = openStintFor(matchId, aPlayerId)
    const b = openStintFor(matchId, bPlayerId)
    if (!a || !b) return
    const aPos = a.position
    const bPos = b.position
    await patchStint(a.id, { position: bPos })
    await patchStint(b.id, { position: aPos })
  }

  // Keeper-bytte: en spiller på banen og keeperen bytter rolle OG plass.
  // Modelleres som lukk + åpne for begge ved gjeldende klokke.
  async function swapKeeper(matchId, playerId) {
    const clk = currentClock.value
    if (isSupabaseConfigured) {
      return rpc('mm_keeper', { p_match: matchId, p_spiller: playerId }, matchId)
    }
    const keeper = stints.value.find(
      s => s.match_id === matchId && s.role === 'keeper' && s.off_clock == null
    )
    const target = openStintFor(matchId, playerId)
    if (!target || keeper?.player_id === playerId) return

    if (keeper) {
      const keeperPos = keeper.position
      await patchStint(keeper.id, { off_clock: clk })
      await insertStints([{
        match_id: matchId, player_id: keeper.player_id,
        role: 'field', position: target.position, on_clock: clk
      }])
      await patchStint(target.id, { off_clock: clk })
      await insertStints([{
        match_id: matchId, player_id: playerId,
        role: 'keeper', position: keeperPos, on_clock: clk
      }])
    } else {
      // Ingen keeper på banen (kantcase) — bare gjør target til keeper.
      await patchStint(target.id, { off_clock: clk })
      await insertStints([{
        match_id: matchId, player_id: playerId,
        role: 'keeper', position: target.position, on_clock: clk
      }])
    }
  }

  // Avslutt: lukk alle åpne stints på gjeldende klokke, frys session.
  async function finishMatch(matchId) {
    const clk = currentClock.value
    if (isSupabaseConfigured) {
      // Et bytte eller mål som venter i køen, avvises når kampen er slutt.
      // Vent til køen for kampen er sendt; går det ikke, avsluttes ikke kampen.
      if (venterFor(matchId) && !(await ventPaKamp(matchId, 6000))) {
        throw Object.assign(new Error('Noe er ikke lagret ennå'), { code: 'BB_IKKE_LAGRET', ikkeLagret: true })
      }
      return rpc('mm_klokkehandling', { p_match: matchId, p_handling: 'avslutt', p_forventet: session.value?.status || 'running' }, matchId)
    }
    const open = stints.value.filter(s => s.match_id === matchId && s.off_clock == null)
    for (const s of open) await patchStint(s.id, { off_clock: clk })
    await writeSession(matchId, {
      status: 'finished',
      clock_base_seconds: clk,
      running_since: null
    })
  }

  // Nullstill kampen helt — slett session + alle stints (start på nytt).
  async function resetMatch(matchId) {
    if (!isSupabaseConfigured) {
      stints.value = stints.value.filter(s => s.match_id !== matchId)
      if (session.value?.match_id === matchId) session.value = null
      husk(matchId, null); huskOppstilt([[matchId, null]])
      return
    }
    // blindskriving: nullstiller en kamp. Er den aldri startet, finnes verken
    // perioder eller økt, og null rader er nøyaktig det svaret vi vil ha.
    // Men en FEIL er ikke null rader: kast den, så skjermen ikke melder
    // «Nullstilt» for en kamp som fortsatt står i basen.
    const stintsRes = await supabase.from('match_stints').delete().eq('match_id', matchId)
    if (stintsRes.error) throw stintsRes.error
    // blindskriving: se linjen over.
    const sesjonRes = await supabase.from('match_sessions').delete().eq('match_id', matchId)
    if (sesjonRes.error) throw sesjonRes.error
    stints.value = stints.value.filter(s => s.match_id !== matchId)
    if (session.value?.match_id === matchId) session.value = null
    // Sesjonen er borte: kampen er verken startet eller satt opp lenger.
    husk(matchId, null); huskOppstilt([[matchId, null]])
  }

  // ── Etterjustering ──────────────────────────────────────────────────────────
  // Bommer man på et bytte live, er kampen over før feilen oppdages. Da må tida
  // kunne flyttes i etterkant — men bare FLYTTES. Aldri «gi Julian fem
  // minutter»: noen må ha stått de fem minuttene, ellers var det seks mann på
  // banen. Regnestykket ligger i lib/timeTransfer.js; her skrives det bare ned.
  //
  // Returnerer handlingene som ble utført, slik at de kan angres nøyaktig —
  // ikke ved å flytte tilbake (som kunne landet i et annet vindu), men ved å
  // sette radene tilbake til det de var.
  async function adjustPlayingTime(matchId, fromId, toId, seconds) {
    const mine = stints.value.filter(s => s.match_id === matchId)
    const matchEnd = session.value?.clock_base_seconds || 0
    const plan = planTransfer({ stints: mine, fromId, toId, seconds, matchEnd })
    if (!plan.moved) return plan

    const done = []
    for (const op of plan.ops) {
      if (op.kind === 'update') {
        await patchStint(op.id, op.patch)
        done.push(op)
      } else if (op.kind === 'delete') {
        await deleteStint(op.id)
        done.push(op)
      } else {
        const [row] = await insertStints([op.row])
        done.push({ ...op, id: row?.id })
      }
    }
    return { ...plan, ops: done }
  }

  async function undoAdjustment(ops) {
    for (const op of [...ops].reverse()) {
      if (op.kind === 'update') await patchStint(op.id, op.before)
      else if (op.kind === 'insert') { if (op.id) await deleteStint(op.id) }
      else if (op.kind === 'delete') {
        const { id, ...row } = op.before
        await insertStints([row])
      }
    }
  }

  // Hvor mye som i det hele tatt lar seg flytte mellom to spillere — flata
  // bruker den til å gråe ut valg den ellers ville tilbudt og så feilet på.
  function movableSeconds(matchId, fromId, toId) {
    return transferableSeconds({
      stints: stints.value.filter(s => s.match_id === matchId),
      fromId, toId,
      matchEnd: session.value?.clock_base_seconds || 0
    })
  }

  // ── Avledet tilstand ─────────────────────────────────────────────────────────
  function matchStints(matchId) {
    return stints.value.filter(s => s.match_id === matchId)
  }

  function isOnField(playerId) {
    return !!openStintFor(session.value?.match_id, playerId)
  }

  function roleOf(playerId) {
    return openStintFor(session.value?.match_id, playerId)?.role || null
  }

  function positionOf(playerId) {
    return openStintFor(session.value?.match_id, playerId)?.position || null
  }

  // Spiller som står i en gitt formasjons-slot akkurat nå.
  function playerAtPosition(slotId) {
    const s = stints.value.find(
      x => x.match_id === session.value?.match_id && x.position === slotId && x.off_clock == null
    )
    return s?.player_id || null
  }

  // Spilletid for gjeldende kamp — åpne stints løper mot currentClock.
  const playingTimeByPlayer = computed(() => {
    const mid = session.value?.match_id
    const clk = currentClock.value
    const out = {}
    for (const s of stints.value) {
      if (mid && s.match_id !== mid) continue
      const end = s.off_clock != null ? s.off_clock : clk
      const dur = Math.max(0, end - s.on_clock)
      const e = out[s.player_id] || (out[s.player_id] = { fieldSec: 0, keeperSec: 0, totalSec: 0 })
      if (s.role === 'keeper') e.keeperSec += dur
      else e.fieldSec += dur
      e.totalSec += dur
    }
    return out
  })

  // Hele tilstanden i ett kall. Hopper over svaret hvis en handling ble sendt
  // mens hentingen var underveis: da er handlingens svar ferskere.
  // Venter noe i kampkøen, er det denne telefonen som vet best: da hoppes
  // runden over (`tross` brukes ved innlasting, der køen legges oppå).
  async function syncState(matchId, { tross = false } = {}) {
    if (!isSupabaseConfigured) return null
    if (!tross && (pending || venterFor(matchId))) return null
    const start = gen
    const { data, error } = await supabase.rpc('mm_tilstand', { p_match: matchId })
    if (error) throw error
    if (gen !== start || (!tross && (pending || venterFor(matchId)))) return null
    applyState(matchId, data)
    return data
  }

  // Resultatet som endring (+1/−1), ikke som tall: to trenere som trykker
  // samtidig skal gi to mål.
  // Gjennom køen, med en nøkkel: et nytt forsøk etter et svar som ble borte
  // gir ikke to mål.
  function changeScore(matchId, dHome, dAway) {
    const id = nyId()
    return legg('maal', matchId, { p_match: matchId, p_hjemme: dHome, p_borte: dAway, p_noekkel: id }, id)
  }

  return {
    sesjonKjent: matchId => sesjonHentetFor === matchId,
    oppstillingFor, huskOppstilt, huskSesjoner,
    remote, syncState, changeScore,
    session, stints, statusByMatch, currentClock, isRunning,
    now, serverOffset,
    startClockTick, stopClockTick,
    fetchSession, fetchSessionStatuses, fetchStints, fetchSeasonStints,
    saveSetup, startMatch, pauseClock, resumeClock, endHalfAt, startNextHalf, startedEarlier, substitute, undoSubstitute, swapKeeper, swapFieldPositions, finishMatch, resetMatch,
    matchStints, isOnField, roleOf, positionOf, playerAtPosition, playingTimeByPlayer,
    adjustPlayingTime, undoAdjustment, movableSeconds
  }
}
