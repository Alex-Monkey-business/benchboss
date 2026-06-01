import { ref } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'

const cups = ref([])
const activeCup = ref(null)
const loaded = ref(false)

const DEMO_CUPS = [
  { id: 'demo-cup-1', name: 'Bø Sommerland Cup', venue: 'Bø i Telemark', start_date: null, end_date: null, status: 'active', created_at: '2026-05-01' }
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
