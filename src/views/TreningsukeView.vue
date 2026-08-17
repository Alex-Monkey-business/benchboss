<script setup>
// TRENINGSUKA — hele planen på én side.
//
// Før var dette tre nivåer du navigerte ned i: måned → dag → øvelse. Det gjorde
// sammenhengen usynlig — du så aldri dagen, fokuset og øvelsene samtidig, og
// måtte huske hvor du var. Nå er hierarkiet det du ser: uka består av dager,
// dagen har et fokus, fokuset holdes oppe av øvelser.
//
// Måneden er en hatt på toppen (hvilken versjon av uka), ikke et sted du går.
import { ref, computed, watch, onMounted } from 'vue'
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

function dateRange(p) {
  const fmt = d => new Date(d).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long' })
  if (p?.start_date && p?.end_date) return `${fmt(p.start_date)} – ${fmt(p.end_date)}`
  if (p?.start_date) return `Fra ${fmt(p.start_date)}`
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

// ── Lese øvelsen der den står ───────────────────────────────────────────────
//
// Navnet alene forteller ikke hvordan øvelsen gjennomføres. Før måtte du inn i
// banken for å finne ut av det — planen din var en liste med titler. Nå står
// temaet fast under navnet, og resten folder seg ut på stedet.
//
// Nøkkelen er øvelsen, ikke posisjonen: flytter du en rad opp, skal den åpne
// raden følge med i stedet for at naboen plutselig står åpen.
const openDrills = ref(new Set())

function drillKey(s, d) {
  return `${s.id}:${d.exercise_id || d.text}`
}

// Ingenting å folde ut ⇒ ingen chevron. Da ser du at øvelsen er tom i stedet
// for å trykke deg gjennom banken for å oppdage det samme.
function hasDetail(d) {
  return !!(d.organisering || (d.laeringsmomenter && d.laeringsmomenter.length) || d.link?.url)
}

function isOpen(s, d) {
  return openDrills.value.has(drillKey(s, d))
}

function toggleDrill(s, d) {
  const k = drillKey(s, d)
  const next = new Set(openDrills.value)
  next.has(k) ? next.delete(k) : next.add(k)
  openDrills.value = next
}

function dayLink(s) {
  return `/trening/${periodId.value}/okt/${s.id}`
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

function moveDrill(s, i, dir) {
  const j = dir === 'up' ? i - 1 : i + 1
  const n = (s.drills || []).length
  if (j < 0 || j >= n) return
  queueDrills(s.id, ds => {
    const arr = [...ds]
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    return arr
  })
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

function openDay(s) {
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
      <p class="uke__dates">
        {{ dateRange(period) }}
        <span v-if="hasEnded" class="uke__flag">Avsluttet</span>
        <span v-else-if="notStarted" class="uke__flag">Starter {{ relativeDateLabel(period.start_date).toLowerCase() }}</span>
      </p>

      <!-- Dagene: navn → fokus → øvelser, tre ganger. Sammenhengen ER layouten. -->
      <section v-for="s in dager" :key="s.id" class="dag" :data-accent="s.accent || 'warm'">
        <div class="dag__head">
          <router-link :to="dayLink(s)" class="dag__name">
            {{ s.title }}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </router-link>
          <span v-if="s.duration_min" class="dag__length">{{ formatDuration(s.duration_min) }}</span>
          <button type="button" class="dag__edit" :aria-label="`Rediger ${s.title}`" @click="openDay(s)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
          </button>
        </div>

        <p v-if="s.focus" class="dag__focus">{{ s.focus }}</p>
        <button v-else type="button" class="dag__focus dag__focus--empty" @click="openDay(s)">Hva er fokuset denne dagen?</button>

        <ul v-if="drillsFor(s).length" class="ovelser">
          <li v-for="(d, i) in drillsFor(s)" :key="i" class="ovelse">
            <div class="ovelse__row">
              <!-- Har øvelsen mer å si, er raden en knapp. Har den ikke det,
                   er den bare tekst — ingen falsk lovnad om noe å åpne. -->
              <component
                :is="hasDetail(d) ? 'button' : 'div'"
                :type="hasDetail(d) ? 'button' : null"
                class="ovelse__main"
                :class="{ 'ovelse__main--open': isOpen(s, d) }"
                :aria-expanded="hasDetail(d) ? String(isOpen(s, d)) : null"
                @click="hasDetail(d) && toggleDrill(s, d)"
              >
                <!-- Til venstre, ikke til høyre: her leses den som «det er mer
                     her», ikke som en fjerde knapp ved siden av × -->
                <svg v-if="hasDetail(d)" class="ovelse__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                <span v-else class="ovelse__chevron-slot" aria-hidden="true"></span>
                <span class="ovelse__text">
                  <span class="ovelse__line">
                    <span v-if="d.type && d.type !== 'none'" class="ovelse__badge" :class="`ovelse__badge--${d.type}`">
                      {{ d.type === 'diff' ? 'Diff' : 'Mix' }}
                    </span>
                    <span class="ovelse__name">{{ d.text }}</span>
                  </span>
                  <span v-if="d.tema" class="ovelse__tema">{{ d.tema }}</span>
                </span>
              </component>
              <!-- Faste kolonner: pilene forsvinner i endene av lista, men
                   plassen består — ellers vandrer × sidelengs fra rad til rad. -->
              <span class="ovelse__actions">
                <button v-if="i > 0" type="button" class="ovelse__action" aria-label="Flytt opp" @click="moveDrill(s, i, 'up')">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
                </button>
                <span v-else class="ovelse__action-slot" aria-hidden="true"></span>
                <button v-if="i < drillsFor(s).length - 1" type="button" class="ovelse__action" aria-label="Flytt ned" @click="moveDrill(s, i, 'down')">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <span v-else class="ovelse__action-slot" aria-hidden="true"></span>
                <button type="button" class="ovelse__action" aria-label="Fjern fra dagen" @click="removeDrill(s, i)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </span>
            </div>

            <!-- Utfoldet: hvordan øvelsen faktisk gjennomføres -->
            <div v-if="isOpen(s, d)" class="ovelse__detail">
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
            </div>
          </li>
        </ul>

        <button type="button" class="dag__add" @click="openPicker(s)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Legg til øvelse
        </button>
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
        <router-link to="/trening/handbok" class="uke__link">
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
  padding: var(--ds-space-md) var(--ds-space-md) var(--ds-space-sm);
  margin-bottom: var(--ds-space-md);
}

.dag__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-sm);
}

.dag__name {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-lg);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-tight);
  color: var(--ds-color-text-primary);
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
}

