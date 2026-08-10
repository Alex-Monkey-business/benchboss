import { ref } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { registerReset } from '../stores/dataReset'
import { fetchRows, STATUS } from '../lib/query'

// Slim roster: hvilke spillere er på Goat/Han i cupen. Ingen ansvar.
// Rader: { id, cup_id, player_id, cup_team }
const squad = ref([])
const status = ref(STATUS.IDLE)

registerReset(() => { squad.value = []; status.value = STATUS.IDLE })

export function useCupSquad() {
  async function fetchCupSquad(cupId) {
    if (!isSupabaseConfigured) {
      status.value = STATUS.OK
      return squad.value
    }

    status.value = STATUS.LOADING
    const { rows } = await fetchRows(
      supabase.from('cup_squad').select('*').eq('cup_id', cupId),
      'cup_squad'
    )

    if (!rows) {
      status.value = STATUS.ERROR
      return squad.value
    }

    squad.value = rows
    status.value = STATUS.OK
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

  return { squad, status, fetchCupSquad, teamForPlayer, playerIdsForTeam, setTeam, removeFromSquad }
}
