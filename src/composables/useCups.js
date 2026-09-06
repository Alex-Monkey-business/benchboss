import { ref, computed } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { localISODate } from '../lib/dateLabels'
import { registerReset } from '../stores/dataReset'
import { fetchRows, STATUS, dedupe } from '../lib/query'
import { scoped, withCohort } from '../lib/scope'
import { slugify } from '../lib/playerList'
import { persistRef } from '../lib/persist'

const cups = persistRef('cups', ref([]))
const activeCup = persistRef('activeCup', ref(null))
const loaded = ref(false)
const status = ref(STATUS.IDLE)

registerReset(() => {
  cups.value = []
  activeCup.value = null
  loaded.value = false
  status.value = STATUS.IDLE
})

// Cupen er «i gang» så lenge den er aktiv og sluttdatoen ikke er passert.
// Datosjekken er sikkerhetsnettet for når ingen husket å sette completed.
// Alt som skal vike for cup (Hjem-kortet, foreldrenes cup-fane) leser denne.
const cupInProgress = computed(() => {
  const cup = activeCup.value
  if (!cup || cup.status !== 'active') return false
  return !cup.end_date || cup.end_date >= localISODate()
})

const DEMO_CUPS = [
  { id: 'demo-cup-1', name: 'Sandarcupen', venue: 'Virik Idrettspark, Sandefjord', start_date: '2026-08-08', end_date: '2026-08-09', status: 'active', created_at: '2026-08-04' }
]

export function useCups() {
  async function fetchCups() {
    if (loaded.value) return cups.value

    if (!isSupabaseConfigured) {
      cups.value = DEMO_CUPS
      activeCup.value = DEMO_CUPS[0]
      loaded.value = true
      status.value = STATUS.OK
      return cups.value
    }

    status.value = STATUS.LOADING
    const { rows } = await fetchRows(
      scoped(supabase.from('cups').select('*')).order('created_at', { ascending: false }),
      'cups'
    )

    if (!rows) {
      status.value = STATUS.ERROR
      return cups.value
    }

    cups.value = rows
    activeCup.value = rows.find(c => c.status === 'active') || rows[0] || null
    loaded.value = true
    status.value = STATUS.OK
    return cups.value
  }

  // ---- Skriving ----
  //
  // Cupene ble hittil seedet med SQL. En trener uten serie har ingenting å
  // koordinere før han kan legge inn turneringen selv, og det er hele grunnen
  // til at dette finnes.
  //
  // `withCohort` er ikke valgfritt: cups er en rottabell uten forelder å arve
  // cohort_id fra, og med to kull nekter bb_cohort_root å gjette.

  // Lagnavn → slug, unike innenfor cupen. «Blå» og «Blå 2» skal ikke bli
  // samme rad i troppen fordi de slugges likt.
  function teamRows(navn) {
    const ut = []
    for (const n of navn) {
      const name = String(n || '').trim()
      if (!name) continue
      let slug = slugify(name) || 'lag'
      let i = 2
      while (ut.some(t => t.slug === slug)) slug = `${slugify(name) || 'lag'}-${i++}`
      ut.push({ slug, name })
    }
    return ut
  }

  async function createCup({ name, venue, start_date, end_date, teams = [] }) {
    const rad = {
      name: String(name || '').trim(),
      venue: String(venue || '').trim() || null,
      start_date: start_date || null,
      end_date: end_date || null,
      status: 'active',
      teams: teamRows(teams)
    }

    if (!isSupabaseConfigured) {
      const lokal = { id: 'demo-cup-' + Date.now(), created_at: new Date().toISOString(), ...rad }
      cups.value = [lokal, ...cups.value]
      activeCup.value = lokal
      return lokal
    }

    const { data, error } = await supabase
      .from('cups')
      .insert(withCohort(rad))
      .select()
      .single()
    if (error || !data) return null

    cups.value = [data, ...cups.value]
    activeCup.value = data
    return data
  }

  // `.select()` er ikke pynt. En UPDATE som RLS filtrerer bort treffer null
  // rader og svarer «ok» — det var den bugen som låste Sten ute i en time.
  async function updateCup(id, updates) {
    const felt = { ...updates }
    if (felt.teams) felt.teams = teamRows(felt.teams)

    if (!isSupabaseConfigured) {
      const i = cups.value.findIndex(c => c.id === id)
      if (i > -1) cups.value[i] = { ...cups.value[i], ...felt }
      if (activeCup.value?.id === id) activeCup.value = cups.value[i]
      return cups.value[i]
    }

    const { data, error } = await supabase
      .from('cups')
      .update(felt)
      .eq('id', id)
      .select()
      .single()
    if (error || !data) return null

    const i = cups.value.findIndex(c => c.id === id)
    if (i > -1) cups.value[i] = data
    if (activeCup.value?.id === id) activeCup.value = data
    return data
  }

  async function deleteCup(id) {
    if (!isSupabaseConfigured) {
      cups.value = cups.value.filter(c => c.id !== id)
      if (activeCup.value?.id === id) activeCup.value = cups.value[0] || null
      return true
    }

    // cup_matches, cup_squad og cup_match_goals henger på ON DELETE CASCADE.
    const { data, error } = await supabase
      .from('cups')
      .delete()
      .eq('id', id)
      .select('id')
    if (error || !data?.length) return false

    cups.value = cups.value.filter(c => c.id !== id)
    if (activeCup.value?.id === id) activeCup.value = cups.value.find(c => c.status === 'active') || cups.value[0] || null
    return true
  }

  // Cupen man redigerer er ikke nødvendigvis den aktive.
  function selectCup(id) {
    activeCup.value = cups.value.find(c => c.id === id) || activeCup.value
  }

  return { cups, activeCup, cupInProgress, loaded, status, fetchCups: dedupe(fetchCups, 'fetchCups'), createCup, updateCup, deleteCup, selectCup }
}
