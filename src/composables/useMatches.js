import { ref, computed } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { useCoaches } from './useCoaches'
import { defaultCoachIdsForMatch } from '../lib/coachTeams'
import { useSeasonTeams } from './useSeasonTeams'
import { useAuth } from '../stores/auth'
import { registerReset } from '../stores/dataReset'
import { fetchRows, STATUS, cached } from '../lib/query'
import { settUtlegg, flettUtlegg } from './useExpenses'
import { persistRef } from '../lib/persist'
import { sesongHenter, flett } from '../lib/sesongRader'

const matches = persistRef('matches', ref([]))
const matchCoaches = persistRef('matchCoaches', ref([]))
const matchPlayers = persistRef('matchPlayers', ref([]))
const matchAbsences = persistRef('matchAbsences', ref([]))
const loading = ref(false)
const status = ref(STATUS.IDLE)

registerReset(() => {
  matches.value = []
  matchCoaches.value = []
  matchPlayers.value = []
  matchAbsences.value = []
  loading.value = false
  status.value = STATUS.IDLE
})

const DEMO_MATCHES = [
  // Vinter 2026 – G11 Jotron Serie Avd 1 (kun hjemmekamper)
  { id: 'dm-1', season_id: 'demo-season-2', round: '2', match_date: '2026-02-28', match_day: 'lørdag', match_time: '12:00', home_team: 'Halsen Rød', away_team: 'Sem Gul', division: 'Avd 1', referee: '', fee_amount: 200, home_score: 3, away_score: 1 },
  { id: 'dm-2', season_id: 'demo-season-2', round: '2', match_date: '2026-02-28', match_day: 'lørdag', match_time: '12:00', home_team: 'Halsen Grønn', away_team: 'Borre sort', division: 'Avd 1', referee: '', fee_amount: 200, home_score: 2, away_score: 2 },
  { id: 'dm-3', season_id: 'demo-season-2', round: '4', match_date: '2026-03-11', match_day: 'onsdag', match_time: '18:00', home_team: 'Halsen Grønn', away_team: 'Tønsberg FK Blå', division: 'Avd 1', referee: '', fee_amount: 200, home_score: null, away_score: null },
  { id: 'dm-4', season_id: 'demo-season-2', round: '4', match_date: '2026-03-14', match_day: 'lørdag', match_time: '12:00', home_team: 'Halsen Rød', away_team: 'Store Bergan rød', division: 'Avd 1', referee: '', fee_amount: 200, home_score: null, away_score: null },
  { id: 'dm-5', season_id: 'demo-season-2', round: '4', match_date: '2026-03-18', match_day: 'onsdag', match_time: '18:00', home_team: 'Halsen Rød', away_team: 'Borre sort', division: 'Avd 1', referee: '', fee_amount: 200, home_score: null, away_score: null },
  // Avsluttet sesong (Vår 2025) — viser sesongbytte + låst kampdetalj i demo.
  { id: 'dm-6', season_id: 'demo-season-1', round: '3', match_date: '2025-05-10', match_day: 'lørdag', match_time: '11:00', home_team: 'Halsen Grønn', away_team: 'Flint Oransje', division: 'Avd 2', referee: 'Ola Dommer', fee_amount: 200, home_score: 4, away_score: 2, report: 'Sterk andreomgang — pressspillet satt.' },
  { id: 'dm-7', season_id: 'demo-season-1', round: '5', match_date: '2025-06-07', match_day: 'lørdag', match_time: '13:00', home_team: 'Runar Gul', away_team: 'Halsen Rød', division: 'Avd 2', referee: '', fee_amount: 200, home_score: 1, away_score: 1 },
]

const DEMO_MATCH_COACHES = [
  { match_id: 'dm-1', coach_id: 'demo-1' }, // Alex
  { match_id: 'dm-1', coach_id: 'demo-2' }, // Iver
  { match_id: 'dm-2', coach_id: 'demo-3' }, // Trond
  { match_id: 'dm-2', coach_id: 'demo-4' }, // Simon
  { match_id: 'dm-3', coach_id: 'demo-3' },
  { match_id: 'dm-3', coach_id: 'demo-4' },
  { match_id: 'dm-4', coach_id: 'demo-1' },
  { match_id: 'dm-4', coach_id: 'demo-2' },
  { match_id: 'dm-5', coach_id: 'demo-1' },
  { match_id: 'dm-5', coach_id: 'demo-5' }, // Jacob
]

