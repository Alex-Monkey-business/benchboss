import { ref, computed } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { registerReset } from '../stores/dataReset'
import { fetchRows, STATUS, dedupe } from '../lib/query'
import { scoped, withCohort } from '../lib/scope'
import { persistRef } from '../lib/persist'

const seasons = persistRef('seasons', ref([]))
const activeSeason = persistRef('activeSeason', ref(null))
// Sesongen brukeren ser på (browsing) — kan avvike fra activeSeason der nye kamper lander.
// Kun in-memory: nullstilles ved cold start så man alltid åpner appen i inneværende sesong.
const viewingSeason = ref(null)
const loaded = ref(false)
const status = ref(STATUS.IDLE)

// Sesongen ligger i cachen fra sist; da skal Kamper-sida vise den med en gang,
// ikke vente på at fetchSeasons setter den.
if (!viewingSeason.value && activeSeason.value) viewingSeason.value = activeSeason.value

registerReset(() => {
  seasons.value = []
  activeSeason.value = null
  viewingSeason.value = null
  loaded.value = false
  status.value = STATUS.IDLE
})

const DEMO_SEASONS = [
  { id: 'demo-season-2', name: 'Vinter 2026', status: 'active', settled_at: null, created_at: '2026-01-15' },
  { id: 'demo-season-1', name: 'Vår 2025', status: 'settled', settled_at: '2025-09-30T12:00:00Z', created_at: '2025-01-01' }
]

export function useSeasons() {
  async function fetchSeasons() {
    if (!isSupabaseConfigured) {
      seasons.value = DEMO_SEASONS
      activeSeason.value = DEMO_SEASONS[0]
      if (!viewingSeason.value) viewingSeason.value = activeSeason.value
      loaded.value = true
      status.value = STATUS.OK
      return
    }

    status.value = STATUS.LOADING
    const { rows } = await fetchRows(
      scoped(supabase.from('seasons').select('*')).order('created_at', { ascending: false }),
      'seasons'
    )

    // Feiler denne, henter SerieKamperView aldri kamper (den venter på
    // viewingSeason) og siden blir helt blank — uten skjelett og uten feil.
    // `loaded` skal derfor aldri låses til true på en feilet spørring.
    if (!rows) {
      status.value = STATUS.ERROR
      return
    }

    seasons.value = rows
    activeSeason.value = rows.find(s => s.status === 'active') || rows[0] || null
    if (!viewingSeason.value) viewingSeason.value = activeSeason.value
    loaded.value = true
    status.value = STATUS.OK
  }

  async function createSeason(name) {
    if (!isSupabaseConfigured) {
      const newSeason = { id: 'demo-' + Date.now(), name, status: 'active', settled_at: null, created_at: new Date().toISOString() }
      seasons.value.unshift(newSeason)
      activeSeason.value = newSeason
      viewingSeason.value = newSeason
      return newSeason
    }

    const { data, error } = await supabase
      .from('seasons')
      .insert(withCohort({ name }))
      .select()
      .single()

    if (!error && data) {
      seasons.value.unshift(data)
      activeSeason.value = data
      viewingSeason.value = data
    }
    return data
  }

  async function settleSeason(seasonId) {
    if (!isSupabaseConfigured) {
      const s = seasons.value.find(s => s.id === seasonId)
      if (s) {
        s.status = 'settled'
        s.settled_at = new Date().toISOString()
      }
      return s
    }

    const { data, error } = await supabase
      .from('seasons')
      .update({ status: 'settled', settled_at: new Date().toISOString() })
      .eq('id', seasonId)
      .select()
      .single()

    if (!error && data) {
      const idx = seasons.value.findIndex(s => s.id === seasonId)
      if (idx > -1) seasons.value[idx] = data
      if (activeSeason.value?.id === seasonId) {
        activeSeason.value = data
      }
      if (viewingSeason.value?.id === seasonId) {
        viewingSeason.value = data
      }
    }
    return data
  }

  function setViewingSeason(seasonId) {
    viewingSeason.value = seasons.value.find(s => s.id === seasonId) || null
  }

  const isViewingPast = computed(() =>
    !!viewingSeason.value && !!activeSeason.value && viewingSeason.value.id !== activeSeason.value.id
  )

  return { seasons, activeSeason, viewingSeason, isViewingPast, loaded, status, fetchSeasons: dedupe(fetchSeasons, 'fetchSeasons'), createSeason, settleSeason, setViewingSeason }
}
