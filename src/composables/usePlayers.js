import { ref } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { registerReset } from '../stores/dataReset'
import { fetchRows, STATUS } from '../lib/query'
import { normalizePositions } from '../lib/playerPositions'

const players = ref([])
const loaded = ref(false)
const status = ref(STATUS.IDLE)

registerReset(() => { players.value = []; loaded.value = false; status.value = STATUS.IDLE })

const DEMO_PLAYERS = [
  // Rød — full tropp for demo-kampen Halsen Rød vs Sem Gul
  { id: 'p-1', name: 'Lukas', primary_team: 'rod', positions: ['keeper', 'forsvar'] },
  { id: 'p-2', name: 'Oliver', primary_team: 'rod', positions: ['forsvar'] },
  { id: 'p-3', name: 'Filip', primary_team: 'rod', positions: ['forsvar', 'midtbane'] },
  { id: 'p-4', name: 'Noah', primary_team: 'rod', positions: ['midtbane'] },
  { id: 'p-5', name: 'Aksel', primary_team: 'rod', positions: ['midtbane', 'angrep'] },
  { id: 'p-6', name: 'Emil', primary_team: 'rod', positions: ['angrep'] },
  { id: 'p-7', name: 'Jakob', primary_team: 'rod', positions: ['keeper'] },
  { id: 'p-8', name: 'Theo', primary_team: 'rod', positions: ['angrep'] },
  { id: 'p-9', name: 'Henrik', primary_team: 'rod', positions: [] },
  // Grønn — full tropp for Halsen Grønn vs Borre (noen egnet som lånespiller)
  { id: 'p-10', name: 'Mads', primary_team: 'gronn', loan_eligible: true, positions: ['midtbane'] },
  { id: 'p-11', name: 'William', primary_team: 'gronn', loan_eligible: true, positions: ['angrep'] },
  { id: 'p-12', name: 'Liam', primary_team: 'gronn', positions: ['keeper'] },
  { id: 'p-13', name: 'Sander', primary_team: 'gronn', loan_eligible: true, positions: ['forsvar'] },
  { id: 'p-14', name: 'Tobias', primary_team: 'gronn', positions: ['forsvar', 'midtbane'] },
  { id: 'p-15', name: 'Isak', primary_team: 'gronn', loan_eligible: true, positions: ['angrep'] },
  { id: 'p-16', name: 'Elias', primary_team: 'gronn', positions: ['midtbane'] },
  { id: 'p-17', name: 'Kasper', primary_team: 'gronn', positions: [] },
  // Hvit + uplassert
  { id: 'p-18', name: 'Erik', primary_team: 'hvit', loan_eligible: true, positions: ['midtbane', 'angrep'] },
  { id: 'p-19', name: 'Storm', primary_team: null, positions: [] }
]

export function usePlayers() {
  async function fetchPlayers() {
    if (loaded.value) return players.value

    if (!isSupabaseConfigured) {
      players.value = [...DEMO_PLAYERS]
      loaded.value = true
      status.value = STATUS.OK
      return players.value
    }

    status.value = STATUS.LOADING
    const { rows } = await fetchRows(
      supabase.from('players').select('*').order('name'),
      'players'
    )

    if (!rows) {
      status.value = STATUS.ERROR
      return players.value
    }

    players.value = rows
    loaded.value = true
    status.value = STATUS.OK
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
    // Fast rekkefølge og bare gyldige verdier — CHECK-constrainten i basen
    // avviser resten, og da vil vi ikke ha kommet dit.
    if ('positions' in payload) payload.positions = normalizePositions(payload.positions)

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

  return { players, status, fetchPlayers, addPlayer, updatePlayer, deletePlayer, getPlayerById }
}
