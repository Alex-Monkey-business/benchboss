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
const { sessions, fetchSessions, createSession, updateSession, removeSession } = useTrainingSessions()
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
const dager = computed(() => [...sessions.value].sort((a, b) => a.position - b.position))

function drillsFor(s) {
  return resolveDrills(s.drills, exercises.value)
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

// ── Rediger dag (navn + fokus) ──────────────────────────────────────────────
const dayForm = ref(null)
const savingDay = ref(false)

function weekdayFromTitle(title) {
  const t = (title || '').trim().toLowerCase()
  const idx = WEEKDAY_LABELS.findIndex(l => t.startsWith(l.toLowerCase()))
  return idx > -1 ? idx + 1 : null
}

function openDay(s) {
  dayForm.value = { id: s.id, title: s.title, focus: s.focus || '' }
}

async function saveDay() {
  const f = dayForm.value
  if (!f?.title.trim() || savingDay.value) return
  savingDay.value = true
  const before = sessions.value.find(s => s.id === f.id)
  await updateSession(f.id, {
    title: f.title.trim(),
    focus: f.focus.trim() || null,
    weekday: weekdayFromTitle(f.title) ?? before?.weekday ?? null
  })
  savingDay.value = false
  dayForm.value = null
}

const deleteDayId = ref(null)
async function confirmDeleteDay() {
  await removeSession(deleteDayId.value)
  deleteDayId.value = null
  dayForm.value = null
}

const addingDay = ref(false)
async function addDay() {
  if (addingDay.value) return
  addingDay.value = true
  const row = await createSession(periodId.value, {
    title: 'Ny dag',
    accent: accentForPosition(sessions.value.length),
    position: sessions.value.length
  })
  addingDay.value = false
  if (row) openDay(row)
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
          <button type="button" class="dag__edit" :aria-label="`Rediger ${s.title}`" @click="openDay(s)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
          </button>
        </div>

        <p v-if="s.focus" class="dag__focus">{{ s.focus }}</p>
        <button v-else type="button" class="dag__focus dag__focus--empty" @click="openDay(s)">Hva er fokuset denne dagen?</button>

        <ul v-if="drillsFor(s).length" class="ovelser">
          <li v-for="(d, i) in drillsFor(s)" :key="i" class="ovelse">
            <span v-if="d.type && d.type !== 'none'" class="ovelse__badge" :class="`ovelse__badge--${d.type}`">
              {{ d.type === 'diff' ? 'Diff' : 'Mix' }}
            </span>
            <span class="ovelse__name">{{ d.text }}</span>
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
          </li>
        </ul>

        <button type="button" class="dag__add" @click="openPicker(s)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Legg til øvelse
        </button>
      </section>

      <div class="uke__foot">
        <button type="button" class="uke__foot-btn" :disabled="addingDay" @click="addDay">Legg til dag</button>
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

    <!-- Rediger dag -->
    <Sheet :show="!!dayForm" :title="dayForm ? `Rediger ${dayForm.title.toLowerCase()}` : ''" @close="dayForm = null">
      <form v-if="dayForm" @submit.prevent="saveDay">
        <div class="ds-form-group">
          <label class="ds-label" for="dag-title">Dag</label>
          <input id="dag-title" v-model="dayForm.title" class="ds-input" type="text" placeholder="F.eks. Tirsdag" required />
        </div>
        <div class="ds-form-group">
          <label class="ds-label" for="dag-focus">Fokus</label>
          <textarea id="dag-focus" v-model="dayForm.focus" class="ds-input" rows="3" placeholder="Hva dagen bygger — og hva de skal sitte igjen med."></textarea>
        </div>
        <div class="sheet-actions">
          <button type="button" class="ds-btn ds-btn--ghost sheet-actions__danger" @click="deleteDayId = dayForm.id">Slett dagen</button>
          <button type="submit" class="ds-btn ds-btn--primary ds-btn--lg sheet-actions__save" :disabled="!dayForm.title.trim() || savingDay">
            {{ savingDay ? 'Lagrer…' : 'Lagre' }}
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
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
  padding: 7px 0;
  border-top: 1px solid var(--ds-color-border-light);
  min-width: 0;
}

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
