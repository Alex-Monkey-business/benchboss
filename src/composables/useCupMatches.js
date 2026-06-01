import { ref } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'

const cupMatches = ref([])
const loading = ref(false)
const loadedCup = ref(null)

// Demo-kampprogram (uten Supabase). Erstattes av cup_matches i prod.
const DEMO_CUP_MATCHES = [
  // Halsen IF Han
  { id: 'dcm-1', cup_id: 'demo-cup-1', our_team: 'han',  opponent: 'Ski IL Fotball Juniors', match_date: '2026-06-06', match_time: '10:40', pitch: 'T7 3 Telemarkshallen', round: 'Kamp 68',  home_score: null, away_score: null },
  { id: 'dcm-2', cup_id: 'demo-cup-1', our_team: 'han',  opponent: 'Birkenes IL',            match_date: '2026-06-06', match_time: '12:40', pitch: 'T7 2 Telemarkshallen', round: 'Kamp 109', home_score: null, away_score: null },
  { id: 'dcm-3', cup_id: 'demo-cup-1', our_team: 'han',  opponent: 'Siljan IL',              match_date: '2026-06-07', match_time: '12:40', pitch: 'T7 2 Telemarkshallen', round: 'Kamp 329', home_score: null, away_score: null },
  // Halsen IF Goat
  { id: 'dcm-4', cup_id: 'demo-cup-1', our_team: 'goat', opponent: 'Sørfjell IL',            match_date: '2026-06-06', match_time: '14:40', pitch: 'T7 1 Telemarkshallen', round: 'Kamp 148', home_score: null, away_score: null },
  { id: 'dcm-5', cup_id: 'demo-cup-1', our_team: 'goat', opponent: 'Siggerud IL',            match_date: '2026-06-06', match_time: '16:00', pitch: 'T7 2 Telemarkshallen', round: 'Kamp 177', home_score: null, away_score: null },
  { id: 'dcm-6', cup_id: 'demo-cup-1', our_team: 'goat', opponent: 'Skrim Silver',           match_date: '2026-06-07', match_time: '13:20', pitch: 'S7 1 Sandvoll',       round: 'Kamp 333', home_score: null, away_score: null }
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
