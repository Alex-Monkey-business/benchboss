import { ref } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { parsePhone } from '../lib/phone'
import { registerReset } from '../stores/dataReset'

const referees = ref([])
const loaded = ref(false)

registerReset(() => { referees.value = []; loaded.value = false })

const DEMO_REFEREES = [
  { id: 'dref-1', name: 'Filip HF', phone: '' },
  { id: 'dref-2', name: 'Ludvik TS', phone: '' },
  { id: 'dref-3', name: 'Fredrik V', phone: '' },
  { id: 'dref-4', name: 'Olav J', phone: '' },
  { id: 'dref-5', name: 'Samuel', phone: '' }
]

export function useReferees() {
  async function fetchReferees() {
    if (loaded.value) return referees.value

    if (!isSupabaseConfigured) {
      referees.value = [...DEMO_REFEREES]
      loaded.value = true
      return referees.value
    }

    const { data, error } = await supabase
      .from('referees')
      .select('*')
      .order('name')

    if (!error && data) {
      referees.value = data
      loaded.value = true
    }
    return referees.value
  }

  async function addReferee(name, phone) {
    const cleanPhone = parsePhone(phone)
    if (!isSupabaseConfigured) {
      const newRef = { id: 'dref-' + Date.now(), name: name.trim(), phone: cleanPhone }
      referees.value.push(newRef)
      referees.value.sort((a, b) => a.name.localeCompare(b.name))
      return newRef
    }

    const { data, error } = await supabase
      .from('referees')
      .insert({ name: name.trim(), phone: cleanPhone || null })
      .select()
      .single()

    if (!error && data) {
      referees.value.push(data)
      referees.value.sort((a, b) => a.name.localeCompare(b.name))
    }
    return data
  }

  async function updateReferee(id, updates) {
    const payload = { ...updates }
    if ('phone' in payload) payload.phone = parsePhone(payload.phone) || null
    if ('name' in payload) payload.name = payload.name.trim()

    if (!isSupabaseConfigured) {
      const idx = referees.value.findIndex(r => r.id === id)
      if (idx > -1) Object.assign(referees.value[idx], payload)
      referees.value.sort((a, b) => a.name.localeCompare(b.name))
      return referees.value[idx]
    }

    const { data, error } = await supabase
      .from('referees')
      .update(payload)
      .eq('id', id)
      .select()
      .single()

    if (!error && data) {
      const idx = referees.value.findIndex(r => r.id === id)
      if (idx > -1) referees.value[idx] = data
      referees.value.sort((a, b) => a.name.localeCompare(b.name))
    }
    return data
  }

  async function deleteReferee(id) {
    if (!isSupabaseConfigured) {
      referees.value = referees.value.filter(r => r.id !== id)
      return
    }

    await supabase.from('referees').delete().eq('id', id)
    referees.value = referees.value.filter(r => r.id !== id)
  }

  function getRefereeByName(name) {
    if (!name) return null
    return referees.value.find(r => r.name === name) || null
  }

  return { referees, fetchReferees, addReferee, updateReferee, deleteReferee, getRefereeByName }
}