// Hospitanter — spillere som har stilt opp for et annet lag enn sitt eget.
// Without these the lånespiller-leaderboard on Statistikk renders empty, which
// hides the one view that answers "who is it fair to ask next?".
//
// Only players flagged loan_eligible are used, and only onto teams they could
// actually be lent to (Erik is hvit, so he can cover both Rød and Grønn; the
// grønn players only appear in Rød's matches). Spread is deliberate so the
// board ranks meaningfully: Erik has carried the most and is booked again,
// Isak is already down for two, so the fair next ask is someone at 0/0.
const DEMO_MATCH_PLAYERS = [
  // Played (28 Feb) → counts toward "Ekstra"
  { match_id: 'dm-1', player_id: 'p-18' }, // Erik (hvit) → Rød
  { match_id: 'dm-1', player_id: 'p-10' }, // Mads (grønn) → Rød
  { match_id: 'dm-1', player_id: 'p-13' }, // Sander (grønn) → Rød
  { match_id: 'dm-2', player_id: 'p-18' }, // Erik again, now → Grønn
  // Not yet played → counts toward "Kommende", i.e. already booked
  { match_id: 'dm-3', player_id: 'p-18' }, // Erik → Grønn
  { match_id: 'dm-4', player_id: 'p-15' }, // Isak (grønn) → Rød
  { match_id: 'dm-4', player_id: 'p-11' }, // William (grønn) → Rød
  { match_id: 'dm-5', player_id: 'p-15' }, // Isak again
]

// Kamp med trenere, tropp og utlegg i én rundtur. Fremmednøkkelen må
// navngis: kullsperren la til en nummer to mellom de samme tabellene
// (match_id, cohort_id), og uten hint svarer PostgREST med PGRST201.
const KAMP_MED_TROPP = '*, match_coaches!match_coaches_match_id_fkey(*), match_players!match_players_match_id_fkey(*), expenses!expenses_match_id_fkey(*)'
// Utlegg er unikt per kamp, så PostgREST gir et objekt (eller null), ikke en
// liste. Alle tre leses som lister uansett.
const liste = x => (x == null ? [] : Array.isArray(x) ? x : [x])

async function hentKamper(seasonId) {
  loading.value = true

  if (!isSupabaseConfigured) {
    // Kamper lagt til i demo blir stående: en ny henting skal ikke ta dem bort.
    const egne = matches.value.filter(m => m.season_id === seasonId && !DEMO_MATCHES.some(d => d.id === m.id))
    matches.value = [...DEMO_MATCHES.filter(m => m.season_id === seasonId), ...egne]
    // Keep user changes in demo mode - only init if empty
    if (matchCoaches.value.length === 0 && DEMO_MATCH_COACHES.length > 0) {
      matchCoaches.value = [...DEMO_MATCH_COACHES]
    }
    if (matchPlayers.value.length === 0 && DEMO_MATCH_PLAYERS.length > 0) {
      matchPlayers.value = [...DEMO_MATCH_PLAYERS]
    }
    loading.value = false
    status.value = STATUS.OK
    return
  }

  status.value = STATUS.LOADING
  // Kampene, trenerne, hospitantene og utleggene i ÉN rundtur. Før var det
  // tre bølger etter hverandre (kamper → trenere/tropp → utlegg), ~450 ms
  // på mobilnett før Hjem og Kamper var ferdige.
  const { rows } = await fetchRows(
    supabase.from('matches')
      .select(KAMP_MED_TROPP)
      .eq('season_id', seasonId)
      .order('match_date').order('match_time'),
    'matches'
  )

  // Feiler kamphentingen, beholder vi det vi har (og ikke en blanding av
  // denne og forrige sesong).
  if (!rows) {
    loading.value = false
    status.value = STATUS.ERROR
    return
  }

  // Kamp-radene holdes flate, som før: de spres inn i oppdateringer andre
  // steder, og en innebygd liste der hadde blitt sendt tilbake til basen.
  const mc = [], mp = [], ex = []
  matches.value = rows.map(({ match_coaches: c, match_players: p, expenses: e, ...m }) => {
    mc.push(...liste(c))
    mp.push(...liste(p))
    ex.push(...liste(e))
    return m
  })
  matchCoaches.value = mc
  // Hospitantene for andre sesonger blir stående: kampsida henter hele
  // kullets tropp (konfliktsjekken), og den skal ikke viskes ut av at
  // Kamper henter én sesong.
  const iSesongen = new Set(matches.value.map(m => m.id))
  matchPlayers.value = [...matchPlayers.value.filter(r => !iSesongen.has(r.match_id)), ...mp]
  settUtlegg(ex, matches.value.map(m => m.id))

  loading.value = false
  status.value = STATUS.OK
}

