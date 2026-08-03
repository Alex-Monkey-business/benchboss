import { ref, computed } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'

const seasons = ref([])
const activeSeason = ref(null)
// Sesongen brukeren ser på (browsing) — kan avvike fra activeSeason der nye kamper lander.
// Kun in-memory: nullstilles ved cold start så man alltid åpner appen i inneværende sesong.
const viewingSeason = ref(null)
const loaded = ref(false)

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
      return
    }

    const { data, error } = await supabase
      .from('seasons')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error && data) {
      seasons.value = data
      activeSeason.value = data.find(s => s.status === 'active') || data[0]
      if (!viewingSeason.value) viewingSeason.value = activeSeason.value
      loaded.value = true
    }
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
      .insert({ name })
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

  return { seasons, activeSeason, viewingSeason, isViewingPast, loaded, fetchSeasons, createSeason, settleSeason, setViewingSeason }
}
