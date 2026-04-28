import { ref } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'

const players = ref([])
const loaded = ref(false)

const DEMO_PLAYERS = [
  { id: 'p-1', name: 'Mads', primary_team: 'gronn' },
  { id: 'p-2', name: 'Lukas', primary_team: 'rod' },
  { id: 'p-3', name: 'Erik', primary_team: 'hvit' }
]

export function usePlayers() {
  async function fetchPlayers() {
    if (loaded.value) return players.value

    if (!isSupabaseConfigured) {
      players.value = [...DEMO_PLAYERS]
      loaded.value = true
      return players.value
    }

    const { data, error } = await supabase
      .from('players')
      .select('*')
      .order('name')

    if (!error && data) {
      players.value = data
      loaded.value = true
    }
    return players.value
  }

  async function addPlayer(name, primaryTeam) {
    const trimmed = name.trim()
    const team = primaryTeam || null

    if (!isSupabaseConfigured) {
      const newPlayer = { id: 'p-' + Date.now(), name: trimmed, primary_team: team }
      players.value.push(newPlayer)
      players.value.sort((a, b) => a.name.localeCompare(b.name))
      return newPlayer
    }

    const { data, error } = await supabase
      .from('players')
      .insert({ name: trimmed, primary_team: team })
      .select()
      .single()

    if (!error && data) {
      players.value.push(data)
      players.value.sort((a, b) => a.name.localeCompare(b.name))
    }
    return data
  }

  async function updatePlayer(id, updates) {
    const payload = { ...updates }
    if ('name' in payload) payload.name = payload.name.trim()
    if ('primary_team' in payload) payload.primary_team = payload.primary_team || null

    if (!isSupabaseConfigured) {
      const idx = players.value.findIndex(p => p.id === id)
      if (idx > -1) Object.assign(players.value[idx], payload)
      players.value.sort((a, b) => a.name.localeCompare(b.name))
      return players.value[idx]
    }

    const { data, error } = await supabase
      .from('players')
      .update(payload)
      .eq('id', id)
      .select()
      .single()

    if (!error && data) {
      const idx = players.value.findIndex(p => p.id === id)
      if (idx > -1) players.value[idx] = data
      players.value.sort((a, b) => a.name.localeCompare(b.name))
    }
    return data
  }

  async function deletePlayer(id) {
    if (!isSupabaseConfigured) {
      players.value = players.value.filter(p => p.id !== id)
      return
    }

    await supabase.from('players').delete().eq('id', id)
    players.value = players.value.filter(p => p.id !== id)
  }

  function getPlayerById(id) {
    return players.value.find(p => p.id === id) || null
  }

  return { players, fetchPlayers, addPlayer, updatePlayer, deletePlayer, getPlayerById }
}