// Alle som henter kampene, deler én forespørsel om gangen (dedupe), og et svar
// er ferskt i 30 s (cached). `fetchMatches` henter alltid — den brukes etter
// importer og synk. `ensureMatches` er for skjermer som bare vil ha dem
// ferske nok: Hjem, Kamper, kampsida og Statistikk.
const kamperFersk = cached(hentKamper, 'matches', { ok: () => status.value === STATUS.OK, enPlass: true })

// Sesongens frafall. Troppen (hospitantene) trenger ingen egen henting: den
// kommer med sesongens kamper i hentKamper. Før hentet kampsida og spillersida
// begge deler for hele kullet, alle sesonger.
const sesongFravaerFersk = sesongHenter('match_absences', 'match_id, player_id', 'matchAbsences', (rader, kampIder) => {
  matchAbsences.value = flett(matchAbsences.value, rader, kampIder)
})

export function useMatches() {
  const { coaches, fetchCoaches } = useCoaches()

  async function getMatch(matchId) {
    if (!isSupabaseConfigured) {
      return DEMO_MATCHES.find(m => m.id === matchId) || matches.value.find(m => m.id === matchId)
    }

    const { data } = await supabase
      .from('matches')
      .select('*')
      .eq('id', matchId)
      .maybeSingle()

    return data
  }

  // Én kamp med trenere, tropp og utlegg, for kampsida når kampen ikke ligger
  // i hurtiglageret (direkte lenke, en kamp fra en annen sesong). Sida tegnes
  // da etter én runde; sesongens kamper hentes etterpå. Før ventet skjelettet
  // på begge, to runder etter hverandre.
  async function hentEnKamp(matchId) {
    if (!isSupabaseConfigured) return getMatch(matchId)
    const { data, error } = await supabase
      .from('matches')
      .select(KAMP_MED_TROPP)
      .eq('id', matchId)
      .maybeSingle()
    if (error || !data) return null
    const { match_coaches: c, match_players: p, expenses: e, ...m } = data
    matchCoaches.value = [...matchCoaches.value.filter(r => r.match_id !== matchId), ...liste(c)]
    matchPlayers.value = [...matchPlayers.value.filter(r => r.match_id !== matchId), ...liste(p)]
    flettUtlegg(liste(e), matchId)
    return m
  }

  async function updateMatch(matchId, updates) {
    if (!isSupabaseConfigured) {
      const idx = matches.value.findIndex(m => m.id === matchId)
      if (idx > -1) Object.assign(matches.value[idx], updates)
      return matches.value[idx] || { id: matchId, ...updates }
    }

    const { data, error } = await supabase
      .from('matches')
      .update(updates)
      .eq('id', matchId)
      .select()
      .single()

    if (!error && data) {
      const idx = matches.value.findIndex(m => m.id === matchId)
      if (idx > -1) matches.value[idx] = data
    }
    return data
  }

  async function addMatch(matchData) {
    if (!isSupabaseConfigured) {
      // Flere kamper kan lages i samme millisekund (tre treningskamper på én gang).
      const newMatch = { id: 'dm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), ...matchData }
      matches.value.push(newMatch)
      await assignDefaultCoaches([newMatch])
      return newMatch
    }

    const { data, error } = await supabase
      .from('matches')
      .insert(matchData)
      .select()
      .single()

    if (!error && data) {
      matches.value.push(data)
      await assignDefaultCoaches([data])
    }
    return data
  }

  async function bulkAddMatches(matchDataArray) {
    if (!isSupabaseConfigured) {
      const newMatches = matchDataArray.map((m, i) => ({ id: 'dm-bulk-' + Date.now() + '-' + i, ...m }))
      matches.value.push(...newMatches)
      await assignDefaultCoaches(newMatches)
      return newMatches
    }

    const { data, error } = await supabase
      .from('matches')
      .insert(matchDataArray)
      .select()

    // Feilen ble tidligere svelget: importen rapporterte «22 kamper er inne»
    // mens basen sto tom. En bulk-insert som feiler er ikke en tom liste, det
    // er en feil, og den skal opp til den som kaller.
    if (error) throw error

    if (data) {
      matches.value.push(...data)
      await assignDefaultCoaches(data)
    }
    return data
  }

  // Sett standard-trenere på nye kamper ut fra lagfarge. Én samlet insert.
  // Antar at kampene er nyopprettede (ingen eksisterende trener-koblinger).
  async function assignDefaultCoaches(newMatches) {
    const { seasonTeams, fetchSeasonTeams } = useSeasonTeams()
    const { activeCohort } = useAuth()
    // Sesongen tas fra kampene som legges inn, ikke fra `activeSeason`. Legger
    // man kamper i en tidligere sesong, er det DEN sesongens trenere som
    // gjelder — ikke dagens.
    const seasonId = newMatches[0]?.season_id
    await Promise.all([
      fetchCoaches(),
      fetchSeasonTeams(activeCohort.value?.id, seasonId)
    ])
    const rows = []
    for (const m of newMatches) {
      for (const coach_id of defaultCoachIdsForMatch(m, coaches.value, seasonTeams.value)) {
        rows.push({ match_id: m.id, coach_id })
      }
    }
    if (!rows.length) return

    if (!isSupabaseConfigured) {
      matchCoaches.value.push(...rows)
      return
    }

    const { error } = await supabase.from('match_coaches').insert(rows)
    if (!error) matchCoaches.value.push(...rows)
  }

  // Engangs-backfill: sett standard-trenere på kamper i sesongen som mangler
  // trenere helt. Idempotent — rører ikke kamper som allerede har trenere satt.
  // Returnerer antall kamper som ble oppdatert.
  async function backfillDefaultCoaches(seasonId) {
    const { seasonTeams, fetchSeasonTeams } = useSeasonTeams()
    const { activeCohort } = useAuth()
    await Promise.all([
      kamperFersk.force(seasonId),
      fetchCoaches(),
      fetchSeasonTeams(activeCohort.value?.id, seasonId)
    ])
    const withCoaches = new Set(matchCoaches.value.map(mc => mc.match_id))
    const missing = matches.value.filter(m => !withCoaches.has(m.id))

    let updated = 0
    for (const m of missing) {
      const ids = defaultCoachIdsForMatch(m, coaches.value, seasonTeams.value)
      if (!ids.length) continue
      await setMatchCoaches(m.id, ids)
      updated++
    }
    return updated
  }

  // Trenerne på en kamp settes som en diff: de nye legges til, de som er tatt
  // av slettes — parallelt. Før var det «slett alle, sett inn alle» etter
  // hverandre: to rundturer per trykk, og et vindu der kampen sto uten trenere.
  // Returnerer false når noe ikke ble lagret, så kalleren kan rulle tilbake.
  async function setMatchCoaches(matchId, coachIds) {
    const fra = getCoachesForMatch(matchId)
    const settLokalt = ids => {
      matchCoaches.value = matchCoaches.value.filter(mc => mc.match_id !== matchId)
      ids.forEach(cid => matchCoaches.value.push({ match_id: matchId, coach_id: cid }))
    }
    if (!isSupabaseConfigured) { settLokalt(coachIds); return true }

    const ny = coachIds.filter(id => !fra.includes(id))
    const ut = fra.filter(id => !coachIds.includes(id))
    settLokalt(coachIds)
    const [a, b] = await Promise.all([
      ny.length
        ? supabase.from('match_coaches').insert(ny.map(coach_id => ({ match_id: matchId, coach_id }))).select('coach_id')
        : { error: null },
      ut.length
        ? supabase.from('match_coaches').delete().eq('match_id', matchId).in('coach_id', ut).select('coach_id')
        : { error: null }
    ])
    if (a.error || b.error) {
      console.warn('[match_coaches] lagring feilet', (a.error || b.error).message)
      // Hent sannheten: den ene halvdelen kan ha gått gjennom.
      await fetchMatchCoaches(matchId)
      return false
    }
    return true
  }

  function getCoachesForMatch(matchId) {
    return matchCoaches.value.filter(mc => mc.match_id === matchId).map(mc => mc.coach_id)
  }

  async function fetchMatchCoaches(matchId) {
    if (!isSupabaseConfigured) {
      return matchCoaches.value.filter(mc => mc.match_id === matchId).map(mc => mc.coach_id)
    }

    const { data } = await supabase
      .from('match_coaches')
      .select('coach_id')
      .eq('match_id', matchId)

    if (data) {
      matchCoaches.value = matchCoaches.value.filter(mc => mc.match_id !== matchId)
      data.forEach(mc => matchCoaches.value.push({ match_id: matchId, coach_id: mc.coach_id }))
    }

    return data ? data.map(mc => mc.coach_id) : []
  }

  // Samme diff som trenerne. Returnerer false når noe ikke ble lagret.
  async function setMatchPlayers(matchId, playerIds) {
    const fra = getPlayersForMatch(matchId)
    const settLokalt = ids => {
      matchPlayers.value = matchPlayers.value.filter(mp => mp.match_id !== matchId)
      ids.forEach(pid => matchPlayers.value.push({ match_id: matchId, player_id: pid }))
    }
    if (!isSupabaseConfigured) { settLokalt(playerIds); return true }

    const ny = playerIds.filter(id => !fra.includes(id))
    const ut = fra.filter(id => !playerIds.includes(id))
    settLokalt(playerIds)
    const [a, b] = await Promise.all([
      ny.length
        ? supabase.from('match_players').insert(ny.map(player_id => ({ match_id: matchId, player_id }))).select('player_id')
        : { error: null },
      ut.length
        ? supabase.from('match_players').delete().eq('match_id', matchId).in('player_id', ut).select('player_id')
        : { error: null }
    ])
    if (a.error || b.error) {
      console.warn('[match_players] lagring feilet', (a.error || b.error).message)
      await fetchMatchPlayers(matchId)
      return false
    }
    return true
  }

  function getPlayersForMatch(matchId) {
    return matchPlayers.value.filter(mp => mp.match_id === matchId).map(mp => mp.player_id)
  }

  async function fetchMatchPlayers(matchId) {
    if (!isSupabaseConfigured) {
      return matchPlayers.value.filter(mp => mp.match_id === matchId).map(mp => mp.player_id)
    }

    const { data } = await supabase
      .from('match_players')
      .select('player_id')
      .eq('match_id', matchId)

    if (data) {
      matchPlayers.value = matchPlayers.value.filter(mp => mp.match_id !== matchId)
      data.forEach(mp => matchPlayers.value.push({ match_id: matchId, player_id: mp.player_id }))
    }

    return data ? data.map(mp => mp.player_id) : []
  }

  // Fetch all match_players rows — needed for cross-match conflict detection.
  // ─── Frafall (match_absences) ───────────────────────────────────────────────
  // Spillere fra laget som er ute av en kamp. Speiler match_players-mønsteret.
  async function fetchSeasonAbsences(seasonId) {
    if (!isSupabaseConfigured) return matchAbsences.value
    await sesongFravaerFersk(seasonId)
    return matchAbsences.value
  }

  async function fetchMatchAbsences(matchId) {
    if (!isSupabaseConfigured) {
      return matchAbsences.value.filter(a => a.match_id === matchId).map(a => a.player_id)
    }
    const { data } = await supabase
      .from('match_absences')
      .select('player_id')
      .eq('match_id', matchId)
    if (data) {
      matchAbsences.value = matchAbsences.value.filter(a => a.match_id !== matchId)
      data.forEach(a => matchAbsences.value.push({ match_id: matchId, player_id: a.player_id }))
    }
    return data ? data.map(a => a.player_id) : []
  }

  function getAbsencesForMatch(matchId) {
    return matchAbsences.value.filter(a => a.match_id === matchId).map(a => a.player_id)
  }

  // Veksle frafall for én spiller på én kamp. Lista endres med en gang;
  // feiler lagringen, settes den tilbake. Returnerer { ute, ok }.
  async function toggleAbsence(matchId, playerId) {
    const isOut = matchAbsences.value.some(a => a.match_id === matchId && a.player_id === playerId)
    const uten = () => matchAbsences.value.filter(a => !(a.match_id === matchId && a.player_id === playerId))
    if (isOut) matchAbsences.value = uten()
    else matchAbsences.value = [...matchAbsences.value, { match_id: matchId, player_id: playerId }]

    if (!isSupabaseConfigured) return { ute: !isOut, ok: true }

    const { error } = isOut
      ? await supabase.from('match_absences').delete().eq('match_id', matchId).eq('player_id', playerId).select('player_id')
      : await supabase.from('match_absences').insert({ match_id: matchId, player_id: playerId }).select('player_id')
    if (error) {
      if (isOut) matchAbsences.value = [...matchAbsences.value, { match_id: matchId, player_id: playerId }]
      else matchAbsences.value = uten()
      return { ute: isOut, ok: false }
    }
    return { ute: !isOut, ok: true }
  }

  // Flere ute på én gang: en treningskamp som starter blank har ingen fra
  // laget med. De som alt står som ute, røres ikke.
  async function settFravaer(matchId, playerIds) {
    const har = new Set(matchAbsences.value.filter(x => x.match_id === matchId).map(x => x.player_id))
    const nye = [...new Set(playerIds)].filter(id => !har.has(id))
    if (!nye.length) return true
    const rader = nye.map(player_id => ({ match_id: matchId, player_id }))
    matchAbsences.value = [...matchAbsences.value, ...rader]
    if (!isSupabaseConfigured) return true
    const { error } = await supabase.from('match_absences').insert(rader).select('player_id')
    if (error) {
      matchAbsences.value = matchAbsences.value.filter(x => !(x.match_id === matchId && nye.includes(x.player_id)))
      return false
    }
    return true
  }

  async function deleteMatch(matchId) {
    if (!isSupabaseConfigured) {
      matches.value = matches.value.filter(m => m.id !== matchId)
      return
    }

    const { data } = await supabase
      .from('matches').delete().eq('id', matchId).select('id')
    if (data?.length) matches.value = matches.value.filter(m => m.id !== matchId)
  }

  async function deleteAllMatches(seasonId) {
    if (!isSupabaseConfigured) {
      matches.value = []
      matchCoaches.value = []
      return
    }

    // blindskriving: en sesong uten kamper gir null rader, og det er ikke en
    // feil — resultatet er det samme som om den hadde hatt dem.
    await supabase.from('matches').delete().eq('season_id', seasonId)
    matches.value = []
    matchCoaches.value = []
  }

  return {
    matches, matchCoaches, matchPlayers, matchAbsences, loading, status,
    fetchMatches: kamperFersk.force, ensureMatches: kamperFersk, getMatch, hentEnKamp, updateMatch, addMatch, bulkAddMatches,
    setMatchCoaches, getCoachesForMatch, fetchMatchCoaches, backfillDefaultCoaches,
    setMatchPlayers, getPlayersForMatch, fetchMatchPlayers,
    fetchSeasonAbsences, fetchMatchAbsences, getAbsencesForMatch, toggleAbsence, settFravaer,
    deleteMatch, deleteAllMatches
  }
}
