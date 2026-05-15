import { ref } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'

const coaches = ref([])
const loaded = ref(false)

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
  async function fetchCoaches() {
    if (loaded.value) return coaches.value

    if (!isSupabaseConfigured) {
      coaches.value = enrichWithImages(DEMO_COACHES)
      loaded.value = true
      return coaches.value
    }

    const { data, error } = await supabase
      .from('coaches')
      .select('*')
      .order('name')

    if (!error && data) {
      coaches.value = enrichWithImages(data)
      loaded.value = true
    }
    return coaches.value
  }

  async function verifyPin(coachId, pin) {
    const coach = coaches.value.find(c => c.id === coachId)
    return coach && coach.pin === pin
  }

  return { coaches, fetchCoaches, verifyPin }
}
