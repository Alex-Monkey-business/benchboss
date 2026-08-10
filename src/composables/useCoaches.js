import { ref } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { useAuth } from '../stores/auth'
import { registerReset } from '../stores/dataReset'
import { fetchRows, STATUS } from '../lib/query'

const coaches = ref([])
const loaded = ref(false)
const status = ref(STATUS.IDLE)

registerReset(() => { coaches.value = []; loaded.value = false; status.value = STATUS.IDLE })

// Profile images by coach name. Transparent PNG cutouts so the per-coach
// background color shows through. Alex has no photo yet → initial fallback.
const COACH_IMAGES = {
  'Trond': '/coaches/trond.png',
  'Iver': '/coaches/iver.png',
  'Simon': '/coaches/simon.png',
  'Jacob': '/coaches/jacob.png'
}

// Demo coaches for development without Supabase
const DEMO_COACHES = [
  { id: 'demo-1', name: 'Alex', pin: '1234' },
  { id: 'demo-2', name: 'Iver', pin: '1234' },
  { id: 'demo-3', name: 'Trond', pin: '1234' },
  { id: 'demo-4', name: 'Simon', pin: '1234' },
  { id: 'demo-5', name: 'Jacob', pin: '1234' }
]

function enrichWithImages(coachList) {
  return coachList.map(c => ({ ...c, image: COACH_IMAGES[c.name] || null }))
}

export function useCoaches() {
  const { reconcileWithCoaches } = useAuth()

  async function fetchCoaches() {
    if (loaded.value) return coaches.value

    if (!isSupabaseConfigured) {
      coaches.value = enrichWithImages(DEMO_COACHES)
      loaded.value = true
      status.value = STATUS.OK
      reconcileWithCoaches(coaches.value)
      return coaches.value
    }

    status.value = STATUS.LOADING
    const { rows } = await fetchRows(
      supabase.from('coaches').select('*').order('name'),
      'coaches'
    )

    if (!rows) {
      status.value = STATUS.ERROR
      return coaches.value
    }

    coaches.value = enrichWithImages(rows)
    loaded.value = true
    status.value = STATUS.OK
    // Trenerlista er fasit for hvem man er — synk den lagrede brukeren.
    reconcileWithCoaches(coaches.value)
    return coaches.value
  }

  async function verifyPin(coachId, pin) {
    const coach = coaches.value.find(c => c.id === coachId)
    return coach && coach.pin === pin
  }

  return { coaches, status, fetchCoaches, verifyPin }
}
