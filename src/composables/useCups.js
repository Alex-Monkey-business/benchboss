import { ref, computed } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { localISODate } from '../lib/dateLabels'
import { registerReset } from '../stores/dataReset'
import { fetchRows, STATUS } from '../lib/query'

const cups = ref([])
const activeCup = ref(null)
const loaded = ref(false)
const status = ref(STATUS.IDLE)

registerReset(() => {
  cups.value = []
  activeCup.value = null
  loaded.value = false
  status.value = STATUS.IDLE
})

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
      status.value = STATUS.OK
      return cups.value
    }

    status.value = STATUS.LOADING
    const { rows } = await fetchRows(
      supabase.from('cups').select('*').order('created_at', { ascending: false }),
      'cups'
    )

    if (!rows) {
      status.value = STATUS.ERROR
      return cups.value
    }

    cups.value = rows
    activeCup.value = rows.find(c => c.status === 'active') || rows[0] || null
    loaded.value = true
    status.value = STATUS.OK
    return cups.value
  }

  return { cups, activeCup, cupInProgress, loaded, status, fetchCups }
}