.dag__name svg { width: 16px; height: 16px; color: var(--ds-color-text-tertiary); flex-shrink: 0; }
.dag__name:active { opacity: 0.7; }

/* Lengden står ved dagen, ikke i et skjema du må åpne for å vite den. */
.dag__length {
  flex-shrink: 0;
  margin-left: auto;
  padding: 2px 8px;
  border-radius: var(--ds-radius-full);
  background: var(--accent-bg);
  color: var(--accent-text);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.dag__edit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  padding: 0;
  border: none;
  border-radius: var(--ds-radius-sm);
  background: transparent;
  color: var(--ds-color-text-tertiary);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.dag__edit svg { width: 15px; height: 15px; }
.dag__edit:hover { color: var(--ds-color-text-primary); }

/* Fokuset står mellom dagen og øvelsene, fordi det er nettopp det det er:
   grunnen til at akkurat disse øvelsene ligger her. */
.dag__focus {
  margin: 4px 0 var(--ds-space-md);
  font-size: var(--ds-text-sm);
  line-height: 1.5;
  color: var(--accent-text);
  font-weight: var(--ds-weight-medium);
  letter-spacing: -0.005em;
}

.dag__focus--empty {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0;
  border: none;
  background: none;
  font-family: var(--ds-font-body);
  color: var(--ds-color-text-tertiary);
  font-weight: var(--ds-weight-regular);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

/* ---- Øvelsene ---- */
.ovelser {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.ovelse {
  padding: 7px 0;
  border-top: 1px solid var(--ds-color-border-light);
  min-width: 0;
}

.ovelse__row {
  display: flex;
  align-items: flex-start;
  gap: var(--ds-space-sm);
  min-width: 0;
}

/* Raden er lesbar først, klikkbar sekundært: ingen knappedrakt, bare tekst
   som svarer når du tar på den. */
.ovelse__main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: var(--ds-space-sm);
  padding: 0;
  border: none;
  background: none;
  text-align: left;
  font: inherit;
  color: inherit;
  -webkit-tap-highlight-color: transparent;
}

/* Egen kolonne for teksten, så temaet flukter med navnet og ikke med pila */
.ovelse__text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

button.ovelse__main { cursor: pointer; }
button.ovelse__main:active .ovelse__name { opacity: 0.6; }

.ovelse__line {
  display: flex;
  align-items: baseline;
  gap: var(--ds-space-sm);
  min-width: 0;
}

/* Wrapper navnet til to linjer, skal pila stå på den FØRSTE — «center» legger
   den i sprekken mellom linjene. */
.ovelse__chevron,
.ovelse__chevron-slot {
  flex-shrink: 0;
  width: 12px;
  height: 12px;
  margin-top: 4px;
}

.ovelse__chevron {
  color: var(--ds-color-text-tertiary);
  transform: rotate(90deg);
  transform-origin: 50% 50%;
  transition: transform var(--ds-duration-fast) var(--ds-ease-out);
}

.ovelse__main--open .ovelse__chevron { transform: rotate(-90deg); }

@media (prefers-reduced-motion: reduce) {
  .ovelse__chevron { transition: none; }
}

/* Hva øvelsen handler om — står alltid, så planen kan leses uten et eneste trykk */
.ovelse__tema {
  display: block;
  font-size: var(--ds-text-xs);
  line-height: 1.4;
  color: var(--ds-color-text-secondary);
  letter-spacing: -0.005em;
}

/* ---- Utfoldet øvelse ---- */
/* Flukter med navnet over: pilas bredde (12px) + gapet (8px) */
.ovelse__detail {
  padding: var(--ds-space-sm) 0 var(--ds-space-xs) 20px;
}

.ovelse__points {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ovelse__points li {
  position: relative;
  padding-left: var(--ds-space-md);
  font-size: var(--ds-text-sm);
  line-height: 1.45;
  color: var(--ds-color-text-secondary);
  letter-spacing: -0.005em;
}

.ovelse__points li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.62em;
  width: 8px;
  height: 1px;
  background: var(--ds-color-text-tertiary);
}

.ovelse__org {
  margin: var(--ds-space-sm) 0 0;
  font-size: var(--ds-text-sm);
  line-height: 1.5;
  color: var(--ds-color-text-secondary);
  letter-spacing: -0.005em;
}

.ovelse__points + .ovelse__org { margin-top: var(--ds-space-sm); }

.ovelse__org-label {
  margin-right: 6px;
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
  margin-top: var(--ds-space-sm);
  max-width: 100%;
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-primary);
  text-decoration: underline;
  text-underline-offset: 3px;
  letter-spacing: -0.005em;
}

.ovelse__link svg { width: 14px; height: 14px; flex-shrink: 0; }

.ovelse__badge {
  flex-shrink: 0;
  font-size: 0.65rem;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: var(--ds-radius-sm);
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.ovelse__badge--diff { background: #E2EDDE; color: #3D5C44; }
.ovelse__badge--mix { background: #F8E8E0; color: #7A3A24; }
:global([data-theme="dark"] .ovelse__badge--diff) { background: #1A241D; color: #B5D2B0; }
:global([data-theme="dark"] .ovelse__badge--mix) { background: #2A1E18; color: #F4C4A8; }

.ovelse__name {
  flex: 1;
  min-width: 0;
  font-size: var(--ds-text-sm);
  line-height: 1.35;
  color: var(--ds-color-text-primary);
}

.ovelse__actions {
  display: grid;
  grid-template-columns: repeat(3, 28px);
  flex-shrink: 0;
  /* Raden kan være to linjer nå. Ikonene skal stå på navnelinja, ikke midt i
     blokka — 28px knapp mot 19px tekst gir ellers et synlig hopp nedover. */
  margin-top: -5px;
}

.ovelse__action-slot { display: block; }

.ovelse__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
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

.ovelse__action svg { width: 14px; height: 14px; }
.ovelse__action:hover, .ovelse__action:active { opacity: 1; color: var(--ds-color-text-primary); }

@media (max-width: 360px) {
  .ovelse__actions { grid-template-columns: repeat(3, 24px); }
  .ovelse__action { width: 24px; }
}

.dag__add {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  margin-top: 4px;
  padding: 10px 0 6px;
  border: none;
  border-top: 1px solid var(--ds-color-border-light);
  background: none;
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-secondary);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.dag__add svg { width: 14px; height: 14px; }
.dag__add:hover { color: var(--ds-color-text-primary); }

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

.stepper__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-md);
  background: var(--ds-color-bg-elevated);
  color: var(--ds-color-text-primary);
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-lg);
  line-height: 1;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: border-color var(--ds-duration-fast) var(--ds-ease-out);
}

.stepper__btn:disabled { opacity: 0.35; cursor: not-allowed; }
.stepper__btn:not(:disabled):active { transform: scale(0.95); }

.stepper__value {
  flex: 1;
  text-align: center;
  font-size: var(--ds-text-md);
  font-weight: var(--ds-weight-semibold);
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
