import { ref, computed } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'

const matches = ref([])
const matchCoaches = ref([])
const matchPlayers = ref([])
const loading = ref(false)

const DEMO_MATCHES = [
  // Vinter 2026 – G11 Jotron Serie Avd 1 (kun hjemmekamper)
  { id: 'dm-1', season_id: 'demo-season-2', round: '2', match_date: '2026-02-28', match_day: 'lørdag', match_time: '12:00', home_team: 'Halsen Rød', away_team: 'Sem Gul', division: 'Avd 1', referee: '', fee_amount: 200, home_score: 3, away_score: 1 },
  { id: 'dm-2', season_id: 'demo-season-2', round: '2', match_date: '2026-02-28', match_day: 'lørdag', match_time: '12:00', home_team: 'Halsen Grønn', away_team: 'Borre sort', division: 'Avd 1', referee: '', fee_amount: 200, home_score: 2, away_score: 2 },
  { id: 'dm-3', season_id: 'demo-season-2', round: '4', match_date: '2026-03-11', match_day: 'onsdag', match_time: '18:00', home_team: 'Halsen Grønn', away_team: 'Tønsberg FK Blå', division: 'Avd 1', referee: '', fee_amount: 200, home_score: null, away_score: null },
  { id: 'dm-4', season_id: 'demo-season-2', round: '4', match_date: '2026-03-14', match_day: 'lørdag', match_time: '12:00', home_team: 'Halsen Rød', away_team: 'Store Bergan rød', division: 'Avd 1', referee: '', fee_amount: 200, home_score: null, away_score: null },
  { id: 'dm-5', season_id: 'demo-season-2', round: '4', match_date: '2026-03-18', match_day: 'onsdag', match_time: '18:00', home_team: 'Halsen Rød', away_team: 'Borre sort', division: 'Avd 1', referee: '', fee_amount: 200, home_score: null, away_score: null },
]

const DEMO_MATCH_COACHES = []
const DEMO_MATCH_PLAYERS = []

export function useMatches() {
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
      return
    }

    const { data, error } = await supabase
      .from('matches')
      .select('*')
      .eq('season_id', seasonId)
      .order('match_date')
      .order('match_time')

    if (!error && data) matches.value = data

    const matchIds = matches.value.map(m => m.id)

    const { data: mc } = await supabase
      .from('match_coaches')
      .select('*')
      .in('match_id', matchIds)

    if (mc) matchCoaches.value = mc

    const { data: mp } = await supabase
      .from('match_players')
      .select('*')
      .in('match_id', matchIds)

    if (mp) matchPlayers.value = mp

    loading.value = false
  }

  async function getMatch(matchId) {
    if (!isSupabaseConfigured) {
      return DEMO_MATCHES.find(m => m.id === matchId) || matches.value.find(m => m.id === matchId)
    }

    const { data } = await supabase
      .from('matches')
      .select('*')
      .eq('id', matchId)
      .single()

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
      return newMatch
    }

    const { data, error } = await supabase
      .from('matches')
      .insert(matchData)
      .select()
      .single()

    if (!error && data) matches.value.push(data)
    return data
  }

  async function bulkAddMatches(matchDataArray) {
    if (!isSupabaseConfigured) {
      const newMatches = matchDataArray.map((m, i) => ({ id: 'dm-bulk-' + Date.now() + '-' + i, ...m }))
      matches.value.push(...newMatches)
      return newMatches
    }

    const { data, error } = await supabase
      .from('matches')
      .insert(matchDataArray)
      .select()

    if (!error && data) matches.value.push(...data)
    return data
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
    matches, matchCoaches, matchPlayers, loading,
    fetchMatches, getMatch, updateMatch, addMatch, bulkAddMatches,
    setMatchCoaches, getCoachesForMatch, fetchMatchCoaches,
    setMatchPlayers, getPlayersForMatch, fetchMatchPlayers, fetchAllMatchPlayers,
    deleteMatch, deleteAllMatches
  }
}
