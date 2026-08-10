import { ref } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { registerReset } from '../stores/dataReset'
import { fetchRows, STATUS } from '../lib/query'

const periods = ref([])
const loading = ref(false)
const status = ref(STATUS.IDLE)

registerReset(() => { periods.value = []; loading.value = false; status.value = STATUS.IDLE })

// Demo-perioder (uten Supabase). Erstattes av training_periods i prod.
const DEMO_PERIODS = [
  { id: 'dtp-1', title: 'Ukeplan — frem til sommerferien', lead: 'Sjef over ballen, grunnferdigheter og spill med mye involvering.', accent: 'sage', start_date: '2026-06-02', end_date: '2026-07-04', position: 0 }
]

export function useTrainingPeriods() {
  async function fetchPeriods() {
    loading.value = true

    if (!isSupabaseConfigured) {
      periods.value = [...DEMO_PERIODS].sort((a, b) => a.position - b.position)
      loading.value = false
      status.value = STATUS.OK
      return periods.value
    }

    status.value = STATUS.LOADING
    const { rows } = await fetchRows(
      supabase.from('training_periods').select('*').order('position'),
      'training_periods'
    )
    loading.value = false

    if (!rows) {
      status.value = STATUS.ERROR
      return periods.value
    }

    periods.value = rows
    status.value = STATUS.OK
    return periods.value
  }

  function getPeriod(id) {
    return periods.value.find(p => p.id === id) || null
  }

  async function createPeriod(payload) {
    const data = { position: periods.value.length, ...payload }

    if (!isSupabaseConfigured) {
      const row = { id: 'dtp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), ...data }
      // DEMO_PERIODS er demo-«databasen» — uten denne forsvinner raden ved neste fetch.
      DEMO_PERIODS.push(row)
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
      const di = DEMO_PERIODS.findIndex(p => p.id === id)
      if (di > -1) DEMO_PERIODS[di] = { ...DEMO_PERIODS[di], ...updates }
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
      const di = DEMO_PERIODS.findIndex(p => p.id === id)
      if (di > -1) DEMO_PERIODS.splice(di, 1)
      periods.value = periods.value.filter(p => p.id !== id)
      return
    }

    const { error } = await supabase
      .from('training_periods')
      .delete()
      .eq('id', id)
    if (!error) periods.value = periods.value.filter(p => p.id !== id)
  }

  return { periods, loading, status, fetchPeriods, getPeriod, createPeriod, updatePeriod, deletePeriod }
}
