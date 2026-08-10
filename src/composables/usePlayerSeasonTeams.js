import { ref, computed } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'

// Lagtilhørighet per sesong. Troppene rulleres, så players.primary_team
// forteller bare hvor en spiller står NÅ — denne tabellen husker hvor
// hen sto da kampene faktisk ble spilt.
const rows = ref([])
const loaded = ref(false)

export function usePlayerSeasonTeams() {
  const index = computed(() => {
    const map = new Map()
    for (const r of rows.value) map.set(`${r.player_id}|${r.season_id}`, r)
    return map
  })

  async function fetchPlayerSeasonTeams() {
    if (loaded.value) return rows.value
    if (!isSupabaseConfigured) {
      loaded.value = true
      return rows.value
    }
    const { data, error } = await supabase.from('player_season_teams').select('*')
    if (!error && data) {
      rows.value = data
      loaded.value = true
    }
    return rows.value
  }

  // Faller tilbake til dagens lag for sesonger uten registrert historikk —
  // da er svaret uansett det beste vi har.
  function teamForSeason(player, seasonId) {
    if (!player) return null
    if (!seasonId) return player.primary_team
    return index.value.get(`${player.id}|${seasonId}`)?.team ?? player.primary_team
  }

  return { playerSeasonTeams: rows, fetchPlayerSeasonTeams, teamForSeason }
}
