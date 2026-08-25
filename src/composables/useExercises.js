import { ref, computed } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { demoId } from './useTrainingSessions'
import { registerReset } from '../stores/dataReset'
import { clubScoped, withClub } from '../lib/scope'

// Øvelsesbank — gjenbrukbare øvelser (training_exercises).
// Copy-on-add: banken er malen, økta eier sin egen kopi (drills-JSONB).

const exercises = ref([])
const loading = ref(false)
const loaded = ref(false)

registerReset(() => { exercises.value = []; loading.value = false; loaded.value = false })

// Kanonisk kategorirekkefølge — banken og plukkeren grupperes og sorteres etter denne.
// Ukategoriserte samles i «Annet» nederst.
export const EXERCISE_CATEGORIES = [
  { value: 'oppvarming', label: 'Oppvarming' },
  { value: 'sjef-over-ballen', label: 'Sjef over ballen' },
  { value: 'pasning', label: 'Pasning' },
  { value: 'skudd', label: 'Skudd' },
  { value: 'spill', label: 'Spill' }
]

export function groupByCategory(list) {
  const groups = EXERCISE_CATEGORIES.map(c => ({ ...c, items: list.filter(e => e.category === c.value) }))
  const rest = list.filter(e => !e.category || !EXERCISE_CATEGORIES.some(c => c.value === e.category))
  if (rest.length) groups.push({ value: 'annet', label: 'Annet', items: rest })
  return groups.filter(g => g.items.length)
}

const DEMO_EXERCISES = [
  { id: 'dex-1', category: 'sjef-over-ballen', name: 'Medtak, dribling, vending og pasning', type: 'diff', tema: 'Spille oss fremover', organisering: 'To og to per stasjon. Pasning gjennom port, retningsbestemt medtak, dribling forbi kjegler, finte mot passivt press, vending ved siste kjegle. Bytt roller.', laeringsmomenter: ['Mykt medtak ut til siden — fremover på andre touch', 'Løft blikket og finn timing på finta', 'Finte med tempo og store bevegelser for å passere'], link: { label: 'Medtak, dribling, vending, pasning', url: 'https://tiim.no/ovelse/medtak-dribling-vending-pasning' } },
  { id: 'dex-2', category: 'spill', name: '3v3 med press i ryggen', type: 'diff', tema: 'Fart i angrep, hold overtaket', organisering: 'To baner med småmål. To forsvarere ved eget mål; den siste jager i press straks angriperne får ballen.', laeringsmomenter: [], link: null },
  { id: 'dex-3', category: 'spill', name: 'Vinneren står', type: 'mix', tema: 'Tempo og lite dødtid', organisering: 'To lag spiller kort 7er — ny kamp straks det er mål.', laeringsmomenter: [], link: null },
  { id: 'dex-4', category: 'sjef-over-ballen', name: 'Ferdighetssirkel', type: 'mix', tema: 'Sjef over ballen', organisering: 'Avsluttes med press.', laeringsmomenter: [], link: null },
  { id: 'dex-5', category: 'spill', name: 'Eggs (transition game)', type: 'diff', tema: null, organisering: '4v4, 3v3 eller 2v2 ut fra antall.', laeringsmomenter: [], link: { label: 'Eggs Transition Game – 4v4 til 4v3', url: 'https://tiim.no/ovelse/eggs-transition-game-4v4-til-4v3' } },
  { id: 'dex-6', category: 'oppvarming', name: 'Utvidet Barça-oppvarming', type: 'diff', tema: null, organisering: 'Innside, utside, såle, vendinger og finter med begge føtter, rundt kjegler.', laeringsmomenter: [], link: null }
]

function byName(a, b) {
  return a.name.localeCompare(b.name, 'no')
}

// Bankövelse → drill i en økts drills-JSONB. exercise_id = opphav, ikke synk.
export function exerciseToDrill(ex) {
  return {
    type: ex.type || 'none',
    text: ex.name,
    tema: ex.tema || null,
    organisering: ex.organisering || null,
    laeringsmomenter: [...(ex.laeringsmomenter || [])],
    link: ex.link ? { label: ex.link.label || '', url: ex.link.url || '' } : null,
    exercise_id: ex.id
  }
}

// Noen felt er dagens valg, ikke øvelsens egenskap. Tida er det tydeligste:
// samme rondo kan være 10 minutter på tirsdag og 20 på lørdag. De hører på
// drillen i økta, og må derfor overleve oppslaget mot banken under.
const DRILL_OWN_FIELDS = ['minutes']

