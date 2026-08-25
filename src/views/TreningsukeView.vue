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
import { useTrainingSessions, DEFAULT_WEEK_SESSIONS } from '../composables/useTrainingSessions'
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

const budgets = computed(() => {
  const m = {}
  for (const s of dager.value) m[s.id] = timeBudget(s)
  return m
})

// Fordelingen er hele poenget med tid per øvelse: får planen plass i dagen?
// Ingen tider satt ⇒ ingen linje. Vi maser ikke om en jobb ingen har begynt på.
function timeBudget(s) {
  const drills = drillsFor(s)
  const sum = drills.reduce((t, d) => t + (d.minutes || 0), 0)
  if (!sum) return null
  const total = s.duration_min || 0
  if (!total) return { text: `Til sammen ${formatDuration(sum)}`, over: false }
  const diff = total - sum
  if (diff === 0) return { text: `Fordelt: ${formatDuration(total)}`, over: false }
  if (diff > 0) return { text: `${formatDuration(diff)} ledig av ${formatDuration(total)}`, over: false }
  return { text: `${formatDuration(-diff)} over ${formatDuration(total)}`, over: true }
}

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
  const maler = kilde?.length
    ? [...kilde].sort((a, b) => a.position - b.position)
    : DEFAULT_WEEK_SESSIONS.map(t => ({ ...t, drills: [] }))

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
          <span v-if="s.focus" class="dag__focus" :class="{ 'dag__focus--clamp': openDayId !== s.id }">{{ s.focus }}</span>
          <span v-else class="dag__focus dag__focus--empty">Ingen fokus satt</span>
        </button>

        <div v-if="openDayId === s.id" class="dag__body">
          <!-- Går planen opp i dagen? Det er hele grunnen til å sette tid per
               øvelse — så svaret står der du fordeler, ikke i hodet ditt. -->
          <p
            v-if="budgets[s.id]"
            class="dag__budget"
            :class="{ 'dag__budget--over': budgets[s.id].over }"
          >{{ budgets[s.id].text }}</p>

          <!-- Øvelsene: nummerert, luftig, ferdig lest. Ingenting å trykke på
               for å se innholdet — det er dagen du åpnet. -->
          <ol v-if="drillsFor(s).length" class="ovelser">
            <li v-for="(d, i) in drillsFor(s)" :key="i" class="ovelse">
              <!-- Nummeret og tida hører sammen: «steg 2, tjue minutter». Slått
                   sammen til én flate blir tida både synlig og stor nok å treffe
                   — som egen liten pille var den begge deler for lite. -->
              <div class="ovelse__eyebrow">
                <button
                  type="button"
                  class="ovelse__meta"
                  :aria-label="d.minutes ? `Endre tid på øvelse ${i + 1}` : `Sett tid på øvelse ${i + 1}`"
                  @click="toggleMinutes(s, i, d)"
                >
                  <span class="ovelse__num">{{ i + 1 }}</span>
                  <!-- Mens stepperen står åpen står tallet der, stort. Å gjenta
                       det oppe i hjørnet ville bare vært to sannheter. -->
                  <template v-if="minutesOpen !== minutesKey(s, i)">
                    <span class="ovelse__meta-sep" aria-hidden="true">·</span>
                    <span class="ovelse__meta-time" :class="{ 'ovelse__meta-time--empty': !d.minutes }">
                      {{ d.minutes ? formatDuration(d.minutes) : 'Sett tid' }}
                    </span>
                  </template>
                </button>
                <span v-if="d.type && d.type !== 'none'" class="ovelse__badge" :class="`ovelse__badge--${d.type}`">
                  {{ d.type === 'diff' ? 'Diff' : 'Mix' }}
                </span>
                <!-- I endene av dagen peker pilene videre inn i uka. Da står
                     dagen den havner i på knappen — flytting over en grense
                     skal aldri skje i det stille. Finnes ingen nabodag, står
                     plassen tom, så × ikke vandrer sidelengs fra rad til rad. -->
                <span class="ovelse__actions">
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
                  <button type="button" class="ovelse__action" aria-label="Fjern fra dagen" @click="removeDrill(s, i)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </span>
              </div>

              <!-- Stepperen får hele bredden på egen rad. Klemt inn på metalinja
                   ble knappene 26 px — og selv 44 px ser puslete ut når tegnet
                   inni er 18 px. Her er den samme kontrollen som dagens lengde. -->
              <div v-if="minutesOpen === minutesKey(s, i)" class="ovelse__timeset">
                <div class="stepper">
                  <button type="button" class="stepper__btn" aria-label="Kortere" @click="stepDrillMinutes(s, i, d, -MIN_STEP)">−</button>
                  <span class="stepper__value">{{ formatDuration(d.minutes) }}</span>
                  <button type="button" class="stepper__btn" aria-label="Lengre" :disabled="(d.minutes || 0) >= MIN_MAX" @click="stepDrillMinutes(s, i, d, MIN_STEP)">+</button>
                </div>
                <button type="button" class="ovelse__done" @click="minutesOpen = null">Ferdig</button>
              </div>

              <h3 class="ovelse__name">{{ d.text }}</h3>
              <p v-if="d.tema" class="ovelse__tema">{{ d.tema }}</p>

              <ul v-if="d.laeringsmomenter && d.laeringsmomenter.length" class="ovelse__points">
                <li v-for="(p, pi) in d.laeringsmomenter" :key="pi">{{ p }}</li>
              </ul>

              <p v-if="d.organisering" class="ovelse__org">
                <span class="ovelse__org-label">Oppsett</span>{{ d.organisering }}
              </p>

              <a v-if="d.link && d.link.url" :href="d.link.url" target="_blank" rel="noopener" class="ovelse__link">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                {{ d.link.label || 'Se øvelsen' }}
              </a>
            </li>
          </ol>

          <!-- Redigering hører til den åpne dagen. Lukket er en leseflate. -->
          <div class="dag__foot">
            <button type="button" class="dag__action" @click="openPicker(s)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Legg til øvelse
            </button>
            <button type="button" class="dag__action" @click="openDayForm(s)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
              Rediger dagen
            </button>
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
.dag[data-accent="warm"]       { --accent-bg: #F8E8E0; --accent-text: #7A3A24; }
.dag[data-accent="sage"]       { --accent-bg: #E2EDDE; --accent-text: #3D5C44; }
.dag[data-accent="cornflower"] { --accent-bg: #D6DDEF; --accent-text: #3D456B; }
.dag[data-accent="peach"]      { --accent-bg: #F8E8E0; --accent-text: #7A3A24; }
.dag[data-accent="sky"]        { --accent-bg: #DDE6EC; --accent-text: #3A4C5C; }
.dag[data-accent="olive"]      { --accent-bg: #F0E7D6; --accent-text: #6B5630; }

:global([data-theme="dark"] .dag[data-accent="warm"]) { --accent-bg: #2A1E18; --accent-text: #F4C4A8; }
:global([data-theme="dark"] .dag[data-accent="sage"]) { --accent-bg: #1A241D; --accent-text: #B5D2B0; }
:global([data-theme="dark"] .dag[data-accent="cornflower"]) { --accent-bg: #1A1F33; --accent-text: #B9C2E5; }
:global([data-theme="dark"] .dag[data-accent="peach"]) { --accent-bg: #2A1E18; --accent-text: #F4C4A8; }
:global([data-theme="dark"] .dag[data-accent="sky"]) { --accent-bg: #1A222A; --accent-text: #B0C5D8; }
:global([data-theme="dark"] .dag[data-accent="olive"]) { --accent-bg: #2A241A; --accent-text: #D9C99E; }

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

/* Lukket skal fokuset antyde, ikke fylle: to linjer, så er kortet forutsigbart
   høyt uansett hvor mye noen har skrevet. */
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

/* ---- Øvelsene ----

   Øvelsene lå som tettpakkede rader med hårstrek mellom: en tabell, ikke en
   trening. Nå er hver øvelse en blokk med luft rundt, nummerert i rekkefølgen
   du gjennomfører den. Skillet mellom dem er avstanden, ikke en strek. */
.ovelser {
  list-style: none;
  margin: 0;
  padding: var(--ds-space-md) 0 0;
  border-top: 1px solid var(--ds-color-border-light);
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-xl);
  counter-reset: none;
}

.ovelse { min-width: 0; }

/* Nummer, type og handlinger på én dempet linje over navnet — slik holder de
   seg unna teksten du faktisk skal lese. */
/* Knappene har egen høyde nå, så linja trenger ikke egen luft under */
/* Wrap, ikke klipp. «SETT TID» + badge + tre knapper går ikke opp på 320 px, og
   kortet har overflow: hidden — så uten wrap forsvant × ut over kanten uten at
   siden fikk vannrett scroll å avsløre det med. Handlingene faller ned på egen
   linje, fortsatt høyrestilt, kun når de må. */
.ovelse__eyebrow {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ds-space-sm);
  min-width: 0;
  margin-bottom: 2px;
}

.ovelse__num {
  flex-shrink: 0;
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-bold);
  font-variant-numeric: tabular-nums;
  letter-spacing: var(--ds-tracking-wider);
  color: var(--accent-text);
}

.ovelse__badge {
  flex-shrink: 0;
  padding: 2px 7px;
  border-radius: var(--ds-radius-sm);
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.ovelse__badge--diff { background: #E2EDDE; color: #3D5C44; }
.ovelse__badge--mix { background: #F8E8E0; color: #7A3A24; }
:global([data-theme="dark"] .ovelse__badge--diff) { background: #1A241D; color: #B5D2B0; }
:global([data-theme="dark"] .ovelse__badge--mix) { background: #2A1E18; color: #F4C4A8; }

/* ---- Tid per øvelse ---- */

/* Fordelingen: står over øvelsene og overtar skillelinja deres, så det ikke
   blir to streker på rad. */
.dag__budget {
  margin: 0;
  padding: var(--ds-space-md) 0 0;
  border-top: 1px solid var(--ds-color-border-light);
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-wider);
  text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
  font-variant-numeric: tabular-nums;
}

/* Over tida er ikke en feil — planen din er bare lengre enn dagen. Aksentfarget,
   ikke rødt: det er en opplysning, ikke et alarm. */
.dag__budget--over { color: var(--accent-text); }

.dag__budget + .ovelser {
  margin-top: var(--ds-space-md);
  padding-top: 0;
  border-top: 0;
}

/* Nummer + tid som én flate. Første forsøk var en 22px pille med grå «Tid» i —
   både usynlig og umulig å treffe. Nå er den 40px høy, aksentfarget, og sier
   hva den gjør. Negativ venstremarg holder nummeret i flukt med navnet under. */
.ovelse__meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  min-height: 44px;
  margin-left: -10px;
  padding: 0 10px;
  border: none;
  border-radius: var(--ds-radius-md);
  background: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.ovelse__meta:active { background: var(--accent-bg); }

.ovelse__meta-sep {
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-tertiary);
  opacity: 0.6;
}

.ovelse__meta-time {
  padding: 2px 8px;
  border-radius: var(--ds-radius-full);
  background: var(--accent-bg);
  color: var(--accent-text);
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  font-variant-numeric: tabular-nums;
  letter-spacing: var(--ds-tracking-wider);
  text-transform: uppercase;
  white-space: nowrap;
}

/* Uten tid er den en oppfordring, ikke en verdi — stiplet, så den leses som et
   tomt felt du kan fylle, ikke som et tall som allerede står der. */
.ovelse__meta-time--empty {
  background: none;
  border: 1px dashed var(--ds-color-border);
  padding: 1px 7px;
  color: var(--ds-color-text-tertiary);
}

/* Stepperens egen rad: full bredde, og «Ferdig» under i stedet for ved siden av
   — ved siden av spiser den bredden stepperen trenger. */
.ovelse__timeset {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: var(--ds-space-sm) 0 var(--ds-space-md);
}

.ovelse__done {
  align-self: flex-end;
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

/* Ingen markering på nummeret: stepperen står rett under og sier alt. En grå
   boks rundt en ensom «1» leses som et felt, ikke som en tilstand. */

/* Pilene kan bære en dagsforkortelse og blir da bredere. Blokka er høyrestilt
   (margin-left: auto), så det er × som står i ro — den destruktive knappen skal
   ikke vandre sidelengs fra rad til rad. Pilene får flytte seg. */
.ovelse__actions {
  display: grid;
  grid-template-columns: auto auto 30px;
  align-items: center;
  flex-shrink: 0;
  margin-left: auto;
}

.ovelse__action-slot { display: block; width: 30px; }

.ovelse__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  border-radius: var(--ds-radius-sm);
  background: transparent;
  color: var(--ds-color-text-tertiary);
  opacity: 0.55;
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

/* Navnet er overskriften i øvelsen, ikke en rad i en liste */
.ovelse__name {
  margin: 0;
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-lg);
  font-weight: var(--ds-weight-semibold);
  line-height: 1.25;
  letter-spacing: -0.01em;
  color: var(--ds-color-text-primary);
}

/* Hva øvelsen handler om — det første du leser etter navnet */
.ovelse__tema {
  margin: 4px 0 0;
  font-size: var(--ds-text-sm);
  line-height: 1.45;
  font-weight: var(--ds-weight-medium);
  color: var(--accent-text);
  letter-spacing: -0.005em;
}

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
  color: var(--ds-color-text-secondary);
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

/* Oppsettet er en blokk for seg: det leses på banen, med ballen i hånda */
.ovelse__org {
  margin: var(--ds-space-md) 0 0;
  font-size: var(--ds-text-sm);
  line-height: 1.6;
  color: var(--ds-color-text-secondary);
  letter-spacing: -0.005em;
}

.ovelse__org-label {
  display: block;
  margin-bottom: 2px;
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-wider);
  text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
}

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
