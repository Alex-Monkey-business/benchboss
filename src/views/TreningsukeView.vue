<script setup>
import { useContent } from '../composables/useContent'
// TRENINGSUKA — uka på én side, én dag åpen.
//
// Først var dette tre nivåer du navigerte ned i: måned → dag → øvelse. Det
// gjorde sammenhengen usynlig — du så aldri dagen, fokuset og øvelsene samtidig.
// Så la vi alt på én side, og da ble det motsatte problemet: tre fulle dager
// samtidig er en vegg, ikke en plan.
//
// Nå er hierarkiet synlig OG rolig: uka er dagene, én av dem er åpen. Lukket
// sier hva dagen handler om; åpen er hele treninga med luft nok til å leses på
// banen. Måneden er en hatt på toppen, ikke et sted du går.
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTrainingPeriods } from '../composables/useTrainingPeriods'
import { useTrainingSessions } from '../composables/useTrainingSessions'
import { useExercises, exerciseToDrill, resolveDrills } from '../composables/useExercises'
import { useToast } from '../composables/useToast'
import { parseTreningsplan } from '../lib/treningParser'
import { nextMonthPlan, latestPeriod } from '../lib/trainingMonth'
import { accentForPosition } from '../lib/sessionVisuals'
import { localISODate, relativeDateLabel, WEEKDAY_LABELS } from '../lib/dateLabels'
import Sheet from '../components/Sheet.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import ExercisePicker from '../components/ExercisePicker.vue'
import Skeleton from '../components/Skeleton.vue'

const { hasHandbook } = useContent()

const route = useRoute()
const router = useRouter()
const { periods, getPeriod, fetchPeriods, createPeriod, updatePeriod, deletePeriod } = useTrainingPeriods()
const { sessions, supportsDuration, fetchSessions, createSession, updateSession, removeSession } = useTrainingSessions()
const { exercises, supportsCategory, fetchExercises, createExercise } = useExercises()
const { show: showToast } = useToast()

const loading = ref(true)

// ── Hvilken måned ser vi på? ────────────────────────────────────────────────
// Uten :id i URL-en velger vi den som gjelder nå. Bare en periode som dekker
// i dag, er åpen i enden, eller starter i framtiden teller — ellers ville en
// utgått plan sett ut som den gjeldende.
function pickActivePeriod() {
  const ps = periods.value
  if (!ps.length) return null
  const today = localISODate()
  const inRange = ps.find(p => p.start_date && p.end_date && p.start_date <= today && today <= p.end_date)
  if (inRange) return inRange
  const openEnded = ps
    .filter(p => p.start_date && !p.end_date && p.start_date <= today)
    .sort((a, b) => b.start_date.localeCompare(a.start_date))[0]
  if (openEnded) return openEnded
  return ps
    .filter(p => p.start_date && p.start_date > today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))[0] || null
}

const routeId = computed(() => route.params.id || null)
const period = computed(() => (routeId.value ? getPeriod(routeId.value) : pickActivePeriod()))
const periodId = computed(() => period.value?.id || null)
const lastPeriod = computed(() => latestPeriod(periods.value))

const hasEnded = computed(() => !!(period.value?.end_date && period.value.end_date < localISODate()))
const notStarted = computed(() => !!(period.value?.start_date && period.value.start_date > localISODate()))

const monthPlan = computed(() => nextMonthPlan(lastPeriod.value))

// «1.–31. august», ikke «1. august – 31. august». Måneden står allerede i
// chipen over; datolinja skal si spennet, ikke gjenta navnet to ganger.
function dateRange(p) {
  const lang = d => new Date(d).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long' })
  if (p?.start_date && p?.end_date) {
    const a = new Date(p.start_date)
    const b = new Date(p.end_date)
    const sammeMåned = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
    return sammeMåned ? `${a.getDate()}.–${lang(p.end_date)}` : `${lang(p.start_date)} – ${lang(p.end_date)}`
  }
  if (p?.start_date) return `Fra ${lang(p.start_date)}`
  return ''
}

watch(periodId, id => { if (id) fetchSessions(id) })

// ── Dagene ──────────────────────────────────────────────────────────────────
//
// Uka sorterer seg selv. Før lå dagene i den rekkefølgen de ble opprettet, så
// en onsdag lagt til i ettertid havnet bakerst — etter lørdag. Ukedagen er
// fasit; rader uten ukedag (gamle eller nyopprettede) legger seg til slutt.
const dager = computed(() =>
  [...sessions.value].sort((a, b) => {
    const wa = a.weekday ?? 99
    const wb = b.weekday ?? 99
    return wa !== wb ? wa - wb : a.position - b.position
  })
)

// «1 t 30 min» er slik folk snakker om det. «90 min» er slik databaser gjør.
function formatDuration(min) {
  if (!min) return ''
  const t = Math.floor(min / 60)
  const m = min % 60
  if (!t) return `${m} min`
  return m ? `${t} t ${m} min` : `${t} t`
}

function drillsFor(s) {
  return resolveDrills(s.drills, exercises.value)
}

// ── Teksten har allerede et hierarki ────────────────────────────────────────
//
// Fokuset er skrevet som «Ferdigheter under press. Bli sjef over ballen i
// trange rom — medtak, vending og første touch som tar deg ut av presset.»
// Første setning ER overskriften; resten er forklaringen. Vi trenger ikke et
// nytt felt for å vise det, bare å slutte å rendre alt som én blokk.
//
// Lukket dag viser bare overskriften. Før klippet vi to linjer med ellipse midt
// i et ord — «trange rom — medta…» er ingen oppsummering.
const LEDD_MAKS = 64

function delFokus(tekst) {
  const t = String(tekst || '').trim()
  if (!t) return { ledd: '', resten: '', delt: false }
  // Stor forbokstav etter punktumet: ellers deler vi på «kl. 18» og «nivå A, B.»
  const m = t.match(/^(.+?[.!?])\s+([A-ZÆØÅ][\s\S]*)$/)
  // «Samme rytme hver uke: Tirsdag ferdigheter, Torsdag dueller, Lørdag spill.»
  // er ÉN setning. Uten dette ble hele teksten satt som overskrift — fet og i
  // aksentfarge. Finner vi ingen overskrift, er det brødtekst, ikke en tittel.
  if (!m || m[1].length > LEDD_MAKS) return { ledd: t, resten: '', delt: false }
  return { ledd: m[1], resten: m[2], delt: true }
}

const fokus = computed(() => {
  const m = {}
  for (const s of dager.value) m[s.id] = delFokus(s.focus)
  return m
})

// Beskrivelsen rendres som den er skrevet. Et forsøk på å dele den i setninger
// gjettet på en struktur som nå finnes som egne felt — og flatet ut avsnittene
// i 6 av 15 øvelser: Napoli, Rosenborg og Southampton er skrevet med tomme
// linjer, og de skal stå. CSS-en gjør jobben (white-space: pre-line).
// ── Én dag om gangen ────────────────────────────────────────────────────────
//
// Tre dager med fullt innhold på samme skjerm ble en vegg: du leste aldri én
// trening, du skummet tre. Nå er dagen åpen eller lukket, og bare én er åpen.
// Lukket sier hva dagen handler om og hvor mye som ligger i den; åpen er hele
// treninga, ferdig lest, med luft nok til å faktisk brukes på banen.
//
// Øvelsene folder seg ikke lenger ut hver for seg — i en åpen dag står de fullt
// ut. Det var et lag med trykk som bare fantes fordi plassen var for knapp.
const openDayId = ref(null)

// Hjem lenker rett på en dag: /trening/:id?dag=<id>. Ønsket brukes ÉN gang —
// ellers ville et månedsbytte senere kastet deg tilbake til dagen lenka pekte
// på, lenge etter at du sluttet å tenke på den.
const wantedDay = ref(route.query.dag || null)
const skalRulleTilDag = ref(false)

async function scrollToDay(id, behavior) {
  await nextTick()
  const el = document.getElementById(`dag-${id}`)
  if (!el) return
  const rolig = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const rull = () => el.scrollIntoView({ behavior: rolig ? 'auto' : behavior, block: 'start' })
  rull()
  // Kaldstart (bokmerke, hjemskjerm-appen, refresh): dataene er inne før siden
  // er ferdig lastet, og nettleseren nullstiller scrollen etter oss. Da lander
  // du på toppen selv om riktig dag står åpen. Én gang til når lastingen er ferdig.
  if (document.readyState !== 'complete') window.addEventListener('load', rull, { once: true })
}

