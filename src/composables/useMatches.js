import { ref, computed } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { useCoaches } from './useCoaches'
import { defaultCoachIdsForMatch } from '../lib/coachTeams'
import { registerReset } from '../stores/dataReset'
import { fetchRows, STATUS } from '../lib/query'

const matches = ref([])
const matchCoaches = ref([])
const matchPlayers = ref([])
const matchAbsences = ref([])
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

export function useMatches() {
  const { coaches, fetchCoaches } = useCoaches()

  async function fetchMatches(seasonId) {
    loading.value = true

    if (!isSupabaseConfigured) {
      matches.value = DEMO_MATCHES.filter(m => m.season_id === seasonId)
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
    const { rows } = await fetchRows(
      supabase.from('matches').select('*').eq('season_id', seasonId)
        .order('match_date').order('match_time'),
      'matches'
    )

    // Feiler kamphentingen, ville de to neste spørringene kjørt mot ID-ene fra
    // forrige sesong og gitt et sammenblandet resultat. Stopp her i stedet.
    if (!rows) {
      loading.value = false
      status.value = STATUS.ERROR
      return
    }
    matches.value = rows

    const matchIds = matches.value.map(m => m.id)

    const [{ rows: mc }, { rows: mp }] = await Promise.all([
      fetchRows(supabase.from('match_coaches').select('*').in('match_id', matchIds), 'match_coaches'),
      fetchRows(supabase.from('match_players').select('*').in('match_id', matchIds), 'match_players')
    ])

    if (mc) matchCoaches.value = mc
    if (mp) matchPlayers.value = mp

    loading.value = false
    status.value = STATUS.OK
  }

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

  async function updateMatch(matchId, updates) {
    if (!isSupabaseConfigured) {
      const idx = matches.value.findIndex(m => m.id === matchId)
      if (idx > -1) Object.assign(matches.value[idx], updates)
      return matches.value[idx]
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
      const newMatch = { id: 'dm-' + Date.now(), ...matchData }
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

    if (!error && data) {
      matches.value.push(...data)
      await assignDefaultCoaches(data)
    }
    return data
  }

  // Sett standard-trenere på nye kamper ut fra lagfarge. Én samlet insert.
  // Antar at kampene er nyopprettede (ingen eksisterende trener-koblinger).
  async function assignDefaultCoaches(newMatches) {
    await fetchCoaches()
    const rows = []
    for (const m of newMatches) {
      for (const coach_id of defaultCoachIdsForMatch(m, coaches.value)) {
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
    await Promise.all([fetchMatches(seasonId), fetchCoaches()])
    const withCoaches = new Set(matchCoaches.value.map(mc => mc.match_id))
    const missing = matches.value.filter(m => !withCoaches.has(m.id))

    let updated = 0
    for (const m of missing) {
      const ids = defaultCoachIdsForMatch(m, coaches.value)
      if (!ids.length) continue
      await setMatchCoaches(m.id, ids)
      updated++
    }
    return updated
  }

  async function setMatchCoaches(matchId, coachIds) {
    if (!isSupabaseConfigured) {
      matchCoaches.value = matchCoaches.value.filter(mc => mc.match_id !== matchId)
      coachIds.forEach(cid => matchCoaches.value.push({ match_id: matchId, coach_id: cid }))
      return
    }

    await supabase.from('match_coaches').delete().eq('match_id', matchId)

    if (coachIds.length > 0) {
      await supabase
        .from('match_coaches')
        .insert(coachIds.map(coach_id => ({ match_id: matchId, coach_id })))
    }

    matchCoaches.value = matchCoaches.value.filter(mc => mc.match_id !== matchId)
    coachIds.forEach(cid => matchCoaches.value.push({ match_id: matchId, coach_id: cid }))
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

  async function setMatchPlayers(matchId, playerIds) {
    if (!isSupabaseConfigured) {
      matchPlayers.value = matchPlayers.value.filter(mp => mp.match_id !== matchId)
      playerIds.forEach(pid => matchPlayers.value.push({ match_id: matchId, player_id: pid }))
      return
    }

    await supabase.from('match_players').delete().eq('match_id', matchId)

    if (playerIds.length > 0) {
      await supabase
        .from('match_players')
        .insert(playerIds.map(player_id => ({ match_id: matchId, player_id })))
    }

    matchPlayers.value = matchPlayers.value.filter(mp => mp.match_id !== matchId)
    playerIds.forEach(pid => matchPlayers.value.push({ match_id: matchId, player_id: pid }))
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
  async function fetchAllMatchPlayers() {
    if (!isSupabaseConfigured) return matchPlayers.value
    const { data } = await supabase.from('match_players').select('match_id, player_id')
    if (data) matchPlayers.value = data
    return matchPlayers.value
  }

  // ─── Frafall (match_absences) ───────────────────────────────────────────────
  // Spillere fra laget som er ute av en kamp. Speiler match_players-mønsteret.
  async function fetchAllMatchAbsences() {
    if (!isSupabaseConfigured) return matchAbsences.value
    const { data } = await supabase.from('match_absences').select('match_id, player_id')
    if (data) matchAbsences.value = data
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

  // Veksle frafall for én spiller på én kamp.
  async function toggleAbsence(matchId, playerId) {
    const isOut = matchAbsences.value.some(a => a.match_id === matchId && a.player_id === playerId)

    if (!isSupabaseConfigured) {
      if (isOut) {
        matchAbsences.value = matchAbsences.value.filter(a => !(a.match_id === matchId && a.player_id === playerId))
      } else {
        matchAbsences.value.push({ match_id: matchId, player_id: playerId })
      }
      return !isOut
    }

    if (isOut) {
      const { error } = await supabase.from('match_absences').delete().eq('match_id', matchId).eq('player_id', playerId)
      if (!error) matchAbsences.value = matchAbsences.value.filter(a => !(a.match_id === matchId && a.player_id === playerId))
    } else {
      const { error } = await supabase.from('match_absences').insert({ match_id: matchId, player_id: playerId })
      if (!error) matchAbsences.value.push({ match_id: matchId, player_id: playerId })
    }
    return !isOut
  }

  async function deleteMatch(matchId) {
    if (!isSupabaseConfigured) {
      matches.value = matches.value.filter(m => m.id !== matchId)
      return
    }

    await supabase.from('matches').delete().eq('id', matchId)
    matches.value = matches.value.filter(m => m.id !== matchId)
  }

  async function deleteAllMatches(seasonId) {
    if (!isSupabaseConfigured) {
      matches.value = []
      matchCoaches.value = []
      return
    }

    await supabase.from('matches').delete().eq('season_id', seasonId)
    matches.value = []
    matchCoaches.value = []
  }

  return {
    matches, matchCoaches, matchPlayers, matchAbsences, loading, status,
    fetchMatches, getMatch, updateMatch, addMatch, bulkAddMatches,
    setMatchCoaches, getCoachesForMatch, fetchMatchCoaches, backfillDefaultCoaches,
    setMatchPlayers, getPlayersForMatch, fetchMatchPlayers, fetchAllMatchPlayers,
    fetchAllMatchAbsences, fetchMatchAbsences, getAbsencesForMatch, toggleAbsence,
    deleteMatch, deleteAllMatches
  }
}
