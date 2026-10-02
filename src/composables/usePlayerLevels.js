import { ref } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { registerReset } from '../stores/dataReset'
import { fetchRows, STATUS, dedupe } from '../lib/query'
import { scoped } from '../lib/scope'
import { persistRef } from '../lib/persist'

// Nivå A/B/C per spiller — for å fordele grupper på differensierte øvelser.
//
// Trener-only i basen (player_levels, coach_read). Foreldre får en tom liste,
// og ingen flate de kan åpne spør etter den. Ingen rad = ikke satt.

export const LEVELS = ['A', 'B', 'C']

const rows = persistRef('playerLevels', ref([]))
const loaded = ref(false)
const status = ref(STATUS.IDLE)

registerReset(() => { rows.value = []; loaded.value = false; status.value = STATUS.IDLE })

const DEMO_LEVELS = [
  ['p-1', 'B'], ['p-2', 'A'], ['p-3', 'A'], ['p-4', 'B'], ['p-5', 'A'], ['p-6', 'C'],
  ['p-8', 'B'], ['p-10', 'A'], ['p-11', 'B'], ['p-12', 'C'], ['p-13', 'B'], ['p-14', 'C'],
  ['p-15', 'A'], ['p-16', 'B'], ['p-18', 'A']
].map(([player_id, level]) => ({ player_id, level, updated_at: '2026-09-01T18:00:00Z' }))

function putLocal(row) {
  const i = rows.value.findIndex(r => r.player_id === row.player_id)
  if (i > -1) rows.value[i] = row
  else rows.value.push(row)
}

function dropLocal(playerId) {
  rows.value = rows.value.filter(r => r.player_id !== playerId)
}

export function usePlayerLevels() {
  async function fetchPlayerLevels() {
    if (loaded.value) return rows.value

    if (!isSupabaseConfigured) {
      rows.value = [...DEMO_LEVELS]
      loaded.value = true
      status.value = STATUS.OK
      return rows.value
    }

    status.value = STATUS.LOADING
    const { rows: data } = await fetchRows(
      scoped(supabase.from('player_levels').select('player_id, level, updated_at')),
      'player_levels'
    )
    if (!data) {
      status.value = STATUS.ERROR
      return rows.value
    }
    rows.value = data
    loaded.value = true
    status.value = STATUS.OK
    return rows.value
  }

  function levelFor(playerId) {
    return rows.value.find(r => r.player_id === playerId)?.level || null
  }

  // Optimistisk: på oversikten tapper treneren seg gjennom tjue spillere, og
  // hver rad skal flytte seg med en gang. Feiler skrivingen, legges forrige
  // verdi tilbake og kalleren får false.
  async function setLevel(playerId, level) {
    const before = rows.value.find(r => r.player_id === playerId) || null
    const next = level && LEVELS.includes(level) ? level : null
    if ((before?.level || null) === next) return true

    if (next) putLocal({ player_id: playerId, level: next, updated_at: new Date().toISOString() })
    else dropLocal(playerId)

    if (!isSupabaseConfigured) return true

    const restore = () => (before ? putLocal(before) : dropLocal(playerId))

    if (next) {
      const { data, error } = await supabase
        .from('player_levels')
        .upsert({ player_id: playerId, level: next }, { onConflict: 'player_id' })
        .select('player_id, level, updated_at')
        .single()
      if (error || !data) { restore(); return false }
      putLocal(data)
      return true
    }

    const { data, error } = await supabase
      .from('player_levels').delete().eq('player_id', playerId).select('player_id')
    if (error || !data?.length) { restore(); return false }
    return true
  }

  return {
    playerLevels: rows,
    status,
    fetchPlayerLevels: dedupe(fetchPlayerLevels, 'fetchPlayerLevels'),
    levelFor,
    setLevel
  }
}
