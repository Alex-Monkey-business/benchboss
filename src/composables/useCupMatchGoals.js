import { ref } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'

// Målscorere per cup-kamp. Speiler useMatchGoals, men scoped på cup_match_id.
const goals = ref([])

export function useCupMatchGoals() {
  async function fetchForMatch(cupMatchId) {
    if (!isSupabaseConfigured) {
      return goals.value.filter(g => g.cup_match_id === cupMatchId)
    }
    const { data, error } = await supabase
      .from('cup_match_goals')
      .select('*')
      .eq('cup_match_id', cupMatchId)
      .order('position')
      .order('created_at')
    if (!error && data) {
      goals.value = goals.value.filter(g => g.cup_match_id !== cupMatchId).concat(data)
    }
    return goals.value.filter(g => g.cup_match_id === cupMatchId)
  }

  async function addGoal(cupMatchId, playerId) {
    const existing = goals.value.filter(g => g.cup_match_id === cupMatchId)
    const position = existing.length ? Math.max(...existing.map(g => g.position)) + 1 : 0

    if (!isSupabaseConfigured) {
      const ng = { id: 'cg-' + Date.now(), cup_match_id: cupMatchId, player_id: playerId, position }
      goals.value.push(ng)
      return ng
    }
    const { data, error } = await supabase
      .from('cup_match_goals')
      .insert({ cup_match_id: cupMatchId, player_id: playerId, position })
      .select()
      .single()
    if (!error && data) goals.value.push(data)
    return data
  }

  async function removeGoal(goalId) {
    if (!isSupabaseConfigured) {
      goals.value = goals.value.filter(g => g.id !== goalId)
      return
    }
    const { error } = await supabase.from('cup_match_goals').delete().eq('id', goalId)
    if (!error) goals.value = goals.value.filter(g => g.id !== goalId)
  }

  function getGoalsForMatch(cupMatchId) {
    return goals.value.filter(g => g.cup_match_id === cupMatchId)
  }

  return { goals, fetchForMatch, addGoal, removeGoal, getGoalsForMatch }
}
