import { ref } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { demoId } from './useTrainingSessions'

// Øvelsesbank — gjenbrukbare øvelser (training_exercises).
// Copy-on-add: banken er malen, økta eier sin egen kopi (drills-JSONB).

const exercises = ref([])
const loading = ref(false)
const loaded = ref(false)

const DEMO_EXERCISES = [
  { id: 'dex-1', name: 'Medtak, dribling, vending og pasning', type: 'diff', tema: 'Spille oss fremover', organisering: 'To og to per stasjon. Pasning gjennom port, retningsbestemt medtak, dribling forbi kjegler, finte mot passivt press, vending ved siste kjegle. Bytt roller.', laeringsmomenter: ['Mykt medtak ut til siden — fremover på andre touch', 'Løft blikket og finn timing på finta', 'Finte med tempo og store bevegelser for å passere'], link: { label: 'Medtak, dribling, vending, pasning', url: 'https://tiim.no/ovelse/medtak-dribling-vending-pasning' } },
  { id: 'dex-2', name: '3v3 med press i ryggen', type: 'diff', tema: 'Fart i angrep, hold overtaket', organisering: 'To baner med småmål. To forsvarere ved eget mål; den siste jager i press straks angriperne får ballen.', laeringsmomenter: [], link: null },
  { id: 'dex-3', name: 'Vinneren står', type: 'mix', tema: 'Tempo og lite dødtid', organisering: 'To lag spiller kort 7er — ny kamp straks det er mål.', laeringsmomenter: [], link: null },
  { id: 'dex-4', name: 'Ferdighetssirkel', type: 'mix', tema: 'Sjef over ballen', organisering: 'Avsluttes med press.', laeringsmomenter: [], link: null },
  { id: 'dex-5', name: 'Eggs (transition game)', type: 'diff', tema: null, organisering: '4v4, 3v3 eller 2v2 ut fra antall.', laeringsmomenter: [], link: { label: 'Eggs Transition Game – 4v4 til 4v3', url: 'https://tiim.no/ovelse/eggs-transition-game-4v4-til-4v3' } },
  { id: 'dex-6', name: 'Utvidet Barça-oppvarming', type: 'diff', tema: null, organisering: 'Innside, utside, såle, vendinger og finter med begge føtter, rundt kjegler.', laeringsmomenter: [], link: null }
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

    const { data, error } = await supabase
      .from('training_exercises')
      .select('*')
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
      .insert(payload)
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

  return { exercises, loading, loaded, fetchExercises, createExercise, updateExercise, deleteExercise, findByName, upsertFromDrill }
}
