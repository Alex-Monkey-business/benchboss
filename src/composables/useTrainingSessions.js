import { ref } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'

const sessions = ref([])
const loading = ref(false)
const loadedPeriod = ref(null)

// Fast ukeoppsett: det er alltid trening tirsdag, torsdag og lørdag.
// Nye perioder seedes med disse tre øktene (tomme, klare for øvelser).
export const DEFAULT_WEEK_SESSIONS = [
  { title: 'Tirsdag', weekday: 2, accent: 'sky', illustration: 'tuesday_june_tranparent.png' },
  { title: 'Torsdag', weekday: 4, accent: 'peach', illustration: 'thursday_june_transparent.png' },
  { title: 'Lørdag', weekday: 6, accent: 'olive', illustration: 'saturday_june_transparent.png' }
]

// Demo-id-er må være unike også når flere rader lages i samme millisekund.
export function demoId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

// Demo-økter (uten Supabase). links: [{ label, url }]
const DEMO_SESSIONS = [
  {
    id: 'dts-1', period_id: 'dtp-1', position: 0,
    title: 'Tirsdag', weekday: 2,
    accent: 'sky',
    illustration: 'tuesday_june_tranparent.png',
    focus: 'Ferdigheter under press. Bli sjef over ballen i trange rom — medtak, vending og første touch som tar deg ut av presset.',
    drills: [
      {
        type: 'diff',
        text: 'Medtak, dribling, vending og pasning',
        tema: 'Spille oss fremover',
        laeringsmomenter: [
          'Mykt medtak ut til siden — fremover på andre touch',
          'Løft blikket og finn timing på finta',
          'Finte med tempo og store bevegelser for å passere'
        ],
        organisering: 'To og to per stasjon. Pasning gjennom port, retningsbestemt medtak, dribling forbi kjegler, finte mot passivt press, vending ved siste kjegle. Bytt roller.',
        link: { label: 'Medtak, dribling, vending, pasning', url: 'https://tiim.no/ovelse/medtak-dribling-vending-pasning' }
      },
      { type: 'diff', text: '3v3 med press i ryggen', tema: 'Fart i angrep, hold overtaket', organisering: 'To baner med småmål. To forsvarere står ved eget mål; den siste starter bak angrepslagets mål og jager i press straks angriperne får ballen fra trener. Variasjon: forsvarslaget forsvarer to mål.', link: null },
      { type: 'mix',  text: 'Vinneren står', tema: 'Tempo og lite dødtid', organisering: 'To lag spiller kort 7er — ny kamp straks det er mål. De to andre roterer ved siden: ett på styrke, ett på en lettbeint øvelse.', link: null }
    ]
  },
  {
    id: 'dts-2', period_id: 'dtp-1', position: 1,
    title: 'Torsdag', weekday: 4,
    accent: 'peach',
    illustration: 'thursday_june_transparent.png',
    focus: 'Grunnferdigheter og spill. Ferdighetssirkel for å bli sjef over ballen, så smålagsspill 3v3 med mye involvering.',
    drills: [
      { type: 'mix',  text: 'Ferdighetssirkel', tema: 'Sjef over ballen', organisering: 'Avsluttes med press.', link: null },
      { type: 'diff', text: 'Vinneren står — 3v3 på småmål', tema: 'Spille fremover', organisering: '30 min. Tre baner, én fast joker (A-spiller) per bane. Differensiert i nivå A, B og C — tre lag à tre per bane.', link: null }
    ]
  },
  {
    id: 'dts-3', period_id: 'dtp-1', position: 2,
    title: 'Lørdag', weekday: 6,
    accent: 'olive',
    illustration: 'saturday_june_transparent.png',
    focus: 'Spill og mestring. Mye touch, små lag, mange mål — la dem prøve det vi har trent på.',
    drills: [
      { type: 'diff', text: 'Utvidet Barça-oppvarming', organisering: 'Innside, utside, såle, vendinger og finter med begge føtter, rundt kjegler.', link: null },
      { type: 'diff', text: 'Eggs (transition game)', organisering: '4v4, 3v3 eller 2v2 ut fra antall.', link: { label: 'Eggs Transition Game – 4v4 til 4v3', url: 'https://tiim.no/ovelse/eggs-transition-game-4v4-til-4v3' } },
      { type: 'mix',  text: '4v4-turnering', organisering: 'Korte baner, helst med store mål.', link: null },
      { type: 'none', text: 'Tverrliggerkonkurranse og killer', link: null }
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
    const data = { period_id: periodId, position: sessions.value.length, accent: 'warm', illustration: null, focus: null, drills: [], weekday: null, ...payload }

    if (!isSupabaseConfigured) {
      const row = { id: demoId('dts'), ...data }
      // DEMO_SESSIONS er demo-«databasen» — uten denne forsvinner raden ved neste fetch.
      DEMO_SESSIONS.push(row)
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
      const di = DEMO_SESSIONS.findIndex(s => s.id === id)
      if (di > -1) DEMO_SESSIONS[di] = { ...DEMO_SESSIONS[di], ...updates }
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
      const di = DEMO_SESSIONS.findIndex(s => s.id === id)
      if (di > -1) DEMO_SESSIONS.splice(di, 1)
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
