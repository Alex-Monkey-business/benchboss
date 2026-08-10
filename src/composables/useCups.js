import { ref, computed } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { localISODate } from '../lib/dateLabels'

const cups = ref([])
const activeCup = ref(null)
const loaded = ref(false)

// Cupen er «i gang» så lenge den er aktiv og sluttdatoen ikke er passert.
// Datosjekken er sikkerhetsnettet for når ingen husket å sette completed.
// Alt som skal vike for cup (Hjem-kortet, foreldrenes cup-fane) leser denne.
const cupInProgress = computed(() => {
  const cup = activeCup.value
  if (!cup || cup.status !== 'active') return false
  return !cup.end_date || cup.end_date >= localISODate()
})

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

  return { cups, activeCup, cupInProgress, loaded, fetchCups }
}