function toggleDay(s) {
  const opening = openDayId.value !== s.id
  openDayId.value = opening ? s.id : null
  // Lukkes en dag ovenfor samtidig, faller kortet oppover mens du ser på det —
  // du trykker Lørdag og ender midt i Torsdag. Å hente kortet til toppen er
  // forskjellen på å åpne en dag og å miste den.
  if (opening) scrollToDay(s.id, 'smooth')
}

// Mandag = 1, søndag = 7 — samme skala som weekday-kolonnen.
function todayWeekday() {
  const js = new Date().getDay()
  return js === 0 ? 7 : js
}

// Hvilken dag skal stå åpen når du kommer inn? Den lenka ba om — ellers den du
// trenger nå: i dag hvis det er treningsdag, så neste treningsdag, så den første.
function defaultOpenDay(list) {
  if (!list.length) return null
  if (wantedDay.value) {
    const ønsket = list.find(s => s.id === wantedDay.value)
    wantedDay.value = null
    // Rullingen skjer ikke her: dagen velges mens skjelettet fortsatt står i
    // DOM-en, så elementet finnes ikke ennå. Flagget hentes i onMounted.
    if (ønsket) {
      skalRulleTilDag.value = true
      return ønsket.id
    }
  }
  const wd = todayWeekday()
  return (
    list.find(s => s.weekday === wd) ||
    list.filter(s => s.weekday && s.weekday > wd).sort((a, b) => a.weekday - b.weekday)[0] ||
    list[0]
  )?.id || null
}

// Dagene kommer inn etter at siden er tegnet, og de byttes når du skifter måned.
// Holder vi ikke valget i live her, står uka helt lukket etter et månedsbytte.
watch(dager, list => {
  if (!list.some(s => s.id === openDayId.value)) openDayId.value = defaultOpenDay(list)
}, { immediate: true })

function drillCount(s) {
  return (s.drills || []).length
}

// «3 øvelser» på det lukkede kortet: du skal se om dagen er planlagt eller tom
// uten å åpne den.
function drillCountLabel(s) {
  const n = drillCount(s)
  if (!n) return 'Ingen øvelser'
  return n === 1 ? '1 øvelse' : `${n} øvelser`
}

// ── Tid per øvelse ──────────────────────────────────────────────────────────
//
// Tida bor på drillen i økta, ikke på bankøvelsen: samme rondo er 10 minutter
// på tirsdag og 20 på lørdag. Lagres i drills-JSONB, så ingen migrasjon.
// (resolveDrills må bevare feltet — se DRILL_OWN_FIELDS i useExercises.)
const MIN_STEP = 5
const MIN_MAX = 60
const MIN_START = 10

// Hvilken øvelse har stepperen åpen? Ett tall om gangen, ellers står dagen full
// av pluss og minus.
const minutesOpen = ref(null)

function minutesKey(s, i) {
  return `${s.id}:${i}`
}

function toggleMinutes(s, i, d) {
  const k = minutesKey(s, i)
  if (minutesOpen.value === k) { minutesOpen.value = null; return }
  minutesOpen.value = k
  // Første trykk skal gjøre noe: uten tid settes et utgangspunkt du kan justere
  // fra, i stedet for en tom stepper som venter på deg.
  if (!d.minutes) setDrillMinutes(s, i, MIN_START)
}

function setDrillMinutes(s, i, minutes) {
  const m = Math.min(MIN_MAX, Math.max(0, minutes))
  queueDrills(s.id, ds => ds.map((d, idx) => (idx === i ? { ...d, minutes: m || null } : d)))
}

function stepDrillMinutes(s, i, d, delta) {
  const next = (d.minutes || 0) + delta
  // Ned fra 5 er å fjerne tida, ikke å sette null minutter.
  if (next <= 0) { minutesOpen.value = null; setDrillMinutes(s, i, 0); return }
  setDrillMinutes(s, i, next)
}

