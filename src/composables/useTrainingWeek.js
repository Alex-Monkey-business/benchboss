import { ref, computed } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { registerReset } from '../stores/dataReset'
import { fetchRows, STATUS, dedupe } from '../lib/query'
import { scoped, withCohort } from '../lib/scope'
import { persistRef } from '../lib/persist'

// TRENINGSUKA — kullets faste uke, én rad per treningsdag.
//
// Her lå useTrainingSessions, som hentet øktene til ÉN måned om gangen. Måneden
// er borte (se 20260903090000_uka_er_kanon.sql): den eide dagene, utløp ved
// månedsslutt og tok rytmen med seg i fallet, og en ny måned ble laget ved å
// kopiere forrige. Uka gjentar seg — den skal ligge ett sted og gjelde til noen
// endrer den.
//
// Det som forsvant sammen med perioden: to sekvensielle spørringer på hver
// lasting (finn måneden, så hent øktene i den). Nå er uka ett oppslag.

const days = persistRef('trainingDays', ref([]))
const loading = ref(false)
const status = ref(STATUS.IDLE)

registerReset(() => {
  days.value = []
  loading.value = false
  status.value = STATUS.IDLE
})

// Her sto DEFAULT_WEEK_SESSIONS: tirsdag, torsdag og lørdag, 90 minutter — som
// er HALSENS uke. Den ble seedet inn i ethvert nytt kull, så Sten åpnet
// treningsplanen sin og fant tre økter han aldri hadde satt opp, på dager og
// tider han ikke trener. Et nytt lag skal ikke arve et annet lags uke: en tom
// uke er et ærlig svar, tre gjettede økter er ikke.

// duration_min kommer først etter at supabase-trening-varighet.sql er kjørt.
// Uten den: ingen lengde-velger, og feltet strippes før skriving — appen
// knekker ikke av at migreringen ligger etter deployen.
const supportsDuration = computed(() =>
  days.value.length === 0 || 'duration_min' in (days.value[0] || {})
)

function stripUnsupported(payload) {
  if (supportsDuration.value || !('duration_min' in payload)) return payload
  const { duration_min, ...rest } = payload
  return rest
}

// Demo-id-er må være unike også når flere rader lages i samme millisekund.
export function demoId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

// Uka sorterer seg selv på ukedag. Rader uten ukedag (gamle, eller nettopp
// opprettet) legger seg til slutt — de matcher aldri en dato, så de kan ikke
// stå mellom dagene som gjør det.
function iUkerekkefølge(a, b) {
  const wa = a.weekday ?? 99
  const wb = b.weekday ?? 99
  return wa !== wb ? wa - wb : (a.position ?? 0) - (b.position ?? 0)
}

// Demo-dager (uten Supabase).
const DEMO_DAYS = [
  {
    id: 'dts-1', position: 0,
    title: 'Tirsdag', weekday: 2, duration_min: 90,
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
    id: 'dts-2', position: 1,
    title: 'Torsdag', weekday: 4, duration_min: 90,
    accent: 'peach',
    illustration: 'thursday_june_transparent.png',
    focus: 'Grunnferdigheter og spill. Ferdighetssirkel for å bli sjef over ballen, så smålagsspill 3v3 med mye involvering.',
    drills: [
      { type: 'mix',  text: 'Ferdighetssirkel', tema: 'Sjef over ballen', organisering: 'Avsluttes med press.', link: null },
      { type: 'diff', text: 'Vinneren står — 3v3 på småmål', tema: 'Spille fremover', organisering: '30 min. Tre baner, én fast joker (A-spiller) per bane. Differensiert i nivå A, B og C — tre lag à tre per bane.', link: null }
    ]
  },
  {
    id: 'dts-3', position: 2,
    title: 'Lørdag', weekday: 6, duration_min: 75,
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

export function useTrainingWeek() {
  async function fetchWeek() {
    loading.value = true

    if (!isSupabaseConfigured) {
      days.value = [...DEMO_DAYS].sort(iUkerekkefølge)
      loading.value = false
      status.value = STATUS.OK
      return days.value
    }

    status.value = STATUS.LOADING
    // Ukedagen sorterer, plassen bryter uavgjort. NULL-ukedager havner sist i
    // Postgres' ASC av seg selv — samme svar som iUkerekkefølge gir.
    const { rows } = await fetchRows(
      scoped(supabase.from('training_sessions').select('*')).order('weekday').order('position'),
      'training_sessions'
    )
    loading.value = false

    if (!rows) {
      status.value = STATUS.ERROR
      return days.value
    }

    days.value = rows
    status.value = STATUS.OK
    return days.value
  }

  async function createDay(payload) {
    const data = stripUnsupported({ position: days.value.length, accent: 'warm', illustration: null, focus: null, drills: [], weekday: null, ...payload })

    if (!isSupabaseConfigured) {
      const row = { id: demoId('dts'), ...data }
      // DEMO_DAYS er demo-«databasen» — uten denne forsvinner raden ved neste fetch.
      DEMO_DAYS.push(row)
      days.value = [...days.value, row].sort(iUkerekkefølge)
      return row
    }

    // Uka er en rot nå, ikke et barn av en periode: klienten må si hvilket kull
    // dagen hører til, slik den gjør for spillere, kamper og cuper.
    const { data: row, error } = await supabase
      .from('training_sessions')
      .insert(withCohort(data))
      .select()
      .single()
    if (!error && row) days.value = [...days.value, row].sort(iUkerekkefølge)
    return row
  }

  async function updateDay(id, rawUpdates) {
    const updates = stripUnsupported(rawUpdates)
    if (!isSupabaseConfigured) {
      const di = DEMO_DAYS.findIndex(s => s.id === id)
      if (di > -1) DEMO_DAYS[di] = { ...DEMO_DAYS[di], ...updates }
      const i = days.value.findIndex(s => s.id === id)
      if (i > -1) days.value[i] = { ...days.value[i], ...updates }
      days.value = [...days.value].sort(iUkerekkefølge)
      return days.value.find(s => s.id === id)
    }

    const { data, error } = await supabase
      .from('training_sessions')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (!error && data) {
      const i = days.value.findIndex(s => s.id === id)
      if (i > -1) days.value[i] = data
      days.value = [...days.value].sort(iUkerekkefølge)
    }
    return data
  }

  async function removeDay(id) {
    if (!isSupabaseConfigured) {
      const di = DEMO_DAYS.findIndex(s => s.id === id)
      if (di > -1) DEMO_DAYS.splice(di, 1)
      days.value = days.value.filter(s => s.id !== id)
      return
    }

    const { data, error } = await supabase
      .from('training_sessions')
      .delete()
      .eq('id', id)
      .select('id')
    if (!error && data?.length) days.value = days.value.filter(s => s.id !== id)
  }

  return { days, loading, status, supportsDuration, fetchWeek: dedupe(fetchWeek, 'fetchWeek'), createDay, updateDay, removeDay }
}
