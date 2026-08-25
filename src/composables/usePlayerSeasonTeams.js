import { ref, computed } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { scoped } from '../lib/scope'
import { registerReset } from '../stores/dataReset'
import { fetchRows, STATUS } from '../lib/query'

// Lagtilhørighet per sesong. Troppene rulleres, så players.primary_team
// forteller bare hvor en spiller står NÅ — denne tabellen husker hvor
// hen sto da kampene faktisk ble spilt.
const rows = ref([])
const loaded = ref(false)
const status = ref(STATUS.IDLE)

registerReset(() => { rows.value = []; loaded.value = false; status.value = STATUS.IDLE })

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
      status.value = STATUS.OK
      return rows.value
    }

    status.value = STATUS.LOADING
    const { rows: data } = await fetchRows(
      scoped(supabase.from('player_season_teams').select('*')),
      'player_season_teams'
    )

    // Under RLS blir denne tom for foreldre — det er meningen, og
    // isLoanEligible() svarer da false. Kun en ekte feil skal gi 'error'.
    if (!data) {
      status.value = STATUS.ERROR
      return rows.value
    }

    rows.value = data
    loaded.value = true
    status.value = STATUS.OK
    return rows.value
  }

  // Faller tilbake til dagens lag for sesonger uten registrert historikk —
  // da er svaret uansett det beste vi har.
  function teamForSeason(player, seasonId) {
    if (!player) return null
    if (!seasonId) return player.primary_team
    return index.value.get(`${player.id}|${seasonId}`)?.team ?? player.primary_team
  }

  // «Egnet som lånespiller» er en trenervurdering av et navngitt barn, og skal
  // ikke ligge på players — den tabellen leses av foreldre. Denne tabellen blir
  // eneste sannhet og låses til trenere når RLS kommer. Så lenge kolonnen på
  // players fortsatt finnes, faller vi tilbake til den for sesonger uten rad.
  function isLoanEligible(player, seasonId) {
    if (!player) return false
    const row = seasonId ? index.value.get(`${player.id}|${seasonId}`) : null
    return row ? !!row.loan_eligible : !!player.loan_eligible
  }

  function upsertLocal(row) {
    const i = rows.value.findIndex(
      r => r.player_id === row.player_id && r.season_id === row.season_id)
    if (i > -1) rows.value[i] = { ...rows.value[i], ...row }
    else rows.value.push(row)
  }

  // team kan være null: spillere som ikke er plassert på et lag skal også
  // kunne merkes. UNIQUE(player_id, season_id) gjør dette til en upsert.
  async function setLoanEligible(playerId, seasonId, value, team = null) {
    if (!playerId || !seasonId) return null
    const row = { player_id: playerId, season_id: seasonId, team: team || null, loan_eligible: !!value }

    if (!isSupabaseConfigured) {
      upsertLocal(row)
      return row
    }

    const { data, error } = await supabase
      .from('player_season_teams')
      .upsert(row, { onConflict: 'player_id,season_id' })
      .select()
      .single()

    if (!error && data) upsertLocal(data)
    return data
  }

  return {
    playerSeasonTeams: rows,
    status,
    fetchPlayerSeasonTeams,
    teamForSeason,
    isLoanEligible,
    setLoanEligible
  }
}
