import { ref } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'

const cups = ref([])
const activeCup = ref(null)
const loaded = ref(false)

const DEMO_CUPS = [
  { id: 'demo-cup-1', name: 'Sandarcupen', venue: 'Virik Idrettspark, Sandefjord', start_date: '2026-08-08', end_date: '2026-08-09', status: 'active', created_at: '2026-08-04' }
]

export function useCups() {
  async function fetchCups() {
    if (loaded.value) return cups.value

    if (!isSupabaseConfigured) {
      cups.value = DEMO_CUPS
      activeCup.value = DEMO_CUPS[0]
      loaded.value = true
      return cups.value
    }

    const { data, error } = await supabase
      .from('cups')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error && data) {
      cups.value = data
      activeCup.value = data.find(c => c.status === 'active') || data[0] || null
      loaded.value = true
    }
    return cups.value
  }

  return { cups, activeCup, loaded, fetchCups }
}
