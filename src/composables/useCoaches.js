import { ref } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { registerReset } from '../stores/dataReset'
import { fetchRows, STATUS, dedupe } from '../lib/query'
import { scoped } from '../lib/scope'
import { persistRef } from '../lib/persist'

const coaches = persistRef('coaches', ref([]))
const loaded = ref(false)
const status = ref(STATUS.IDLE)

registerReset(() => { coaches.value = []; loaded.value = false; status.value = STATUS.IDLE })

// Bildet ligger på trenerraden (coaches.photo_url), ikke i et navnekart her.
// Kartet koblet «Simon» → simon.png for alle kull — en Simon i en annen klubb
// ville fått Halsen-Simons ansikt.
const DEMO_COACHES = [
  { id: 'demo-1', name: 'Alex', photo_url: null },
  { id: 'demo-2', name: 'Iver', photo_url: '/coaches/iver.png' },
  { id: 'demo-3', name: 'Trond', photo_url: '/coaches/trond.png' },
  { id: 'demo-4', name: 'Simon', photo_url: '/coaches/simon.png' },
  { id: 'demo-5', name: 'Jacob', photo_url: '/coaches/jacob.png' }
]

function enrichWithImages(coachList) {
  return coachList.map(c => ({ ...c, image: c.photo_url || null }))
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
    // hvem som helst som åpnet devtools. Kolonnen ble droppet 2026-08-12
    // (20260812193000_drop_coach_pin.sql); lista står igjen fordi tabellen
    // fortsatt kan få felt som ikke angår klienten.
    const { rows } = await fetchRows(
      scoped(supabase.from('coaches').select('id, name, photo_url')).order('name'),
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

  return { coaches, status, fetchCoaches: dedupe(fetchCoaches, 'fetchCoaches') }
}
