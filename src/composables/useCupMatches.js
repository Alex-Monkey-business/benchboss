import { ref } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'

const cupMatches = ref([])
const loading = ref(false)
const loadedCup = ref(null)

// Demo-kampprogram (uten Supabase). Erstattes av cup_matches i prod.
const DEMO_CUP_MATCHES = [
  // Halsen IF (Simon/Trond)
  { id: 'dcm-1',  cup_id: 'demo-cup-1', our_team: 'halsen',  opponent: 'Korsvoll Rovers',        match_date: '2026-08-08', match_time: '11:00', pitch: 'Virik 3', round: 'Kamp 436',  home_score: null, away_score: null },
  { id: 'dcm-2',  cup_id: 'demo-cup-1', our_team: 'halsen',  opponent: 'Svene IL',               match_date: '2026-08-08', match_time: '12:30', pitch: 'Virik 5', round: 'Kamp 627',  home_score: null, away_score: null },
  { id: 'dcm-3',  cup_id: 'demo-cup-1', our_team: 'halsen',  opponent: 'Ready Smestad',          match_date: '2026-08-08', match_time: '14:00', pitch: 'Virik 3', round: 'Kamp 841',  home_score: null, away_score: null },
  { id: 'dcm-4',  cup_id: 'demo-cup-1', our_team: 'halsen',  opponent: 'Fossum IF Skien',        match_date: '2026-08-09', match_time: '09:30', pitch: 'Virik 7', round: 'Kamp 1481', home_score: null, away_score: null },
  { id: 'dcm-5',  cup_id: 'demo-cup-1', our_team: 'halsen',  opponent: 'FK Eik Tønsberg Hvit',   match_date: '2026-08-09', match_time: '11:00', pitch: 'Virik 7', round: 'Kamp 1678', home_score: null, away_score: null },
  { id: 'dcm-6',  cup_id: 'demo-cup-1', our_team: 'halsen',  opponent: 'Ready Grønn',            match_date: '2026-08-09', match_time: '12:30', pitch: 'Virik 1', round: 'Kamp 1837', home_score: null, away_score: null },
  // Halsen IF 2 (Alex/Iver)
  { id: 'dcm-7',  cup_id: 'demo-cup-1', our_team: 'halsen2', opponent: 'Haugfoss IF',            match_date: '2026-08-08', match_time: '10:30', pitch: 'Virik 6', round: 'Kamp 379',  home_score: null, away_score: null },
  { id: 'dcm-8',  cup_id: 'demo-cup-1', our_team: 'halsen2', opponent: 'Korsvoll Thistle',       match_date: '2026-08-08', match_time: '12:00', pitch: 'Virik 5', round: 'Kamp 565',  home_score: null, away_score: null },
  { id: 'dcm-9',  cup_id: 'demo-cup-1', our_team: 'halsen2', opponent: 'Ready Blå',              match_date: '2026-08-08', match_time: '14:30', pitch: 'Virik 4', round: 'Kamp 966',  home_score: null, away_score: null },
  { id: 'dcm-10', cup_id: 'demo-cup-1', our_team: 'halsen2', opponent: 'Rolvsøy IF',             match_date: '2026-08-08', match_time: '17:00', pitch: 'Virik 8', round: 'Kamp 1204', home_score: null, away_score: null },
  { id: 'dcm-11', cup_id: 'demo-cup-1', our_team: 'halsen2', opponent: 'Korsvoll of Midlothian', match_date: '2026-08-09', match_time: '08:30', pitch: 'Virik 8', round: 'Kamp 1331', home_score: null, away_score: null },
  { id: 'dcm-12', cup_id: 'demo-cup-1', our_team: 'halsen2', opponent: 'Stridsklev IL',          match_date: '2026-08-09', match_time: '10:30', pitch: 'Virik 3', round: 'Kamp 1604', home_score: null, away_score: null }
]

export function useCupMatches() {
  async function fetchCupMatches(cupId) {
    loading.value = true

    if (!isSupabaseConfigured) {
      cupMatches.value = DEMO_CUP_MATCHES.filter(m => m.cup_id === cupId)
      loadedCup.value = cupId
      loading.value = false
      return cupMatches.value
    }

    const { data, error } = await supabase
      .from('cup_matches')
      .select('*')
      .eq('cup_id', cupId)
      .order('match_date')
      .order('match_time')

    if (!error && data) {
      cupMatches.value = data
      loadedCup.value = cupId
    }
    loading.value = false
    return cupMatches.value
  }

  function getCupMatch(id) {
    return cupMatches.value.find(m => m.id === id) || null
  }

  async function updateCupMatch(id, updates) {
    if (!isSupabaseConfigured) {
      const i = cupMatches.value.findIndex(m => m.id === id)
      if (i > -1) cupMatches.value[i] = { ...cupMatches.value[i], ...updates }
      return cupMatches.value[i]
    }
    const { data, error } = await supabase
      .from('cup_matches')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (!error && data) {
      const i = cupMatches.value.findIndex(m => m.id === id)
      if (i > -1) cupMatches.value[i] = data
    }
    return data
  }

  return { cupMatches, loading, fetchCupMatches, getCupMatch, updateCupMatch }
}
