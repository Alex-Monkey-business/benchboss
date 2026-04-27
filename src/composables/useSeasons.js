import { ref } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'

const seasons = ref([])
const activeSeason = ref(null)
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
      loaded.value = true
    }
  }

  async function createSeason(name) {
    if (!isSupabaseConfigured) {
      const newSeason = { id: 'demo-' + Date.now(), name, status: 'active', settled_at: null, created_at: new Date().toISOString() }
      seasons.value.unshift(newSeason)
      activeSeason.value = newSeason
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
    }
    return data
  }

  async function setActiveSeason(seasonId) {
    activeSeason.value = seasons.value.find(s => s.id === seasonId) || null
  }

  return { seasons, activeSeason, loaded, fetchSeasons, createSeason, settleSeason, setActiveSeason }
}