// ── Tidslinja ───────────────────────────────────────────────────────────────
//
// Økta er ikke en liste, den er en time. Klokka i venstremargen svarer på det
// du faktisk lurer på når du står på banen: hvor er vi nå, og hvor mye er igjen.
//
// Blokkene er IKKE proporsjonale med tida. Det var den opplagte varianten, men
// målingen sa nei: en 30-minutters kamp har ofte én setning tekst, så
// proporsjonal høyde ville lagt til tomrom akkurat der vi prøver å fjerne det.
// Klokka gir samme lesning gratis.
//
// Klokka løper bare når HVER øvelse har en tid. Mangler én, er summen en løgn —
// da står rekkefølgen der i stedet.
function klokke(min) {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`
}

function byggTidslinje(s) {
  const drills = drillsFor(s)
  const gaar = drills.length > 0 && drills.every(d => d.minutes > 0)
  let t = 0
  const rader = drills.map((d, i) => {
    const merke = gaar ? klokke(t) : String(i + 1)
    if (gaar) t += d.minutes
    return { d, i, merke }
  })

  // Summen er en endestasjon på linja, ikke et avsnitt over den.
  const sum = drills.reduce((a, d) => a + (d.minutes || 0), 0)
  const total = s.duration_min || 0
  let slutt = null
  if (sum) {
    const diff = total - sum
    slutt = {
      merke: gaar ? klokke(sum) : formatDuration(sum),
      tekst: !total ? 'til sammen'
        : diff === 0 ? 'går akkurat opp'
        : diff > 0 ? `${formatDuration(diff)} ledig av ${formatDuration(total)}`
        : `${formatDuration(-diff)} over ${formatDuration(total)}`,
      over: diff < 0
    }
  }
  return { rader, slutt }
}

const tidslinjer = computed(() => {
  const m = {}
  for (const s of dager.value) m[s.id] = byggTidslinje(s)
  return m
})

// ── Les eller planlegg ──────────────────────────────────────────────────────
//
// Den åpne dagen bar 16 knapper for 660 tegn innhold. Pilene, kryssene og
// tidsstepperne er planlegging — de hører hjemme i en annen modus enn den du
// leser i med ball i hånda. Én bryter, og lesemodus har null knapper per øvelse.
const editDayId = ref(null)

// ── Detaljen bak ett trykk ──────────────────────────────────────────────────
//
// Momenter og oppsett er forberedelse; navn, tema og tid er det du sjekker
// underveis. Dette er ikke laget vi fjernet i runde 8: da viste den lukkede
// øvelsen bare navnet, så du vant ingenting på å lukke den.
const openDrillKey = ref(null)

function harDetalj(d) {
  return !!(d.laeringsmomenter?.length || d.gruppe || d.utstyr || d.organisering || d.link?.url)
}

function toggleDrill(s, i, d) {
  if (!harDetalj(d)) return
  const k = minutesKey(s, i)
  openDrillKey.value = openDrillKey.value === k ? null : k
}

// Bytter du dag, starter du på nytt: lesemodus, ingenting utfoldet.
watch(openDayId, () => {
  editDayId.value = null
  openDrillKey.value = null
  minutesOpen.value = null
})

// Serialisert kø per dag: to raske trykk skal ikke overskrive hverandre.
const queues = new Map()
function queueDrills(sessionId, mutate) {
  const current = sessions.value.find(s => s.id === sessionId)
  const prev = queues.get(sessionId) || Promise.resolve()
  const next = prev.then(() => {
    const live = sessions.value.find(s => s.id === sessionId) || current
    return updateSession(sessionId, { drills: mutate([...(live?.drills || [])]) })
  })
  queues.set(sessionId, next)
  return next
}

// Uka er én liste, ikke tre. Pilene stoppet før i endene av dagen — nå
// fortsetter de inn i nabodagen, så «denne tar vi heller på lørdag» er ett
// trykk i stedet for fjern-finn-i-banken-legg-til (som dessuten mistet tida).
function naboDag(s, dir) {
  const i = dager.value.findIndex(d => d.id === s.id)
  if (i < 0) return null
  return dager.value[dir === 'up' ? i - 1 : i + 1] || null
}

// «tir», «lør» — står på pila som krysser, så flyttingen aldri er en overraskelse.
function kortDag(title) {
  return (title || '').slice(0, 3).toLowerCase()
}

async function moveDrill(s, i, dir) {
  // Stepperen henger på plassen i lista, ikke på øvelsen. Flytter du raden, ville
  // den blitt stående åpen på naboen.
  minutesOpen.value = null

  const j = dir === 'up' ? i - 1 : i + 1
  if (j >= 0 && j < (s.drills || []).length) {
    queueDrills(s.id, ds => {
      const arr = [...ds]
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
      return arr
    })
    return
  }

  const nabo = naboDag(s, dir)
  const drill = s.drills?.[i]
  if (!nabo || !drill) return
  // Hele drill-objektet flyttes, ikke bare navnet: tida og opphavet (exercise_id)
  // følger med. Opp legger den nederst i dagen over, ned øverst i dagen under —
  // uka leses fortsatt ovenfra og ned.
  await queueDrills(s.id, ds => ds.filter((_, idx) => idx !== i))
  await queueDrills(nabo.id, ds => (dir === 'up' ? [...ds, drill] : [drill, ...ds]))
  showToast(`Flyttet til ${nabo.title.toLowerCase()}`, 'success')
}

// Fjerne fra dagen er ikke sletting — øvelsen blir liggende i banken.
function removeDrill(s, i) {
  const d = s.drills?.[i]
  if (!d) return
  queueDrills(s.id, ds => ds.filter((_, idx) => idx !== i))
  showToast(d.exercise_id ? 'Fjernet — ligger i banken' : 'Fjernet', 'success')
}

// ── Plukkeren ───────────────────────────────────────────────────────────────
const pickerFor = ref(null)
const pickerSession = computed(() => sessions.value.find(s => s.id === pickerFor.value) || null)

function openPicker(s) { pickerFor.value = s.id }

function toggleExercise(ex) {
  const s = pickerSession.value
  if (!s) return
  const match = d => d.exercise_id === ex.id || (d.text || '').trim().toLowerCase() === ex.name.trim().toLowerCase()
  const inDay = (s.drills || []).some(match)
  queueDrills(s.id, ds => (inDay ? ds.filter(d => !match(d)) : [...ds, exerciseToDrill(ex)]))
}

async function createFromPicker(f) {
  const s = pickerSession.value
  if (!s) return
  const payload = {
    name: f.name.trim(),
    type: f.type,
    tema: f.tema.trim() || null,
    gruppe: (f.gruppe || '').trim() || null,
    utstyr: (f.utstyr || '').trim() || null,
    organisering: f.organisering.trim() || null,
    laeringsmomenter: f.laeringsmomenter.split('\n').map(x => x.trim()).filter(Boolean),
    link: f.link.url.trim() ? { label: f.link.label.trim(), url: f.link.url.trim() } : null
  }
  if (supportsCategory.value) payload.category = f.category || null
  const row = await createExercise(payload)
  if (row) {
    await queueDrills(s.id, ds => [...ds, exerciseToDrill(row)])
    showToast(`«${row.name}» lagt til`, 'success')
  }
}

// ── Dag: ukedag, lengde og fokus ────────────────────────────────────────────
//
// Ukedagen er en velger, ikke et tekstfelt. Da skriver du ikke «Tisdag», dagen
// sorterer seg selv inn på riktig plass, og navnet trenger ikke tolkes.
const DURATION_STEP = 15
const DURATION_MIN = 30
const DURATION_MAX = 150

const dayForm = ref(null)
const savingDay = ref(false)

const usedWeekdays = computed(() =>
  new Set(sessions.value.filter(s => s.id !== dayForm.value?.id).map(s => s.weekday).filter(Boolean))
)

function openDayForm(s) {
  dayForm.value = {
    id: s.id,
    weekday: s.weekday ?? null,
    duration_min: s.duration_min ?? 90,
    focus: s.focus || '',
    fallbackTitle: s.title
  }
}

function openNewDay() {
  dayForm.value = { id: null, weekday: null, duration_min: 90, focus: '', fallbackTitle: '' }
}

function stepDuration(delta) {
  const next = (dayForm.value.duration_min || 90) + delta
  dayForm.value.duration_min = Math.min(DURATION_MAX, Math.max(DURATION_MIN, next))
}

async function saveDay() {
  const f = dayForm.value
  if (!f || savingDay.value) return
  // Ukedag er påkrevd for nye dager — det er den som gir både navn og plass.
  if (!f.id && !f.weekday) return
  savingDay.value = true
  const payload = {
    focus: f.focus.trim() || null,
    weekday: f.weekday,
    duration_min: f.duration_min,
    // Uten ukedag beholder vi navnet raden allerede har, i stedet for å blanke det.
    title: f.weekday ? WEEKDAY_LABELS[f.weekday - 1] : f.fallbackTitle
  }
  if (f.id) {
    await updateSession(f.id, payload)
  } else {
    await createSession(periodId.value, {
      ...payload,
      accent: accentForPosition(sessions.value.length),
      position: sessions.value.length
    })
  }
  savingDay.value = false
  dayForm.value = null
}

const deleteDayId = ref(null)
async function confirmDeleteDay() {
  await removeSession(deleteDayId.value)
  deleteDayId.value = null
  dayForm.value = null
}

// ── Måned: bytt, lag ny, rediger ────────────────────────────────────────────
const showMonths = ref(false)
const creating = ref(false)

function goToPeriod(id) {
  showMonths.value = false
  if (id !== periodId.value) router.push(`/trening/${id}`)
}

// Ett trykk: måneden gir tittel, datoer og farge, og dagene arves fra forrige.
async function createMonth(reuse = true) {
  if (creating.value) return
  creating.value = true
  const plan = monthPlan.value
  const src = reuse ? lastPeriod.value : null
  const kilde = !src ? null
    : src.id === periodId.value ? sessions.value
    : await fetchSessions(src.id)
  // Ingen forrige måned å arve fra? Da står måneden tom. Før falt den tilbake
  // på Halsens tirsdag/torsdag/lørdag, og et nytt kull fikk en uke det aldri
  // hadde bedt om.
  const maler = kilde?.length
    ? [...kilde].sort((a, b) => a.position - b.position)
    : []

  const row = await createPeriod({
    title: plan.title,
    accent: plan.accent,
    start_date: plan.start_date,
    end_date: plan.end_date
  })
  if (row) {
    for (const [i, s] of maler.entries()) {
      await createSession(row.id, {
        title: s.title,
        weekday: s.weekday ?? null,
        // Lengden er en del av rytmen — arves videre som alt annet. Uten
        // denne mistet hver ny måned lengdene du hadde satt.
        duration_min: s.duration_min ?? 90,
        accent: s.accent || accentForPosition(i),
        illustration: s.illustration || null,
        focus: s.focus || null,
        drills: s.drills || [],
        position: i
      })
    }
  }
  creating.value = false
  showMonths.value = false
  if (row) router.push(`/trening/${row.id}`)
}

const monthForm = ref(null)
const savingMonth = ref(false)

function openEditMonth() {
  const p = period.value
  monthForm.value = { title: p.title, start_date: p.start_date || '', end_date: p.end_date || '' }
}

async function saveMonth() {
  if (!monthForm.value?.title.trim() || savingMonth.value) return
  savingMonth.value = true
  await updatePeriod(periodId.value, {
    title: monthForm.value.title.trim(),
    start_date: monthForm.value.start_date || null,
    end_date: monthForm.value.end_date || null
  })
  savingMonth.value = false
  monthForm.value = null
  showMonths.value = false
}

const showDeleteMonth = ref(false)
async function confirmDeleteMonth() {
  await deletePeriod(periodId.value)
  showDeleteMonth.value = false
  monthForm.value = null
  showMonths.value = false
  router.replace('/trening')
}

// ── Lim inn plan (hurtiginnlegging fra mobil) ───────────────────────────────
const showPaste = ref(false)
const pasteText = ref('')
const savingPaste = ref(false)
const parsedPlan = computed(() => parseTreningsplan(pasteText.value))

async function confirmPaste() {
  const parsed = parsedPlan.value
  if (!parsed.sessions.length || savingPaste.value) return
  savingPaste.value = true
  const base = sessions.value.length
  for (const [i, s] of parsed.sessions.entries()) {
    const drills = []
    for (const d of s.drills) {
      const ex = await createExercise({
        name: d.text,
        type: d.type || 'none',
        tema: d.tema || null,
        organisering: d.organisering || null,
        laeringsmomenter: d.laeringsmomenter || [],
        link: d.link || null
      })
      drills.push(ex ? exerciseToDrill(ex) : d)
    }
    await createSession(periodId.value, {
      title: s.title,
      weekday: s.weekday,
      focus: s.focus || null,
      accent: accentForPosition(base + i),
      drills,
      position: base + i
    })
  }
  savingPaste.value = false
  showPaste.value = false
  pasteText.value = ''
  showToast(`${parsed.sessions.length} ${parsed.sessions.length === 1 ? 'dag' : 'dager'} lagt til`, 'success')
}

onMounted(async () => {
  await fetchPeriods()
  if (periodId.value) await fetchSessions(periodId.value)
  fetchExercises()
  loading.value = false

  // Kommer du fra Hjem, skal dagen stå der med én gang — ikke gli forbi to
  // andre dager på vei ned. Først her er skjelettet byttet ut med ekte dager.
  await nextTick()
  if (skalRulleTilDag.value) {
    skalRulleTilDag.value = false
    scrollToDay(openDayId.value, 'auto')
  }
})
</script>

<template>
  <div class="uke">
    <div v-if="loading" class="uke__skeleton">
      <Skeleton v-for="n in 3" :key="n" height="140px" radius="var(--ds-radius-lg)" />
    </div>

    <!-- Ingen plan som gjelder nå -->
    <div v-else-if="!period" class="ds-empty">
      <img src="/illustrations/bench-boss-feature-icons/512/training-plan-transparent.png" alt="" class="ds-empty__illo" />
      <div class="ds-empty__title">
        {{ lastPeriod ? 'Ingen treningsplan som gjelder nå' : 'Ingen treningsplan ennå' }}
      </div>
      <div class="ds-empty__description">
        <template v-if="lastPeriod">«{{ lastPeriod.title }}» gikk ut {{ relativeDateLabel(lastPeriod.end_date).toLowerCase() }}.</template>
        <template v-else>Tirsdag, torsdag og lørdag legges inn klare — så fyller du på med øvelser.</template>
      </div>
      <div class="plan-actions">
        <button v-if="lastPeriod" type="button" class="ds-btn ds-btn--primary" :disabled="creating" @click="createMonth(true)">
          {{ creating ? 'Lager …' : 'Bruk forrige plan' }}
        </button>
        <button type="button" :class="['ds-btn', lastPeriod ? 'ds-btn--secondary' : 'ds-btn--primary']" :disabled="creating" @click="createMonth(false)">
          {{ lastPeriod ? 'Start tom' : `Lag plan for ${monthPlan.title.toLowerCase()}` }}
        </button>
      </div>
      <p class="plan-note">Blir «{{ monthPlan.title }}», {{ monthPlan.spenn }}</p>
    </div>

    <template v-else>
      <!-- Måneden er en hatt, ikke et sted du går -->
      <header class="uke__head">
        <h1 class="uke__title">Trening</h1>
        <button type="button" class="month-chip" @click="showMonths = true">
          {{ period.title }}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
      </header>
      <!-- Modellen er en UKE som gjentar seg, ikke tre enkelttreninger i en
           måned. Sto det bare «1.–31. august» over tre dager, leste man planen
           som tre økter. «Hver uke» er hele forskjellen. -->
      <p class="uke__dates">
        <span class="uke__repeat">Hver uke</span>
        <span v-if="dateRange(period)" class="uke__dates-span">{{ dateRange(period) }}</span>
        <span v-if="hasEnded" class="uke__flag">Avsluttet</span>
        <span v-else-if="notStarted" class="uke__flag">Starter {{ relativeDateLabel(period.start_date).toLowerCase() }}</span>
      </p>

      <!-- Dagene: én åpen om gangen. Lukket er en løfte om innhold, åpen er
           hele treninga. Uka som helhet står fortsatt på siden. -->
      <section
        v-for="s in dager"
        :key="s.id"
        :id="'dag-' + s.id"
        class="dag"
        :class="{ 'dag--open': openDayId === s.id }"
        :data-accent="s.accent || 'warm'"
      >
        <button
          type="button"
          class="dag__toggle"
          :aria-expanded="String(openDayId === s.id)"
          @click="toggleDay(s)"
        >
          <span class="dag__head">
            <span class="dag__name">{{ s.title }}</span>
            <span class="dag__meta">
              <span v-if="s.duration_min" class="dag__len">{{ formatDuration(s.duration_min) }}</span>
              <span v-if="openDayId !== s.id" class="dag__count">{{ drillCountLabel(s) }}</span>
            </span>
            <svg class="dag__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </span>
          <span v-if="s.focus" class="dag__focus" :class="{ 'dag__focus--clamp': openDayId !== s.id }">
            <span :class="fokus[s.id].delt ? 'dag__ledd' : 'dag__resten dag__resten--alene'">{{ fokus[s.id].ledd }}</span>
            <span v-if="fokus[s.id].resten && openDayId === s.id" class="dag__resten">{{ fokus[s.id].resten }}</span>
          </span>
          <span v-else class="dag__focus dag__focus--empty">Ingen fokus satt</span>
        </button>

        <div v-if="openDayId === s.id" class="dag__body">
          <!-- LESEMODUS — økta som en time, ikke en liste. Klokka i margen,
               null knapper mellom deg og innholdet. -->
          <ol v-if="drillsFor(s).length && editDayId !== s.id" class="okt">
            <li
              v-for="r in tidslinjer[s.id].rader"
              :key="r.i"
              class="steg"
              :class="{ 'steg--apen': openDrillKey === minutesKey(s, r.i) }"
            >
              <span class="steg__klokke">{{ r.merke }}</span>
              <span class="steg__prikk" aria-hidden="true"></span>

              <div class="steg__blokk">
                <component
                  :is="harDetalj(r.d) ? 'button' : 'div'"
                  :type="harDetalj(r.d) ? 'button' : null"
                  :aria-expanded="harDetalj(r.d) ? String(openDrillKey === minutesKey(s, r.i)) : null"
                  class="steg__hode"
                  :class="{ 'steg__hode--flat': !harDetalj(r.d) }"
                  @click="toggleDrill(s, r.i, r.d)"
                >
                  <span class="steg__navnlinje">
                    <span class="steg__navn">{{ r.d.text }}</span>
                    <svg v-if="harDetalj(r.d)" class="steg__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                  </span>
                  <!-- Diff/Mix er opplysning om øvelsen, ikke pynt på tittelen.
                       Ved siden av navnet spiste den 70 px av navnebredden på
                       HVER rad — på 320 px brakk «oppvarming» midt i ordet. -->
                  <!-- Diff/mix og tid er to korte, faste opplysninger — de deler
                       linje og står i ro. Fokusområdet er det eneste som varierer
                       i lengde, og får derfor sin egen linje å vokse på. -->
                  <span v-if="r.d.minutes || (r.d.type && r.d.type !== 'none')" class="steg__fakta">
                    <span v-if="r.d.type && r.d.type !== 'none'" class="ovelse__badge" :class="`ovelse__badge--${r.d.type}`">
                      {{ r.d.type === 'diff' ? 'Diff' : 'Mix' }}
                    </span>
                    <span v-if="r.d.minutes" class="steg__len">{{ formatDuration(r.d.minutes) }}</span>
                  </span>
                  <span v-if="r.d.tema" class="steg__tema">{{ r.d.tema }}</span>
                </component>

                <!-- Beskrivelsen står uten etikett: den er brødteksten, og den
                     er alltid sist. «OPPSETT» over hver eneste øvelse var fire
                     skilt for fire setninger — mer inventar enn innhold. -->
                <div v-if="openDrillKey === minutesKey(s, r.i)" class="steg__detalj">
                  <ul v-if="r.d.laeringsmomenter && r.d.laeringsmomenter.length" class="ovelse__points">
                    <li v-for="(pt, pi) in r.d.laeringsmomenter" :key="pi">{{ pt }}</li>
                  </ul>
                  <!-- Riggen: hvordan gruppa deles og hva du bærer ut. To korte
                       fakta du trenger FØR øvelsen begynner.
                       Her er ledeteksten verdt plassen: to like korte linjer
                       etter hverandre sier ikke selv hvem som er hvem, og
                       «2 keepere per bane» kan like gjerne leses som inndeling.
                       Momentene har strekene sine og beskrivelsen er brødteksten
                       — de trenger ingen. -->
                  <div v-if="r.d.gruppe || r.d.utstyr" class="ovelse__rigg">
                    <template v-if="r.d.gruppe"><span class="ovelse__merke">Gruppa</span><p>{{ r.d.gruppe }}</p></template>
                    <template v-if="r.d.utstyr"><span class="ovelse__merke">Utstyr</span><p>{{ r.d.utstyr }}</p></template>
                  </div>
                  <p v-if="r.d.organisering" class="ovelse__org">{{ r.d.organisering }}</p>
                  <a v-if="r.d.link && r.d.link.url" :href="r.d.link.url" target="_blank" rel="noopener" class="ovelse__link">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                    {{ r.d.link.label || 'Se øvelsen' }}
                  </a>
                </div>
              </div>
            </li>

            <!-- Endestasjonen: summen hører til nederst på linja, ikke i et
                 eget avsnitt over øvelsene. -->
            <li v-if="tidslinjer[s.id].slutt" class="steg steg--slutt">
              <span class="steg__klokke steg__klokke--slutt" :class="{ 'steg__klokke--over': tidslinjer[s.id].slutt.over }">{{ tidslinjer[s.id].slutt.merke }}</span>
              <span class="steg__prikk steg__prikk--slutt" aria-hidden="true"></span>
              <span class="steg__sum" :class="{ 'steg__sum--over': tidslinjer[s.id].slutt.over }">{{ tidslinjer[s.id].slutt.tekst }}</span>
            </li>
          </ol>

          <!-- PLANMODUS — hele økta som korte rader, så du ser rekkefølgen du
               endrer. Her bor pilene, tida og krysset. -->
          <div v-else-if="editDayId === s.id" class="plan">
            <div class="plan__topp">
              <span class="plan__tittel">Planlegg økta</span>
              <button type="button" class="plan__ferdig" @click="editDayId = null">Ferdig</button>
            </div>

            <ul v-if="drillsFor(s).length" class="plan__liste">
              <li v-for="(d, i) in drillsFor(s)" :key="i" class="rad">
                <button
                  type="button"
                  class="rad__tid"
                  :class="{ 'rad__tid--tom': !d.minutes }"
                  :aria-label="d.minutes ? `Endre tid på ${d.text}` : `Sett tid på ${d.text}`"
                  @click="toggleMinutes(s, i, d)"
                >{{ d.minutes ? formatDuration(d.minutes) : 'Sett tid' }}</button>

                <span class="rad__navn">{{ d.text }}</span>

                <span class="rad__handlinger">
                  <button
                    v-if="i > 0 || naboDag(s, 'up')"
                    type="button"
                    class="ovelse__action"
                    :class="{ 'ovelse__action--kryss': i === 0 }"
                    :aria-label="i > 0 ? 'Flytt opp' : `Flytt til ${naboDag(s, 'up').title}`"
                    @click="moveDrill(s, i, 'up')"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
                    <span v-if="i === 0" class="ovelse__action-day">{{ kortDag(naboDag(s, 'up').title) }}</span>
                  </button>
                  <span v-else class="ovelse__action-slot" aria-hidden="true"></span>
                  <button
                    v-if="i < drillsFor(s).length - 1 || naboDag(s, 'down')"
                    type="button"
                    class="ovelse__action"
                    :class="{ 'ovelse__action--kryss': i === drillsFor(s).length - 1 }"
                    :aria-label="i < drillsFor(s).length - 1 ? 'Flytt ned' : `Flytt til ${naboDag(s, 'down').title}`"
                    @click="moveDrill(s, i, 'down')"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                    <span v-if="i === drillsFor(s).length - 1" class="ovelse__action-day">{{ kortDag(naboDag(s, 'down').title) }}</span>
                  </button>
                  <span v-else class="ovelse__action-slot" aria-hidden="true"></span>
                  <button type="button" class="ovelse__action" :aria-label="`Fjern ${d.text} fra dagen`" @click="removeDrill(s, i)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </span>

                <!-- Stepperen får hele bredden. Klemt inn på radlinja ble
                     knappene 26 px — for små uansett hvor pent tegnet. -->
                <div v-if="minutesOpen === minutesKey(s, i)" class="rad__timeset">
                  <div class="stepper">
                    <button type="button" class="stepper__btn" aria-label="Kortere" @click="stepDrillMinutes(s, i, d, -MIN_STEP)">−</button>
                    <span class="stepper__value">{{ formatDuration(d.minutes) }}</span>
                    <button type="button" class="stepper__btn" aria-label="Lengre" :disabled="(d.minutes || 0) >= MIN_MAX" @click="stepDrillMinutes(s, i, d, MIN_STEP)">+</button>
                  </div>
                  <button type="button" class="ovelse__done" @click="minutesOpen = null">Ferdig</button>
                </div>
              </li>
            </ul>

            <p v-if="tidslinjer[s.id].slutt" class="plan__sum" :class="{ 'plan__sum--over': tidslinjer[s.id].slutt.over }">
              {{ tidslinjer[s.id].slutt.tekst }}
            </p>
          </div>

          <!-- Foten: lesemodus har én vei videre, planmodus har verktøyene. -->
          <div class="dag__foot">
            <template v-if="editDayId === s.id">
              <button type="button" class="dag__action" @click="openPicker(s)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Legg til øvelse
              </button>
              <button type="button" class="dag__action" @click="openDayForm(s)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
                Rediger dagen
              </button>
            </template>
            <template v-else>
              <button type="button" class="dag__action" @click="editDayId = s.id">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
                {{ drillsFor(s).length ? 'Planlegg økta' : 'Legg til øvelser' }}
              </button>
            </template>
          </div>
        </div>
      </section>

      <div class="uke__foot">
        <button type="button" class="uke__foot-btn" @click="openNewDay">Legg til dag</button>
        <button type="button" class="uke__foot-btn" @click="showPaste = true">Lim inn plan</button>
      </div>

      <div class="uke__links">
        <router-link to="/trening/ovelser" class="uke__link">
          <span class="uke__link-eyebrow">Øvelsesbank</span>
          <span class="uke__link-title">Alle øvelser</span>
        </router-link>
        <router-link v-if="hasHandbook" to="/trening/handbok" class="uke__link">
          <span class="uke__link-eyebrow">Håndbok</span>
          <span class="uke__link-title">Slik trener vi</span>
        </router-link>
      </div>
    </template>

    <!-- Dag: ukedag, lengde, fokus -->
    <Sheet :show="!!dayForm" :title="dayForm?.id ? 'Rediger dag' : 'Ny dag'" @close="dayForm = null">
      <form v-if="dayForm" @submit.prevent="saveDay">
        <div class="ds-form-group">
          <label class="ds-label">Ukedag</label>
          <div class="weekday-picker">
            <button
              v-for="(label, i) in WEEKDAY_LABELS"
              :key="label"
              type="button"
              :class="['weekday-pill', {
                'weekday-pill--active': dayForm.weekday === i + 1,
                'weekday-pill--taken': usedWeekdays.has(i + 1)
              }]"
              :disabled="usedWeekdays.has(i + 1)"
              :title="usedWeekdays.has(i + 1) ? `${label} ligger allerede i uka` : label"
              :aria-label="label"
              :aria-pressed="dayForm.weekday === i + 1"
              @click="dayForm.weekday = i + 1"
            >{{ label.slice(0, 3) }}</button>
          </div>
        </div>

        <div v-if="supportsDuration" class="ds-form-group">
          <label class="ds-label">Lengde</label>
          <div class="stepper">
            <button
              type="button"
              class="stepper__btn"
              aria-label="Kortere"
              :disabled="dayForm.duration_min <= 30"
              @click="stepDuration(-15)"
            >−</button>
            <span class="stepper__value">{{ formatDuration(dayForm.duration_min) }}</span>
            <button
              type="button"
              class="stepper__btn"
              aria-label="Lengre"
              :disabled="dayForm.duration_min >= 150"
              @click="stepDuration(15)"
            >+</button>
          </div>
        </div>

        <div class="ds-form-group">
          <label class="ds-label" for="dag-focus">Fokus</label>
          <textarea id="dag-focus" v-model="dayForm.focus" class="ds-input" rows="3" placeholder="Hva dagen bygger — og hva de skal sitte igjen med."></textarea>
        </div>

        <div class="sheet-actions">
          <button v-if="dayForm.id" type="button" class="ds-btn ds-btn--ghost sheet-actions__danger" @click="deleteDayId = dayForm.id">Slett dagen</button>
          <button type="submit" class="ds-btn ds-btn--primary ds-btn--lg sheet-actions__save" :disabled="(!dayForm.id && !dayForm.weekday) || savingDay">
            {{ savingDay ? 'Lagrer…' : dayForm.id ? 'Lagre' : 'Legg til dagen' }}
          </button>
        </div>
      </form>
    </Sheet>

    <!-- Måneder -->
    <Sheet :show="showMonths && !monthForm" title="Måned" @close="showMonths = false">
      <div class="month-list">
        <button
          v-for="p in periods"
          :key="p.id"
          type="button"
          :class="['month-row', { 'month-row--active': p.id === periodId }]"
          @click="goToPeriod(p.id)"
        >
          <span class="month-row__body">
            <span class="month-row__title">{{ p.title }}</span>
            <span v-if="dateRange(p)" class="month-row__dates">{{ dateRange(p) }}</span>
          </span>
          <svg v-if="p.id === periodId" class="month-row__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </button>
      </div>
      <button type="button" class="ds-btn ds-btn--primary ds-btn--lg month-add" :disabled="creating" @click="createMonth(true)">
        {{ creating ? 'Lager …' : `Ny plan for ${monthPlan.title.toLowerCase()}` }}
      </button>
      <p class="plan-note month-note">
        {{ monthPlan.spenn }}<template v-if="lastPeriod">, med dagene fra «{{ lastPeriod.title }}»</template>
      </p>
      <button type="button" class="month-edit-link" @click="openEditMonth">Rediger «{{ period?.title }}»</button>
    </Sheet>

    <!-- Rediger måned -->
    <Sheet :show="!!monthForm" :title="`Rediger ${period?.title || ''}`" @close="monthForm = null">
      <form v-if="monthForm" @submit.prevent="saveMonth">
        <div class="ds-form-group">
          <label class="ds-label" for="mnd-title">Navn</label>
          <input id="mnd-title" v-model="monthForm.title" class="ds-input" type="text" required />
        </div>
        <div class="ds-form-row">
          <div class="ds-form-group">
            <label class="ds-label" for="mnd-start">Fra</label>
            <input id="mnd-start" v-model="monthForm.start_date" class="ds-input" type="date" />
          </div>
          <div class="ds-form-group">
            <label class="ds-label" for="mnd-end">Til</label>
            <input id="mnd-end" v-model="monthForm.end_date" class="ds-input" type="date" />
          </div>
        </div>
        <div class="sheet-actions">
          <button type="button" class="ds-btn ds-btn--ghost sheet-actions__danger" @click="showDeleteMonth = true">Slett</button>
          <button type="submit" class="ds-btn ds-btn--primary ds-btn--lg sheet-actions__save" :disabled="!monthForm.title.trim() || savingMonth">
            {{ savingMonth ? 'Lagrer…' : 'Lagre' }}
          </button>
        </div>
      </form>
    </Sheet>

    <!-- Lim inn plan -->
    <Sheet :show="showPaste" title="Lim inn plan" @close="showPaste = false">
      <textarea
        v-model="pasteText"
        class="ds-input paste-input"
        rows="9"
        placeholder="Tirsdag: Ferdigheter under press
- Medtak og vending (diff)
- 3v3 med press i ryggen

Torsdag
- Ferdighetssirkel
- Vinneren står (mix)"
      ></textarea>
      <p class="paste-hint">Ukedag starter en ny dag, kulepunkter blir øvelser. «(diff)» og «(mix)» merker type.</p>

      <div v-if="parsedPlan.sessions.length" class="paste-preview">
        <div v-for="(s, i) in parsedPlan.sessions" :key="i" class="paste-preview__row">
          <span class="paste-preview__day">{{ s.title }}</span>
          <span class="paste-preview__meta">{{ s.drills.length }} {{ s.drills.length === 1 ? 'øvelse' : 'øvelser' }}</span>
        </div>
      </div>

      <button
        type="button"
        class="ds-btn ds-btn--primary ds-btn--lg paste-save"
        :disabled="!parsedPlan.sessions.length || savingPaste"
        @click="confirmPaste"
      >
        {{ savingPaste ? 'Lagrer…' : parsedPlan.sessions.length ? `Legg til ${parsedPlan.sessions.length} ${parsedPlan.sessions.length === 1 ? 'dag' : 'dager'}` : 'Legg til dager' }}
      </button>
    </Sheet>

    <ExercisePicker
      :show="!!pickerFor"
      :title-prefix="pickerSession?.title"
      :current-drills="pickerSession?.drills || []"
      @close="pickerFor = null"
      @toggle="toggleExercise"
      @create="createFromPicker"
    />

    <ConfirmDialog
      :show="!!deleteDayId"
      title="Slett dagen?"
      message="Dagen og øvelseslista på den blir borte. Øvelsene blir liggende i banken."
      confirm-label="Slett"
      variant="warning"
      @confirm="confirmDeleteDay"
      @cancel="deleteDayId = null"
    />

    <ConfirmDialog
      :show="showDeleteMonth"
      title="Slett måneden?"
      message="Hele planen og alle dagene i den blir borte for godt."
      confirm-label="Slett"
      variant="warning"
      @confirm="confirmDeleteMonth"
      @cancel="showDeleteMonth = false"
    />
  </div>
</template>

<style scoped>

.uke {
  max-width: 640px;
  margin: 0 auto;
  padding: var(--ds-space-md) var(--ds-space-lg) var(--ds-space-2xl);
}

.uke__skeleton { display: flex; flex-direction: column; gap: var(--ds-space-md); }

.uke__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-md);
  margin-bottom: 2px;
}

.uke__title {
  font-family: var(--ds-font-display);
  font-size: clamp(2rem, 6.5vw, 2.8rem);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-tighter);
  line-height: 1.1;
  color: var(--ds-color-text-primary);
  font-variation-settings: var(--ds-font-display-settings);
  margin: 0;
}

/* Måneden er en bryter, ikke en overskrift — den skal ikke konkurrere med dagene. */
.month-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  padding: 7px 10px 7px 14px;
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-elevated);
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: border-color var(--ds-duration-fast) var(--ds-ease-out);
}

.month-chip svg { width: 15px; height: 15px; color: var(--ds-color-text-tertiary); }
.month-chip:active { transform: scale(0.98); }

.uke__dates {
  margin: 0 0 var(--ds-space-xl);
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-tertiary);
  font-variant-numeric: tabular-nums;
}

/* Rytmen er hovedsaken, datoene er fotnoten — derfor bærer «Hver uke» blekket
   og spennet står dempet ved siden av. */
.uke__repeat {
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-secondary);
}

.uke__dates-span::before {
  content: '·';
  margin: 0 6px;
  opacity: 0.6;
}

.uke__flag {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-elevated);
  border: 1px solid var(--ds-color-border);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
}

/* ---- Dagen ---- */
.dag {
  background: var(--ds-color-bg-elevated);
  border: 1px solid var(--ds-color-border);
  border-left: 4px solid var(--accent-text);
  border-radius: var(--ds-radius-lg);
  margin-bottom: var(--ds-space-md);
  overflow: hidden;
  /* Pusterom når toggleDay scroller kortet til toppen */
  scroll-margin-top: var(--ds-space-md);
}

/* Den åpne dagen er dit blikket skal. Skyggen løfter den ut av rekka uten at
   de lukkede trenger å dempes ned til grått. */
.dag--open {
  box-shadow: var(--ds-shadow-md);
  margin-bottom: var(--ds-space-lg);
}

/* Hele toppen er trykkflaten — 44px+ uansett, og ingen jakt på et lite ikon */
.dag__toggle {
  display: block;
  width: 100%;
  padding: var(--ds-space-lg) var(--ds-space-lg) var(--ds-space-md);
  border: none;
  background: none;
  text-align: left;
  font: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.dag--open .dag__toggle { padding-bottom: var(--ds-space-sm); }

.dag__head {
  display: flex;
  align-items: baseline;
  gap: var(--ds-space-sm);
  min-width: 0;
}

.dag__name {
  flex: 1;
  min-width: 0;
  /* Uten klippingen renner «TORSDAG» rett inn i lengden på smale skjermer —
     boksen krympet, teksten gjorde det ikke. */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-xl);
  font-weight: var(--ds-weight-bold);
  letter-spacing: var(--ds-tracking-tight);
  text-transform: uppercase;
  color: var(--ds-color-text-primary);
}

/* Lengde og antall står ved dagen, ikke i et skjema du må åpne for å vite det */
.dag__meta {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-shrink: 0;
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  font-variant-numeric: tabular-nums;
  color: var(--accent-text);
  white-space: nowrap;
}

.dag__count::before {
  content: '·';
  margin-right: 6px;
  opacity: 0.5;
}

/* På et lukket kort under 360 px konkurrerer «1 t 30 min · 3 øvelser» ut
   dagsnavnet. Lengden viker: den står i dagen når du åpner den. Antallet
   svarer på om dagen i det hele tatt er planlagt, og blir stående. */
@media (max-width: 359px) {
  .dag:not(.dag--open) .dag__len { display: none; }
  .dag:not(.dag--open) .dag__count::before { content: none; }
}

.dag__chevron {
  flex-shrink: 0;
  align-self: center;
  width: 16px;
  height: 16px;
  color: var(--ds-color-text-tertiary);
  transition: transform var(--ds-duration-fast) var(--ds-ease-out);
}

.dag--open .dag__chevron { transform: rotate(180deg); }

@media (prefers-reduced-motion: reduce) {
  .dag__chevron { transition: none; }
}

/* Fokuset er grunnen til at akkurat disse øvelsene ligger her — så det står
   under dagen, ikke inne i den. */
.dag__focus {
  display: block;
  margin-top: 6px;
  font-size: var(--ds-text-md);
  line-height: 1.5;
  color: var(--accent-text);
  font-weight: var(--ds-weight-medium);
  letter-spacing: -0.005em;
}

/* Overskriften bærer fargen, forklaringen er vanlig brødtekst. Hele avsnittet
   i aksentfarge var både et hierarki som ikke fantes og fire linjer sterk farge. */
.dag__ledd {
  display: block;
  font-weight: var(--ds-weight-semibold);
  color: var(--accent-text);
}

.dag__resten {
  display: block;
  margin-top: 5px;
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-regular);
  line-height: 1.55;
  color: var(--ds-color-text-secondary);
}

/* Fant vi ingen overskrift, er det bare brødtekst — og da skal den ikke ha
   luft over seg som om den fulgte etter noe. */
.dag__resten--alene { margin-top: 0; }

/* Lukket viser bare overskriften — klippet biter bare på et fokus som er
   skrevet som én lang setning. */
.dag__focus--clamp {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.dag__focus--empty {
  color: var(--ds-color-text-tertiary);
  font-weight: var(--ds-weight-regular);
  font-size: var(--ds-text-sm);
}

.dag__body {
  padding: 0 var(--ds-space-lg) var(--ds-space-lg);
}

/* ---- Økta som tidslinje ----

   Målt før omskrivinga: en åpen dag med fire øvelser var 1140 px — 1,35
   skjermer — for 660 tegn innhold, og bar 16 knapper. Det var ikke teksten som
   var for mye. Det var alt som lå rundt den.

   Nå: klokka i venstremargen, navnet først, detaljen bak ett trykk. Ingen
   knapper mellom deg og innholdet i lesemodus. */
.okt {
  position: relative;
  list-style: none;
  margin: 0;
  padding: var(--ds-space-md) 0 0;
  border-top: 1px solid var(--ds-color-border-light);
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-lg);
}

/* 46 px margin: bred nok til «1:05», smal nok til at navnet fortsatt eier
   venstrekanten. Linja går på 34 px, midt mellom tall og tekst. */
.steg {
  position: relative;
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  align-items: start;
}

/* Linja tegnes per steg og strekkes over mellomrommet ned til neste prikk —
   ett sammenhengende spor, uten at containeren må vite hvor prikkene havner. */
.steg::before {
  content: '';
  position: absolute;
  left: 41px;
  top: 10px;
  bottom: calc(-1 * var(--ds-space-lg) - 10px);
  width: 1px;
  background: var(--ds-color-border-light);
}

.steg--slutt::before,
.steg:last-child::before { display: none; }

.steg__klokke {
  padding: 4px 22px 0 0;
  text-align: right;
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  color: var(--ds-color-text-tertiary);
}

.steg__klokke--slutt { color: var(--ds-color-text-secondary); }
.steg__klokke--over { color: var(--accent-text); }

/* Ringen i kortfargen kutter linja, så prikken sitter PÅ sporet og ikke oppå. */
.steg__prikk {
  position: absolute;
  left: 36px;
  top: 6px;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: var(--accent-text);
  border: 3px solid var(--ds-color-bg-elevated);
}

.steg__prikk--slutt { background: var(--ds-color-text-tertiary); }

.steg__blokk { min-width: 0; }

/* Hele blokka er trykkflaten — ingen jakt på en liten pil. Har øvelsen ingen
   detalj, er den ikke en knapp i det hele tatt: da lyver ikke flata om at det
   ligger noe bak. */
.steg__hode {
  display: block;
  width: 100%;
  min-height: 44px;
  margin: 0;
  padding: 0 0 2px;
  border: none;
  background: none;
  text-align: left;
  font: inherit;
  color: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.steg__hode--flat { min-height: 0; cursor: default; }

.steg__navnlinje {
  display: flex;
  align-items: flex-start;
  gap: var(--ds-space-sm);
  min-width: 0;
}

.steg__navn {
  min-width: 0;
  overflow-wrap: break-word;
  hyphens: auto;
  font-family: var(--ds-font-display-sans);
  /* 20px brakk to av tre øvelsesnavn på 390 px, og en tolinjers tittel over en
     enlinjers gjør lista ujevn. 16 px brekker ett av tre og tar 45 px av dagen.
     Hierarkiet ligger i vekt og farge, ikke i punktene. */
  font-size: var(--ds-text-base);
  font-weight: var(--ds-weight-semibold);
  line-height: 1.3;
  letter-spacing: -0.01em;
  color: var(--ds-color-text-primary);
}

.steg__chevron {
  flex: none;
  margin: 4px 0 0 var(--ds-space-sm);
  margin-left: auto;
  width: 15px;
  height: 15px;
  color: var(--ds-color-text-tertiary);
  transition: transform var(--ds-duration-fast) var(--ds-ease-out);
}

.steg--apen .steg__chevron { transform: rotate(180deg); }

/* Tema og lengde på samme linje: hva øvelsen handler om, og hvor lenge den
   varer. Klokka i margen sier når den begynner — de tre svarer på hver sin ting. */
/* Metalinja wrappet: «15 min» havnet på linje to eller tre avhengig av hvor
   langt fokusområdet var, så tallet flyttet seg fra rad til rad. Nå bærer
   linja bare de to som har fast bredde, og den kan ikke brekke. */
.steg__fakta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
  font-size: var(--ds-text-sm);
  line-height: 1.45;
  letter-spacing: -0.005em;
}

.steg__tema {
  display: block;
  margin-top: 3px;
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  line-height: 1.45;
  letter-spacing: -0.005em;
  color: var(--accent-text);
}

.steg__len {
  color: var(--ds-color-text-tertiary);
  font-variant-numeric: tabular-nums;
}

.steg__detalj { padding-bottom: 2px; }

.steg__sum {
  padding-top: 3px;
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  letter-spacing: -0.005em;
  color: var(--ds-color-text-tertiary);
}

/* Over tida er ikke en feil — planen din er bare lengre enn dagen. Aksentfarget,
   ikke rødt: det er en opplysning, ikke en alarm. */
.steg__sum--over { color: var(--accent-text); }

.ovelse__badge {
  flex-shrink: 0;
  align-self: center;
  padding: 2px 7px;
  border-radius: var(--ds-radius-sm);
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.ovelse__badge--diff { background: var(--accent-bg, var(--ds-badge-bg)); color: var(--accent-text, var(--ds-badge-text)); }
.ovelse__badge--mix { background: transparent; color: var(--accent-text, var(--ds-badge-text)); box-shadow: inset 0 0 0 1px currentColor; }

/* ---- Planmodus ----

   Rekkefølge og tid er planlegging, ikke lesing. Her ligger hele økta som korte
   rader, så du ser det du faktisk endrer — fire rader på én skjerm i stedet for
   fire fulle øvelser du må scrolle mellom for å flytte noe forbi hverandre. */
.plan {
  padding-top: var(--ds-space-md);
  border-top: 1px solid var(--ds-color-border-light);
}

.plan__topp {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-md);
  margin-bottom: var(--ds-space-xs);
}

.plan__tittel {
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-wider);
  text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
}

.plan__ferdig {
  flex: none;
  min-height: 36px;
  padding: 0 16px;
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-elevated);
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.plan__ferdig:active { transform: scale(0.98); }

.plan__liste {
  list-style: none;
  margin: 0;
  padding: 0;
}

.rad {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ds-space-sm);
  padding: var(--ds-space-sm) 0;
  border-bottom: 1px solid var(--ds-color-border-light);
}

.rad:last-child { border-bottom: none; }

.rad__tid {
  flex: none;
  min-width: 64px;
  min-height: 36px;
  padding: 0 8px;
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-sm);
  background: none;
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-bold);
  font-variant-numeric: tabular-nums;
  color: var(--accent-text);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.rad__tid--tom { color: var(--ds-color-text-tertiary); }

.rad__navn {
  min-width: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  line-height: 1.35;
  letter-spacing: -0.005em;
  color: var(--ds-color-text-primary);
}

/* Pilene kan bære en dagsforkortelse og blir da bredere. Blokka er høyrestilt,
   så det er × som står i ro — den destruktive knappen skal ikke vandre
   sidelengs fra rad til rad. Pilene får flytte seg. */
.rad__handlinger {
  display: grid;
  grid-template-columns: auto auto 30px;
  align-items: center;
  flex-shrink: 0;
}

.rad__timeset {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-md);
  padding-top: var(--ds-space-sm);
}

.plan__sum {
  margin: var(--ds-space-md) 0 0;
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  letter-spacing: -0.005em;
  color: var(--ds-color-text-tertiary);
}

.plan__sum--over { color: var(--accent-text); }

.ovelse__action-slot { display: block; width: 30px; }

.ovelse__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  height: 36px;
  padding: 0;
  border: none;
  border-radius: var(--ds-radius-sm);
  background: transparent;
  color: var(--ds-color-text-tertiary);
  opacity: 0.65;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: opacity var(--ds-duration-fast) var(--ds-ease-out);
}

.ovelse__action svg { width: 15px; height: 15px; flex-shrink: 0; }
.ovelse__action:hover, .ovelse__action:active { opacity: 1; color: var(--ds-color-text-primary); }

/* Krysser pila en dagegrense, står dagen den lander i på knappen. Uten den ville
   øverste pil i en dag sett ut som en død knapp — og så plutselig flyttet
   øvelsen ut av dagen du så på. */
.ovelse__action--kryss {
  gap: 3px;
  padding: 0 6px 0 3px;
}

.ovelse__action-day {
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-wider);
  text-transform: uppercase;
  line-height: 1;
}

.ovelse__done {
  flex: none;
  min-height: 44px;
  padding: 0 var(--ds-space-sm);
  margin-right: calc(var(--ds-space-sm) * -1);
  border: none;
  background: none;
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-secondary);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.ovelse__done:hover { color: var(--ds-color-text-primary); }

/* ---- Detaljen i en øvelse ---- */
.ovelse__points {
  list-style: none;
  margin: var(--ds-space-md) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ovelse__points li {
  position: relative;
  padding-left: var(--ds-space-md);
  font-size: var(--ds-text-sm);
  line-height: 1.5;
  color: var(--ds-color-text-primary);
  letter-spacing: -0.005em;
}

.ovelse__points li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.68em;
  width: 8px;
  height: 1px;
  background: var(--accent-text);
  opacity: 0.6;
}

/* Oppsettet står uten etikett. «OPPSETT» over hver eneste øvelse var fire
   skilt for fire setninger — mer inventar enn innhold. */
/* Inndeling og utstyr er det du gjør før første ball trilles, og de er korte
   fakta — ikke innledningen på beskrivelsen. Samlet i én blokk med egen vekt:
   to svarte linjer og så grå brødtekst, så grupperingen gjør jobben og vi
   slipper en etikett over hver av dem. */
/* Rutenett, ikke innrykk: brekker utstyrslinja, skal linje to stå under
   teksten — ikke under ledeteksten. Begge merkene deler kolonne, så de
   flukter uansett hvor langt det ene ordet er. */
.ovelse__rigg {
  margin: var(--ds-space-lg) 0 0;
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  align-items: baseline;
  column-gap: 8px;
  row-gap: 3px;
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  line-height: 1.45;
  letter-spacing: -0.005em;
  color: var(--ds-color-text-primary);
}

.ovelse__rigg p { margin: 0; }

/* Ledeteksten står i margen, ikke på egen rad: to ekstra linjer for to ord
   ville kostet mer enn de forklarer. */
.ovelse__merke {
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-wider);
  text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
  white-space: nowrap;
}

/* pre-line: forfatteren har allerede satt avsnittene sine med tomme linjer.
   Napoli, Rosenborg og Southampton er skrevet slik. Vi respekterer dem i
   stedet for å regne oss fram til hvor det burde brytes. */
.ovelse__org {
  margin: var(--ds-space-md) 0 0;
  white-space: pre-line;
  font-size: var(--ds-text-sm);
  line-height: 1.55;
  color: var(--ds-color-text-secondary);
  letter-spacing: -0.005em;
}

.ovelse__rigg + .ovelse__org { margin-top: var(--ds-space-sm); }

.ovelse__link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: var(--ds-space-md);
  max-width: 100%;
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-primary);
  text-decoration: underline;
  text-underline-offset: 3px;
  letter-spacing: -0.005em;
}

.ovelse__link svg { width: 14px; height: 14px; flex-shrink: 0; }

/* ---- Foten i en åpen dag ---- */
.dag__foot {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ds-space-lg);
  margin-top: var(--ds-space-xl);
  padding-top: var(--ds-space-md);
  border-top: 1px solid var(--ds-color-border-light);
}

.dag__action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: none;
  background: none;
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-secondary);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.dag__action svg { width: 14px; height: 14px; }
.dag__action:hover { color: var(--ds-color-text-primary); }

/* ---- Bunn ---- */
.uke__foot {
  display: flex;
  gap: var(--ds-space-lg);
  justify-content: center;
  margin: var(--ds-space-lg) 0 var(--ds-space-xl);
}

.uke__foot-btn {
  border: none;
  background: none;
  padding: 0;
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-secondary);
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.uke__foot-btn:hover { color: var(--ds-color-text-primary); }

.uke__links {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--ds-space-sm);
}

@media (max-width: 379px) {
  .uke__links { grid-template-columns: 1fr; }
}

.uke__link {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 14px var(--ds-space-md);
  background: var(--ds-color-bg-elevated);
  border: 1px solid var(--ds-color-border-light);
  border-radius: var(--ds-radius-lg);
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
}

.uke__link:active { transform: scale(0.99); }

.uke__link-eyebrow {
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-medium);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
}

.uke__link-title {
  font-size: var(--ds-text-md);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
}

/* ---- Tom tilstand ---- */
.plan-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--ds-space-sm);
  margin-bottom: var(--ds-space-sm);
}

.plan-note {
  margin: 0;
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-tertiary);
}

/* ---- Sheets ---- */
.sheet-actions {
  display: flex;
  gap: var(--ds-space-sm);
  margin-top: var(--ds-space-sm);
}

.sheet-actions__danger { flex-shrink: 0; color: var(--ds-color-error); }
.sheet-actions__save { flex: 1; }

/* ---- Ukedagsvelger ---- */
.weekday-picker { display: flex; gap: 6px; flex-wrap: wrap; }

.weekday-pill {
  flex: 1;
  min-width: 40px;
  padding: 9px 4px;
  border-radius: var(--ds-radius-md);
  border: 1px solid var(--ds-color-border);
  background: var(--ds-color-bg-elevated);
  color: var(--ds-color-text-secondary);
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: all var(--ds-duration-fast) var(--ds-ease-out);
}

.weekday-pill--active {
  background: var(--ds-color-accent);
  border-color: var(--ds-color-accent);
  color: var(--ds-color-accent-text);
}

/* Dagen ligger allerede i uka — to «lørdag» ville hett det samme. */
.weekday-pill--taken {
  opacity: 0.35;
  cursor: not-allowed;
}

/* ---- Lengde ---- */
.stepper {
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
}

/* 44 px var nok for tommelen, men tegnet inni var 18 px — kontrollen var
   treffbar og likevel puslete. Flaten OG symbolet må være store. */
.stepper__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  flex-shrink: 0;
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-md);
  background: var(--ds-color-bg-elevated);
  color: var(--ds-color-text-primary);
  font-family: var(--ds-font-body);
  font-size: 1.75rem;
  font-weight: var(--ds-weight-regular);
  line-height: 1;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: border-color var(--ds-duration-fast) var(--ds-ease-out);
}

.stepper__btn:disabled { opacity: 0.35; cursor: not-allowed; }
.stepper__btn:not(:disabled):active { transform: scale(0.95); }

/* Tallet er det du leser mens du justerer — da skal det være det største på
   linja, ikke minste. */
.stepper__value {
  flex: 1;
  text-align: center;
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-xl);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-tight);
  color: var(--ds-color-text-primary);
  font-variant-numeric: tabular-nums;
}

.month-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: var(--ds-space-md);
}

.month-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px;
  background: var(--ds-color-bg-elevated);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-md);
  cursor: pointer;
  text-align: left;
  font-family: var(--ds-font-body);
  -webkit-tap-highlight-color: transparent;
}

.month-row--active { border-color: var(--ds-color-text-primary); }
.month-row__body { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.month-row__title { font-weight: var(--ds-weight-semibold); font-size: var(--ds-text-sm); color: var(--ds-color-text-primary); }
.month-row__dates { font-size: var(--ds-text-xs); color: var(--ds-color-text-tertiary); font-variant-numeric: tabular-nums; }
.month-row__check { width: 18px; height: 18px; flex-shrink: 0; color: var(--ds-color-text-primary); }

.month-add { width: 100%; }
.month-note { text-align: center; margin-top: var(--ds-space-sm); }

.month-edit-link {
  display: block;
  width: 100%;
  margin-top: var(--ds-space-lg);
  padding: 0;
  border: none;
  background: none;
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.paste-input { width: 100%; font-size: var(--ds-text-sm); line-height: 1.5; resize: vertical; }

.paste-hint {
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-tertiary);
  margin: var(--ds-space-sm) 0 0;
  line-height: 1.5;
}

.paste-preview { display: flex; flex-direction: column; gap: 4px; margin-top: var(--ds-space-md); }

.paste-preview__row {
  display: flex;
  align-items: baseline;
  gap: var(--ds-space-sm);
  padding: 10px 12px;
  background: var(--ds-color-bg-subtle);
  border-radius: var(--ds-radius-md);
}

.paste-preview__day { font-weight: var(--ds-weight-semibold); font-size: var(--ds-text-sm); }
.paste-preview__meta { font-size: var(--ds-text-xs); margin-left: auto; color: var(--ds-color-text-tertiary); }

.paste-save { width: 100%; margin-top: var(--ds-space-md); }
</style>
