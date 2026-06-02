import { ref } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'

const periods = ref([])
const loading = ref(false)

// Demo-perioder (uten Supabase). Erstattes av training_periods i prod.
const DEMO_PERIODS = [
  { id: 'dtp-1', title: 'Ukeplan — frem til sommerferien', lead: 'Samme rytme hver uke: Tirsdag ferdigheter, Torsdag dueller, Lørdag spill.', accent: 'sage', start_date: '2026-06-02', end_date: '2026-07-04', position: 0 }
]

export function useTrainingPeriods() {
  async function fetchPeriods() {
    loading.value = true

    if (!isSupabaseConfigured) {
      periods.value = [...DEMO_PERIODS].sort((a, b) => a.position - b.position)
      loading.value = false
      return periods.value
    }

    const { data, error } = await supabase
      .from('training_periods')
      .select('*')
      .order('position')

    if (!error && data) periods.value = data
    loading.value = false
    return periods.value
  }

  function getPeriod(id) {
    return periods.value.find(p => p.id === id) || null
  }

  async function createPeriod(payload) {
    const data = { position: periods.value.length, ...payload }

    if (!isSupabaseConfigured) {
      const row = { id: 'dtp-' + Date.now(), ...data }
      periods.value.push(row)
      return row
    }

    const { data: row, error } = await supabase
      .from('training_periods')
      .insert(data)
      .select()
      .single()
    if (!error && row) periods.value.push(row)
    return row
  }

  async function updatePeriod(id, updates) {
    if (!isSupabaseConfigured) {
      const i = periods.value.findIndex(p => p.id === id)
      if (i > -1) periods.value[i] = { ...periods.value[i], ...updates }
      return periods.value[i]
    }

    const { data, error } = await supabase
      .from('training_periods')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (!error && data) {
      const i = periods.value.findIndex(p => p.id === id)
      if (i > -1) periods.value[i] = data
    }
    return data
  }

  async function deletePeriod(id) {
    if (!isSupabaseConfigured) {
      periods.value = periods.value.filter(p => p.id !== id)
      return
    }

    const { error } = await supabase
      .from('training_periods')
      .delete()
      .eq('id', id)
    if (!error) periods.value = periods.value.filter(p => p.id !== id)
  }

  return { periods, loading, fetchPeriods, getPeriod, createPeriod, updatePeriod, deletePeriod }
}
