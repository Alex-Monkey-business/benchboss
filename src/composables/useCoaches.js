import { ref } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
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
  { id: 'demo-1', name: 'Alex' },
  { id: 'demo-2', name: 'Iver' },
  { id: 'demo-3', name: 'Trond' },
  { id: 'demo-4', name: 'Simon' },
  { id: 'demo-5', name: 'Jacob' }
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
      status.value = STATUS.OK
      return coaches.value
    }

    status.value = STATUS.LOADING
    // Eksplisitt kolonneliste, ikke select('*').
    //
    // Med '*' lastet hver eneste besøkende ned coaches.pin i klartekst for
    // alle fem trenerne — nøkkelen som gir tilgang til appen, servert til
    // hvem som helst som åpnet devtools. Kolonnen forsvinner helt i fase 6;
    // dette stopper lekkasjen nå, uten å vente på RLS.
    const { rows } = await fetchRows(
      supabase.from('coaches').select('id, name').order('name'),
      'coaches'
    )

    if (!rows) {
      status.value = STATUS.ERROR
      return coaches.value
    }

    coaches.value = enrichWithImages(rows)
    loaded.value = true
    status.value = STATUS.OK
    return coaches.value
  }

  return { coaches, status, fetchCoaches }
}
