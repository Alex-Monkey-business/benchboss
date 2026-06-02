import { ref } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'

const sessions = ref([])
const loading = ref(false)
const loadedPeriod = ref(null)

// Demo-økter (uten Supabase). links: [{ label, url }]
const DEMO_SESSIONS = [
  {
    id: 'dts-1', period_id: 'dtp-1', position: 0,
    title: 'Tirsdag',
    accent: 'sky',
    illustration: 'tuesday_june_tranparent.png',
    focus: 'Ferdigheter under press. Bli sjef over ballen i trange rom — medtak, vending og første touch som tar deg ut av presset.',
    drills: [
      {
        type: 'diff',
        text: 'Medtak, dribling, vending og pasning. Vær sjef over ballen.',
        tema: 'Spille oss fremover',
        laeringsmomenter: [
          'Mykt medtak ut til siden — fremover på andre touch',
          'Løft blikket og finn timing på finta',
          'Finte med tempo og store bevegelser for å passere'
        ],
        organisering: 'To og to per stasjon, flere stasjoner ved siden av hverandre. Pasning gjennom en port, retningsbestemt medtak, dribling forbi kjegler, finte mot passivt press, og vending ved siste kjegle. Bytt roller.',
        link: { label: 'Medtak, dribling, vending, pasning', url: 'https://tiim.no/ovelse/medtak-dribling-vending-pasning' }
      },
      { type: 'diff', text: '3v3 med press i ryggen. Ni spillere per bane. Spill fremover.', link: null },
      { type: 'mix',  text: 'Vinneren står. Korte 7er-baner, dødballer fra keeper og faste keepere.', link: null }
    ]
  },
  {
    id: 'dts-2', period_id: 'dtp-1', position: 1,
    title: 'Torsdag',
    accent: 'peach',
    illustration: 'thursday_june_transparent.png',
    focus: 'Grunnferdigheter og spill. Ferdighetssirkel for å bli sjef over ballen, så smålagsspill 3v3 med mye involvering.',
    drills: [
      { type: 'mix',  text: 'Ferdighetssirkel som avsluttes med press. Vær sjef over ballen.', link: null },
      { type: 'diff', text: '30 minutter med «vinneren står». Tre 3v3-baner på småmål med én fast joker (A-spiller) på hver bane. Spill fremover. Differensiert i nivå A, B og C — tre lag à tre spillere per bane.', link: null }
    ]
  },
  {
    id: 'dts-3', period_id: 'dtp-1', position: 2,
    title: 'Lørdag',
    accent: 'olive',
    illustration: 'saturday_june_transparent.png',
    focus: 'Spill og mestring. Mye touch, små lag, mange mål — la dem prøve det vi har trent på.',
    drills: [
      { type: 'diff', text: 'Utvidet Barça-oppvarming. Innside, utside, såle, vendinger og finter med begge føtter, rundt kjegler.', link: null },
      { type: 'diff', text: 'Eggs (transition game). 4v4, 3v3 eller 2v2 ut fra hvor mange som er på trening.', link: { label: 'Eggs Transition Game – 4v4 til 4v3', url: 'https://tiim.no/ovelse/eggs-transition-game-4v4-til-4v3' } },
      { type: 'mix',  text: '4v4-turnering på korte baner, helst med store mål.', link: null },
      { type: 'none', text: 'Avslutt med tverrliggerkonkurranse og killer.', link: null }
    ]
  }
]

export function useTrainingSessions() {
  async function fetchSessions(periodId) {
    loading.value = true

    if (!isSupabaseConfigured) {
      sessions.value = DEMO_SESSIONS
        .filter(s => s.period_id === periodId)
        .sort((a, b) => a.position - b.position)
      loadedPeriod.value = periodId
      loading.value = false
      return sessions.value
    }

    const { data, error } = await supabase
      .from('training_sessions')
      .select('*')
      .eq('period_id', periodId)
      .order('position')

    if (!error && data) {
      sessions.value = data
      loadedPeriod.value = periodId
    }
    loading.value = false
    return sessions.value
  }

  async function createSession(periodId, payload) {
    const data = { period_id: periodId, position: sessions.value.length, accent: 'warm', illustration: null, focus: null, drills: [], ...payload }

    if (!isSupabaseConfigured) {
      const row = { id: 'dts-' + Date.now(), ...data }
      sessions.value.push(row)
      return row
    }

    const { data: row, error } = await supabase
      .from('training_sessions')
      .insert(data)
      .select()
      .single()
    if (!error && row) sessions.value.push(row)
    return row
  }

  async function updateSession(id, updates) {
    if (!isSupabaseConfigured) {
      const i = sessions.value.findIndex(s => s.id === id)
      if (i > -1) sessions.value[i] = { ...sessions.value[i], ...updates }
      return sessions.value[i]
    }

    const { data, error } = await supabase
      .from('training_sessions')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (!error && data) {
      const i = sessions.value.findIndex(s => s.id === id)
      if (i > -1) sessions.value[i] = data
    }
    return data
  }

  async function removeSession(id) {
    if (!isSupabaseConfigured) {
      sessions.value = sessions.value.filter(s => s.id !== id)
      return
    }

    const { error } = await supabase
      .from('training_sessions')
      .delete()
      .eq('id', id)
    if (!error) sessions.value = sessions.value.filter(s => s.id !== id)
  }

  // Flytt en økt opp/ned ved å bytte position med naboen.
  async function moveSession(id, dir) {
    const ordered = [...sessions.value].sort((a, b) => a.position - b.position)
    const i = ordered.findIndex(s => s.id === id)
    const j = dir === 'up' ? i - 1 : i + 1
    if (i < 0 || j < 0 || j >= ordered.length) return

    const a = ordered[i]
    const b = ordered[j]
    const posA = a.position
    const posB = b.position

    await updateSession(a.id, { position: posB })
    await updateSession(b.id, { position: posA })

    sessions.value = [...sessions.value].sort((x, y) => x.position - y.position)
  }

  return { sessions, loading, loadedPeriod, fetchSessions, createSession, updateSession, removeSession, moveSession }
}
