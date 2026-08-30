import { ref, computed } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { registerReset } from '../stores/dataReset'

const goals = ref([])
const loadedAll = ref(false)
const loadedMatches = ref(new Set())

registerReset(() => { goals.value = []; loadedAll.value = false; loadedMatches.value = new Set() })

// Scorers for the two played demo matches. The totals match the results on
// DEMO_MATCHES — dm-1 was 3–1 and dm-2 was 2–2 — so the 5 goals here add up to
// the "Mål: 5 – 3" the Statistikk header already claimed. Without them the
// toppscorer list sat in an empty state next to a scoreline that said 5 goals.
const DEMO_GOALS = [
  // dm-1 · Halsen Rød 3–1 Sem Gul
  { id: 'dg-1', match_id: 'dm-1', player_id: 'p-1',  position: 0, clock_seconds: 8 * 60 },      // Lukas
  { id: 'dg-2', match_id: 'dm-1', player_id: 'p-18', position: 1, clock_seconds: 24 * 60 },     // Erik, inn som lånespiller
  { id: 'dg-3', match_id: 'dm-1', player_id: 'p-1',  position: 2, clock_seconds: 41 * 60 },     // Lukas igjen
  // dm-2 · Halsen Grønn 2–2 Borre sort
  { id: 'dg-4', match_id: 'dm-2', player_id: 'p-17', position: 0, clock_seconds: 12 * 60 },     // Kasper
  { id: 'dg-5', match_id: 'dm-2', player_id: 'p-12', position: 1, clock_seconds: 37 * 60 },     // Liam
]

export function useMatchGoals() {
  async function fetchMatchGoals(matchId) {
    if (!isSupabaseConfigured) {
      return goals.value.filter(g => g.match_id === matchId)
    }

    const { data, error } = await supabase
      .from('match_goals')
      .select('*')
      .eq('match_id', matchId)
      .order('position')
      .order('created_at')

    if (!error && data) {
      goals.value = goals.value.filter(g => g.match_id !== matchId).concat(data)
      loadedMatches.value.add(matchId)
    }
    return goals.value.filter(g => g.match_id === matchId)
  }

  async function fetchAllGoals() {
    if (loadedAll.value) return goals.value

    if (!isSupabaseConfigured) {
      goals.value = [...DEMO_GOALS]
      loadedAll.value = true
      return goals.value
    }

    const { data, error } = await supabase
      .from('match_goals')
      .select('*')
      .order('position')

    if (!error && data) {
      goals.value = data
      loadedAll.value = true
    }
    return goals.value
  }

  function getGoalsForMatch(matchId) {
    return goals.value
      .filter(g => g.match_id === matchId)
      .sort((a, b) => a.position - b.position)
  }

  async function addGoal(matchId, { player_id, clock_seconds = null }) {
    const existing = goals.value.filter(g => g.match_id === matchId)
    const nextPosition = existing.length === 0
      ? 0
      : Math.max(...existing.map(g => g.position)) + 1

    if (!isSupabaseConfigured) {
      const newGoal = {
        id: 'mg-' + Date.now(),
        match_id: matchId,
        player_id,
        position: nextPosition,
        clock_seconds
      }
      goals.value.push(newGoal)
      return newGoal
    }

    const { data, error } = await supabase
      .from('match_goals')
      .insert({ match_id: matchId, player_id, position: nextPosition, clock_seconds })
      .select()
      .single()

    if (!error && data) goals.value.push(data)
    return data
  }

  async function updateGoal(goalId, updates) {
    if (!isSupabaseConfigured) {
      const idx = goals.value.findIndex(g => g.id === goalId)
      if (idx > -1) Object.assign(goals.value[idx], updates)
      return goals.value[idx]
    }

    const { data, error } = await supabase
      .from('match_goals')
      .update(updates)
      .eq('id', goalId)
      .select()
      .single()

    if (!error && data) {
      const idx = goals.value.findIndex(g => g.id === goalId)
      if (idx > -1) goals.value[idx] = data
    }
    return data
  }

  async function removeGoal(goalId) {
    if (!isSupabaseConfigured) {
      goals.value = goals.value.filter(g => g.id !== goalId)
      return
    }

    const { data } = await supabase
      .from('match_goals').delete().eq('id', goalId).select('id')
    if (data?.length) goals.value = goals.value.filter(g => g.id !== goalId)
  }

  const goalsByPlayer = computed(() => {
    const counts = new Map()
    goals.value.forEach(g => {
      counts.set(g.player_id, (counts.get(g.player_id) || 0) + 1)
    })
    return counts
  })

  return {
    goals,
    fetchMatchGoals,
    fetchAllGoals,
    getGoalsForMatch,
    addGoal,
    updateGoal,
    removeGoal,
    goalsByPlayer
  }
}