// Øvelsen har én fasit, og den bor i banken. Retter du en skrivefeil der, slår
// den gjennom overalt øvelsen er i bruk. Den lagrede kopien i dagens drills er
// et sikkerhetsnett: slettes bank-raden, står planen igjen med det den hadde.
export function resolveDrills(drills, bank) {
  return (drills || []).map(d => {
    const ex = d.exercise_id ? bank.find(e => e.id === d.exercise_id) : null
    if (!ex) return d
    const resolved = exerciseToDrill(ex)
    // Uten denne blir alt øktspesifikt vasket bort hver gang siden tegnes:
    // du setter 15 min, og de er borte ved neste rendring.
    for (const k of DRILL_OWN_FIELDS) {
      if (d[k] != null) resolved[k] = d[k]
    }
    return resolved
  })
}

// Drill → payload for ny bankövelse (bokmerke-fra-økt).
export function drillToExercise(d) {
  return {
    name: d.text,
    type: d.type || 'none',
    tema: d.tema || null,
    organisering: d.organisering || null,
    laeringsmomenter: [...(d.laeringsmomenter || [])],
    link: d.link ? { label: d.link.label || '', url: d.link.url || '' } : null
  }
}

// Kolonnen category finnes først etter at ALTER-en er kjørt i Supabase.
// Uten den: flat liste og ingen kategorivelger — appen knekker ikke.
const supportsCategory = computed(() =>
  exercises.value.length === 0 || 'category' in (exercises.value[0] || {})
)

export function useExercises() {
  async function fetchExercises() {
    if (loaded.value) return exercises.value
    loading.value = true

    if (!isSupabaseConfigured) {
      exercises.value = [...DEMO_EXERCISES].sort(byName)
      loaded.value = true
      loading.value = false
      return exercises.value
    }

    // Banken deles på KLUBB — Halsens kull deler øvelser, Stag har sine.
    const { data, error } = await clubScoped(supabase
      .from('training_exercises')
      .select('*'))
      .order('name')

    if (!error && data) {
      exercises.value = data
      loaded.value = true
    } else if (error) {
      console.warn('Øvelsesbank utilgjengelig — er supabase-ovelsesbank-schema.sql kjørt?', error.message)
    }
    loading.value = false
    return exercises.value
  }

  async function createExercise(payload) {
    if (!isSupabaseConfigured) {
      const row = { id: demoId('dex'), laeringsmomenter: [], link: null, tema: null, organisering: null, type: 'none', ...payload }
      // DEMO_EXERCISES er demo-«databasen» — uten denne forsvinner raden ved reload.
      DEMO_EXERCISES.push(row)
      exercises.value = [...exercises.value, row].sort(byName)
      return row
    }

    const { data: row, error } = await supabase
      .from('training_exercises')
      .insert(withClub(payload))
      .select()
      .single()
    if (!error && row) exercises.value = [...exercises.value, row].sort(byName)
    return row
  }

  async function updateExercise(id, updates) {
    if (!isSupabaseConfigured) {
      const di = DEMO_EXERCISES.findIndex(e => e.id === id)
      if (di > -1) DEMO_EXERCISES[di] = { ...DEMO_EXERCISES[di], ...updates }
      const i = exercises.value.findIndex(e => e.id === id)
      if (i > -1) exercises.value[i] = { ...exercises.value[i], ...updates }
      exercises.value = [...exercises.value].sort(byName)
      return exercises.value.find(e => e.id === id)
    }

    const { data, error } = await supabase
      .from('training_exercises')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (!error && data) {
      const i = exercises.value.findIndex(e => e.id === id)
      if (i > -1) exercises.value[i] = data
      exercises.value = [...exercises.value].sort(byName)
    }
    return data
  }

  async function deleteExercise(id) {
    if (!isSupabaseConfigured) {
      const di = DEMO_EXERCISES.findIndex(e => e.id === id)
      if (di > -1) DEMO_EXERCISES.splice(di, 1)
      exercises.value = exercises.value.filter(e => e.id !== id)
      return
    }

    const { error } = await supabase
      .from('training_exercises')
      .delete()
      .eq('id', id)
    if (!error) exercises.value = exercises.value.filter(e => e.id !== id)
  }

  function findByName(name) {
    const n = (name || '').trim().toLowerCase()
    return exercises.value.find(e => e.name.trim().toLowerCase() === n) || null
  }

  // Alle øvelser lever i banken: nye drills fanges automatisk ved opprettelse.
  // Returnerer eksisterende rad ved navnetreff, ellers opprettes en ny.
  // Kall sekvensielt — findByName ser forrige insert og deduper innen samme batch.
  async function upsertFromDrill(d) {
    const name = (d.text || '').trim()
    if (!name) return null
    await fetchExercises()
    const hit = findByName(name)
    if (hit) return hit
    return createExercise(drillToExercise(d))
  }

  return { exercises, loading, loaded, supportsCategory, fetchExercises, createExercise, updateExercise, deleteExercise, findByName, upsertFromDrill }
}
