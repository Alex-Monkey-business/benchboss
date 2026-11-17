import { ref, computed } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { registerReset } from '../stores/dataReset'
import { fetchRows, STATUS, cached } from '../lib/query'
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
      { type: 'diff', text: 'Egg, omstillingsspill', organisering: '4v4, 3v3 eller 2v2 ut fra antall.', link: { label: 'Egg – 4v4 til 4v3', url: 'https://tiim.no/ovelse/eggs-transition-game-4v4-til-4v3' } },
      { type: 'mix',  text: '4v4-turnering', organisering: 'Korte baner, helst med store mål.', link: null },
      { type: 'none', text: 'Tverrliggerkonkurranse og killer', link: null }
    ]
  }
]

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

  days.value = rows.map(medVentendeDrills)
  status.value = STATUS.OK
  return days.value
}

// ── Øvelsene i en dag, med to trenere ───────────────────────────────────────
//
// Før skrev hvert trykk hele øvelseslista fra telefonens kopi. To trenere som
// planla samme dag samtidig, visket ut hverandre: den siste som lagret vant,
// og den andres øvelse var borte uten at noen merket det.
//
// Nå er hver endring en funksjon av lista (endreDrills), som i Del inn. Den
// står på skjermen i samme trykk. Rett før lagring hentes den ferske lista
// fra basen, endringen legges oppå den, og det er det som skrives. Endringene
// for én dag går i kø, så to raske trykk her heller ikke overskriver hverandre.
// Feiler lagringen, tas endringen ut igjen og feilen kastes videre.
const venter = new Map() // dag-id → { base, fns: [], kjede }

function brukAlle(base, fns) {
  return fns.reduce((ds, fn) => { try { return fn([...ds]) || ds } catch { return ds } }, base || [])
}

// Det som venter, legges oppå raden fra basen, så en henting midt i en
// lagring ikke tegner lista uten trykket du nettopp gjorde.
function medVentendeDrills(row) {
  const v = venter.get(row.id)
  if (!v || !v.fns.length) return row
  v.base = row.drills || []
  return { ...row, drills: brukAlle(v.base, v.fns) }
}

function settDrills(id, drills) {
  const i = days.value.findIndex(s => s.id === id)
  if (i < 0) return
  const kopi = [...days.value]
  kopi[i] = { ...kopi[i], drills }
  days.value = kopi
}

// Mens en dag har endringer på vei, er det denne telefonen som vet best.
export function harVentendeDrills() {
  for (const v of venter.values()) if (v.fns.length) return true
  return false
}

// Sant når basen mangler bb_endre_drills (migrasjonen er ikke inne ennå).
let utenEndreDrills = false

async function endreDrills(id, fn) {
  const dag = days.value.find(s => s.id === id)
  if (!dag) throw new Error('Fant ikke dagen')
  let v = venter.get(id)
  if (!v) { v = { base: dag.drills || [], fns: [], kjede: Promise.resolve() }; venter.set(id, v) }
  if (!v.fns.length) v.base = dag.drills || []
  v.fns.push(fn)
  settDrills(id, brukAlle(v.base, v.fns))

  if (!isSupabaseConfigured) {
    v.fns.shift()
    v.base = fn([...v.base]) || v.base
    const di = DEMO_DAYS.findIndex(s => s.id === id)
    if (di > -1) DEMO_DAYS[di] = { ...DEMO_DAYS[di], drills: v.base }
    return v.base
  }

  const jobb = v.kjede.then(async () => {
    try {
      // Skrives bare hvis lista fortsatt er den vi leste (bb_endre_drills).
      // Har en annen trener skrevet i mellomtiden, leses den på nytt og
      // endringen legges oppå igjen.
      for (let forsok = 0; forsok < 4; forsok++) {
        const { data: fersk, error: lesFeil } = await supabase
          .from('training_sessions').select('drills').eq('id', id).maybeSingle()
        if (lesFeil) throw lesFeil
        if (!fersk) throw new Error('Dagen finnes ikke lenger')
        v.base = fersk.drills || []
        const neste = fn([...v.base]) || v.base
        let data = null, error = { code: 'PGRST202' }
        if (!utenEndreDrills) ({ data, error } = await supabase.rpc('bb_endre_drills', { p_id: id, p_for: v.base, p_ny: neste }))
        if (error?.code === 'PGRST202') {
          // Funksjonen er ikke i basen ennå: vanlig skriving. Huskes, så den
          // ikke prøves ved hvert trykk.
          utenEndreDrills = true
          ;({ data, error } = await supabase
            .from('training_sessions').update({ drills: neste }).eq('id', id).select())
        }
        if (error) throw error
        const rad = Array.isArray(data) ? data[0] : data
        if (!rad) continue
        v.base = rad.drills || neste
        return rad
      }
      throw new Error('Dagen ble endret samtidig. Prøv igjen.')
    } finally {
      v.fns.splice(v.fns.indexOf(fn), 1)
      settDrills(id, brukAlle(v.base, v.fns))
    }
  })
  // Kjeden skal ikke stoppe på en feil: neste trykk prøver for seg.
  v.kjede = jobb.catch(() => {})
  return jobb
}

