import { ref } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'

// Slim roster: hvilke spillere er på Goat/Han i cupen. Ingen ansvar.
// Rader: { id, cup_id, player_id, cup_team }
const squad = ref([])

export function useCupSquad() {
  async function fetchCupSquad(cupId) {
    if (!isSupabaseConfigured) {
      return squad.value
    }
    const { data, error } = await supabase
      .from('cup_squad')
      .select('*')
      .eq('cup_id', cupId)
    if (!error && data) squad.value = data
    return squad.value
  }

  function teamForPlayer(playerId) {
    return squad.value.find(r => r.player_id === playerId)?.cup_team || null
  }

  function playerIdsForTeam(team) {
    return squad.value.filter(r => r.cup_team === team).map(r => r.player_id)
  }

  // Sett (eller bytt) lag for en spiller – upsert på (cup_id, player_id).
  async function setTeam(cupId, playerId, team) {
    if (!isSupabaseConfigured) {
      const i = squad.value.findIndex(r => r.player_id === playerId)
      if (i > -1) squad.value[i] = { ...squad.value[i], cup_team: team }
      else squad.value.push({ id: 'cs-' + Date.now(), cup_id: cupId, player_id: playerId, cup_team: team })
      return
    }
    const { data, error } = await supabase
      .from('cup_squad')
      .upsert({ cup_id: cupId, player_id: playerId, cup_team: team }, { onConflict: 'cup_id,player_id' })
      .select()
      .single()
    if (!error && data) {
      const i = squad.value.findIndex(r => r.player_id === playerId)
      if (i > -1) squad.value[i] = data
      else squad.value.push(data)
    }
  }

  // Fjern spiller fra troppen (sett til "ikke plassert").
  async function removeFromSquad(cupId, playerId) {
    if (!isSupabaseConfigured) {
      squad.value = squad.value.filter(r => r.player_id !== playerId)
      return
    }
    const { error } = await supabase
      .from('cup_squad')
      .delete()
      .eq('cup_id', cupId)
      .eq('player_id', playerId)
    if (!error) squad.value = squad.value.filter(r => r.player_id !== playerId)
  }

  return { squad, fetchCupSquad, teamForPlayer, playerIdsForTeam, setTeam, removeFromSquad }
}