// Henting for lib/poll: true når uka endret seg. Utenom ferskhetscachen, og
// ikke mens en endring her er på vei.
async function hentUkaForPoll() {
  if (!isSupabaseConfigured || harVentendeDrills()) return false
  const for_ = JSON.stringify(days.value)
  const { rows } = await fetchRows(
    scoped(supabase.from('training_sessions').select('*')).order('weekday').order('position'),
    'training_sessions'
  )
  if (!rows || harVentendeDrills()) return false
  const etter = JSON.stringify(rows)
  if (etter === for_) return false
  days.value = rows.map(medVentendeDrills)
  return true
}

// Uka er fersk i 30 s: Hjem, Trening og Del inn spør om den ved hvert besøk.
// En skriving gjør den gammel med en gang (supabase.js → invalidate).
const ukaFersk = cached(fetchWeek, 'week', { ok: () => status.value === STATUS.OK })

// Én treningsdag, for en direkte lenke uten noe i cachen (kjøreplanen delt
// på SMS): én rad i stedet for å vente på hele uka.
async function fetchSession(id) {
  const cachedDay = days.value.find(d => d.id === id)
  if (cachedDay || !isSupabaseConfigured) return cachedDay || null
  const { data } = await supabase.from('training_sessions').select('*').eq('id', id).maybeSingle()
  return data || null
}

export function useTrainingWeek() {
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
    // Feil kastes: skjermen skal ikke melde «lagt til» for en dag som ikke finnes.
    if (error) throw error
    if (row) days.value = [...days.value, row].sort(iUkerekkefølge)
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

    // Endringen står på skjermen med en gang; feiler lagringen, settes lista
    // tilbake og feilen kastes videre.
    const for_ = days.value
    const li = days.value.findIndex(s => s.id === id)
    if (li > -1) {
      const kopi = [...days.value]
      kopi[li] = { ...kopi[li], ...updates }
      days.value = kopi.sort(iUkerekkefølge)
    }
    const { data, error } = await supabase
      .from('training_sessions')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    // Kastes, så en øvelse som ikke ble lagret ikke ser lagret ut.
    if (error) { days.value = for_; throw error }
    if (data) {
      const i = days.value.findIndex(s => s.id === id)
      if (i > -1) days.value[i] = medVentendeDrills(data)
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
    if (error) throw error
    // Null rader er også en feil her (RLS): dagen står fortsatt i basen.
    if (!data?.length) throw new Error('Dagen ble ikke slettet')
    days.value = days.value.filter(s => s.id !== id)
  }

  return { days, loading, status, supportsDuration, fetchWeek: ukaFersk, fetchSession, createDay, updateDay, removeDay, endreDrills, hentUkaForPoll }
}
