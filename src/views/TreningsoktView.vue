<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTrainingPeriods } from '../composables/useTrainingPeriods'
import { useTrainingSessions } from '../composables/useTrainingSessions'
import { useExercises, exerciseToDrill } from '../composables/useExercises'
import { useToast } from '../composables/useToast'
import Sheet from '../components/Sheet.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import ExercisePicker from '../components/ExercisePicker.vue'
import { WEEKDAY_LABELS } from '../lib/dateLabels'

const route = useRoute()
const router = useRouter()
const { getPeriod, fetchPeriods } = useTrainingPeriods()
const { sessions, loadedPeriod, fetchSessions, createSession, updateSession, removeSession } = useTrainingSessions()
const { fetchExercises, upsertFromDrill } = useExercises()
const { show: showToast } = useToast()

const ACCENTS = [
  { value: 'warm',       label: 'Varm' },
  { value: 'sage',       label: 'Salvie' },
  { value: 'cornflower', label: 'Kornblå' },
  { value: 'peach',      label: 'Fersken' },
  { value: 'sky',        label: 'Himmel' },
  { value: 'olive',      label: 'Oliven' }
]

const DRILL_TYPES = [
  { value: 'diff', label: 'Diff' },
  { value: 'mix',  label: 'Mix' },
  { value: 'none', label: '—' }
]

const ILLO_BASE = '/illustrations/bench-boss-exercise-illustrations/'
const ILLUSTRATIONS = [
  { file: 'tuesday_june_tranparent.png',    label: 'Dribleslalåm' },
  { file: 'thursday_june_transparent.png',  label: 'Ferdighetssirkel' },
  { file: 'saturday_june_transparent.png',  label: 'Smålagsspill' },
  { file: 'pass-and-move-3d.png',        label: 'Pasningsspill' },
  { file: 'dribbling-slalom-3d.png',     label: 'Dribbleslalåm' },
  { file: 'finishing-shot-3d.png',       label: 'Avslutning' },
  { file: 'rondo-possession-3d.png',     label: 'Rondo' },
  { file: 'one-vs-one-duel-3d.png',      label: '1v1 duell' },
  { file: 'small-sided-game-3v3-3d.png', label: 'Smålagsspill 3v3' }
]
function illoSrc(file) { return file ? ILLO_BASE + file.replace(/\.png$/, '.webp') : null }
function illoPng(file) { return file ? ILLO_BASE + file : null }
const heroLoaded = ref(false)

const periodId = computed(() => route.params.id)
const oktId = computed(() => route.params.oktId)
const period = computed(() => getPeriod(periodId.value))
const okt = computed(() => sessions.value.find(s => s.id === oktId.value) || null)
const drillCount = computed(() => (okt.value?.drills || []).length)

// ---- Rediger økt ----
const showSheet = ref(false)
const form = ref(emptyForm())
const saving = ref(false)

function emptyDrill() {
  return { type: 'diff', text: '', tema: '', organisering: '', laeringsmomenter: '', link: { label: '', url: '' } }
}

function emptyForm() {
  return { title: '', accent: 'warm', illustration: '', focus: '', weekday: null, drills: [emptyDrill()] }
}

// Auto-foreslå ukedag når tittelen er et ukedagsnavn og ingen er valgt.
function suggestWeekdayFromTitle() {
  if (form.value.weekday) return
  const t = form.value.title.trim().toLowerCase()
  const idx = WEEKDAY_LABELS.findIndex(label => t.startsWith(label.toLowerCase()))
  if (idx > -1) form.value.weekday = idx + 1
}

function openEdit() {
  const s = okt.value
  const drills = (s.drills || []).map(d => ({
    type: d.type || 'none',
    text: d.text || '',
    tema: d.tema || '',
    organisering: d.organisering || '',
    laeringsmomenter: (d.laeringsmomenter || []).join('\n'),
    link: d.link ? { label: d.link.label || '', url: d.link.url || '' } : { label: '', url: '' },
    exercise_id: d.exercise_id || null
  }))
  form.value = {
    title: s.title,
    accent: s.accent || 'warm',
    illustration: s.illustration || '',
    focus: s.focus || '',
    weekday: s.weekday ?? null,
    drills: drills.length ? drills : [emptyDrill()]
  }
  showSheet.value = true
}

function addDrill() { form.value.drills.push(emptyDrill()) }
function removeDrill(i) { form.value.drills.splice(i, 1) }

async function save() {
  if (!form.value.title.trim() || saving.value) return
  saving.value = true
  const drills = form.value.drills
    .map(d => ({
      type: d.type,
      text: d.text.trim(),
      tema: d.tema.trim() || null,
      organisering: d.organisering.trim() || null,
      laeringsmomenter: d.laeringsmomenter.split('\n').map(s => s.trim()).filter(Boolean),
      link: d.link.url.trim() ? { label: d.link.label.trim(), url: d.link.url.trim() } : null,
      exercise_id: d.exercise_id || null
    }))
    .filter(d => d.text || d.link || d.tema || d.organisering || d.laeringsmomenter.length)
  // Nye øvelser (uten bank-opphav) fanges automatisk i øvelsesbanken.
  for (const d of drills) {
    if (!d.exercise_id) {
      const ex = await upsertFromDrill(d)
      if (ex) d.exercise_id = ex.id
    }
  }
  await updateSession(oktId.value, {
    title: form.value.title.trim(),
    accent: form.value.accent,
    illustration: form.value.illustration || null,
    focus: form.value.focus.trim() || null,
    weekday: form.value.weekday,
    drills
  })
  saving.value = false
  showSheet.value = false
}

// ---- Direkte manipulering av øvelser (uten redigeringssheeten) ----
// Serialisert kø: hver mutasjon regner alltid fra sist lagrede drills-state,
// så raske legg-til/fjern aldri overskriver hverandre.
let drillQueue = Promise.resolve()
function queueDrills(mutate) {
  drillQueue = drillQueue.then(() =>
    updateSession(oktId.value, { drills: mutate([...(okt.value?.drills || [])]) })
  )
  return drillQueue
}

const showPicker = ref(false)

function drillMatchesExercise(d, ex) {
  return d.exercise_id === ex.id || (d.text || '').trim().toLowerCase() === ex.name.trim().toLowerCase()
}

// Toggle fra plukkeren: på = legg til, av = ta ut av økta.
// Å ta ut sletter ingenting — øvelsen ligger fortsatt i banken.
function toggleExercise(ex) {
  const inSession = (okt.value?.drills || []).some(d => drillMatchesExercise(d, ex))
  queueDrills(ds => inSession
    ? ds.filter(d => !drillMatchesExercise(d, ex))
    : [...ds, exerciseToDrill(ex)]
  )
}

// Fjern fra økta (×) — friksjonsfritt, ingen dialog: dette er ikke sletting.
function removeDrillFromSession(i) {
  const d = okt.value?.drills?.[i]
  if (!d) return
  queueDrills(ds => ds.filter((_, idx) => idx !== i))
  showToast(d.exercise_id ? 'Fjernet — ligger i banken' : 'Fjernet', 'success')
}

// ---- Dupliser økt ----
const duplicating = ref(false)
async function duplicateOkt() {
  if (duplicating.value) return
  duplicating.value = true
  const s = okt.value
  const row = await createSession(periodId.value, {
    title: `${s.title} (kopi)`,
    weekday: s.weekday ?? null,
    accent: s.accent || 'warm',
    illustration: s.illustration || null,
    focus: s.focus || null,
    drills: s.drills || [],
    position: sessions.value.length
  })
  duplicating.value = false
  if (row) router.push(`/trening/${periodId.value}/okt/${row.id}`)
}

// ---- Slett økt ----
const showDelete = ref(false)
async function confirmDelete() {
  await removeSession(oktId.value)
  showDelete.value = false
  router.push(`/trening/${periodId.value}`)
}

onMounted(async () => {
  if (!period.value) await fetchPeriods()
  if (loadedPeriod.value !== periodId.value || !sessions.value.length) {
    await fetchSessions(periodId.value)
  }
  fetchExercises() // banken — for bokmerke-dedupe og rask picker (loaded-guard i composablen)
})
</script>

<template>
  <div v-if="okt" class="okt-view" :data-accent="okt.accent || 'warm'">
    <div class="okt-view__nav">
      <router-link :to="`/trening/${periodId}`" class="okt-view__back">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Tilbake
      </router-link>
      <div class="okt-view__nav-actions">
        <button type="button" class="okt-view__icon-btn" aria-label="Rediger økt" @click="openEdit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
        </button>
        <button type="button" class="okt-view__icon-btn" aria-label="Dupliser økt" :disabled="duplicating" @click="duplicateOkt">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
        <button type="button" class="okt-view__icon-btn okt-view__icon-btn--danger" aria-label="Slett økt" @click="showDelete = true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>

    <!-- Farget kapittel-panel -->
    <div class="chapter">
    <div class="chapter__hero" :class="{ 'chapter__hero--bare': !okt.illustration }">
      <picture v-if="okt.illustration">
        <source :srcset="illoSrc(okt.illustration)" type="image/webp" />
        <img
          :src="illoPng(okt.illustration)"
          :alt="okt.title"
          class="chapter__img"
          :class="{ 'is-loaded': heroLoaded }"
          decoding="async"
          fetchpriority="high"
          @load="heroLoaded = true"
        />
      </picture>
      <div v-if="okt.illustration" class="chapter__scrim"></div>
      <header class="hero">
        <h1 class="hero__title">{{ okt.title }}</h1>
        <p v-if="okt.focus" class="hero__focus">{{ okt.focus }}</p>
      </header>
    </div>
    <div class="chapter__body">

    <!-- Øvelser -->
    <div v-if="drillCount" class="drills">
      <div v-for="(d, di) in okt.drills" :key="di" class="drill">
        <div class="drill__head">
          <span
            v-if="d.type && d.type !== 'none'"
            class="drill__badge"
            :class="`drill__badge--${d.type}`"
          >{{ d.type === 'diff' ? 'Diff' : 'Mix' }}</span>
          <h3 class="drill__name">{{ d.text }}</h3>
          <div class="drill__actions">
            <button type="button" class="drill__action" aria-label="Fjern fra økta" title="Fjern fra økta" @click="removeDrillFromSession(di)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
        <p v-if="d.tema" class="drill__focus">{{ d.tema }}</p>

        <ul v-if="d.laeringsmomenter && d.laeringsmomenter.length" class="drill__points">
          <li v-for="(p, pi) in d.laeringsmomenter" :key="pi">{{ p }}</li>
        </ul>

        <p v-if="d.organisering" class="drill__org"><span class="drill__org-label">Oppsett</span>{{ d.organisering }}</p>

        <a
          v-if="d.link && d.link.url"
          :href="d.link.url"
          target="_blank"
          rel="noopener"
          class="drill__link"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          {{ d.link.label || d.link.url }}
        </a>
      </div>
    </div>

    <div v-else class="okt-view__empty">
      <p>Ingen øvelser ennå.</p>
      <div class="okt-view__empty-actions">
        <button type="button" class="ds-btn ds-btn--primary" @click="showPicker = true">Velg øvelser</button>
        <button type="button" class="ds-btn ds-btn--secondary" @click="openEdit">Skriv selv</button>
      </div>
    </div>

    <button v-if="drillCount" type="button" class="drill-add" @click="showPicker = true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Velg øvelser
    </button>
    </div>
    </div>

    <!-- Rediger økt -->
    <Sheet :show="showSheet" title="Rediger økt" @close="showSheet = false">
      <form @submit.prevent="save">
        <div class="ds-form-group">
          <label class="ds-label" for="okt-title">Dag / tittel</label>
          <input id="okt-title" v-model="form.title" class="ds-input" type="text" placeholder="F.eks. Tirsdag" required @blur="suggestWeekdayFromTitle" />
        </div>
        <div class="ds-form-group">
          <label class="ds-label">Ukedag</label>
          <div class="weekday-picker">
            <button
              v-for="(label, i) in WEEKDAY_LABELS"
              :key="label"
              type="button"
              :class="['weekday-pill', { 'weekday-pill--active': form.weekday === i + 1 }]"
              :aria-pressed="form.weekday === i + 1"
              @click="form.weekday = form.weekday === i + 1 ? null : i + 1"
            >
              {{ label.slice(0, 3) }}
            </button>
          </div>
        </div>
        <div class="ds-form-group">
          <label class="ds-label">Farge</label>
          <div class="accent-picker">
            <button
              v-for="a in ACCENTS"
              :key="a.value"
              type="button"
              :data-accent="a.value"
              :class="['accent-swatch', { 'accent-swatch--active': form.accent === a.value }]"
              :aria-label="a.label"
              :title="a.label"
              @click="form.accent = a.value"
            />
          </div>
        </div>
        <div class="ds-form-group">
          <label class="ds-label">Illustrasjon</label>
          <div class="illo-picker">
            <button type="button" :class="['illo-opt', 'illo-opt--none', { 'illo-opt--active': !form.illustration }]" @click="form.illustration = ''">
              Ingen
            </button>
            <button
              v-for="il in ILLUSTRATIONS"
              :key="il.file"
              type="button"
              :class="['illo-opt', { 'illo-opt--active': form.illustration === il.file }]"
              :title="il.label"
              :aria-label="il.label"
              @click="form.illustration = il.file"
            >
              <img :src="illoSrc(il.file)" :alt="il.label" loading="lazy" decoding="async" />
            </button>
          </div>
        </div>
        <div class="ds-form-group">
          <label class="ds-label" for="okt-focus">Fokusområde</label>
          <textarea id="okt-focus" v-model="form.focus" class="ds-input" rows="3" placeholder="Hva økta bygger — fokus, hvorfor, hva de skal sitte igjen med."></textarea>
        </div>
        <div class="ds-form-group">
          <label class="ds-label">Øvelser</label>
          <div v-for="(d, i) in form.drills" :key="i" class="drill-edit">
            <div class="drill-edit__head">
              <div class="type-toggle" role="radiogroup" aria-label="Type øvelse">
                <button
                  v-for="t in DRILL_TYPES"
                  :key="t.value"
                  type="button"
                  role="radio"
                  :aria-checked="d.type === t.value"
                  :class="['type-toggle__opt', `type-toggle__opt--${t.value}`, { 'type-toggle__opt--active': d.type === t.value }]"
                  @click="d.type = t.value"
                >{{ t.label }}</button>
              </div>
              <button type="button" class="link-row__remove" aria-label="Fjern øvelse" @click="removeDrill(i)">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <textarea v-model="d.text" class="ds-input" rows="2" placeholder="Navn på øvelsen"></textarea>
            <input v-model="d.tema" class="ds-input" type="text" placeholder="Fokus (valgfri) — f.eks. Spille oss fremover" />
            <span class="drill-edit__sublabel">Øver på — ett per linje (valgfri)</span>
            <textarea v-model="d.laeringsmomenter" class="ds-input" rows="3" placeholder="Mykt medtak ut til siden&#10;Løft blikket, finn timing på finta"></textarea>
            <span class="drill-edit__sublabel">Oppsett (valgfri)</span>
            <textarea v-model="d.organisering" class="ds-input" rows="3" placeholder="Hvordan øvelsen settes opp og kjøres."></textarea>
            <div class="link-row">
              <input v-model="d.link.label" class="ds-input" type="text" placeholder="Lenketekst (valgfri)" />
              <input v-model="d.link.url" class="ds-input" type="url" placeholder="https://… (valgfri)" />
            </div>
          </div>
          <button type="button" class="ds-btn ds-btn--ghost ds-btn--sm" @click="addDrill">+ Øvelse</button>
        </div>
        <button type="submit" class="ds-btn ds-btn--primary ds-btn--lg" :disabled="!form.title.trim() || saving" style="width: 100%; margin-top: var(--ds-space-sm);">
          {{ saving ? 'Lagrer…' : 'Lagre endringer' }}
        </button>
      </form>
    </Sheet>

    <ConfirmDialog
      :show="showDelete"
      title="Slett økt?"
      :message="`«${okt.title}» blir borte for godt.`"
      confirm-label="Slett"
      variant="warning"
      @confirm="confirmDelete"
      @cancel="showDelete = false"
    />

    <ExercisePicker
      :show="showPicker"
      :current-drills="okt.drills || []"
      @close="showPicker = false"
      @toggle="toggleExercise"
    />
  </div>
</template>

<style scoped>
.okt-view[data-accent="warm"],       .accent-swatch[data-accent="warm"]       { --accent-bg: #F8E8E0; --accent-text: #7A3A24; }
.okt-view[data-accent="sage"],       .accent-swatch[data-accent="sage"]       { --accent-bg: #E2EDDE; --accent-text: #3D5C44; }
.okt-view[data-accent="cornflower"], .accent-swatch[data-accent="cornflower"] { --accent-bg: #D6DDEF; --accent-text: #3D456B; }
.okt-view[data-accent="peach"],      .accent-swatch[data-accent="peach"]      { --accent-bg: #F8E8E0; --accent-text: #7A3A24; }
.okt-view[data-accent="sky"],        .accent-swatch[data-accent="sky"]        { --accent-bg: #DDE6EC; --accent-text: #3A4C5C; }
.okt-view[data-accent="olive"],      .accent-swatch[data-accent="olive"]      { --accent-bg: #F0E7D6; --accent-text: #6B5630; }

:global([data-theme="dark"] .okt-view[data-accent="warm"]),       :global([data-theme="dark"] .accent-swatch[data-accent="warm"]) { --accent-bg: #2A1E18; --accent-text: #F4C4A8; }
:global([data-theme="dark"] .okt-view[data-accent="sage"]),       :global([data-theme="dark"] .accent-swatch[data-accent="sage"]) { --accent-bg: #1A241D; --accent-text: #B5D2B0; }
:global([data-theme="dark"] .okt-view[data-accent="cornflower"]), :global([data-theme="dark"] .accent-swatch[data-accent="cornflower"]) { --accent-bg: #1A1F33; --accent-text: #B9C2E5; }
:global([data-theme="dark"] .okt-view[data-accent="peach"]),      :global([data-theme="dark"] .accent-swatch[data-accent="peach"]) { --accent-bg: #2A1E18; --accent-text: #F4C4A8; }
:global([data-theme="dark"] .okt-view[data-accent="sky"]),        :global([data-theme="dark"] .accent-swatch[data-accent="sky"]) { --accent-bg: #1A222A; --accent-text: #B0C5D8; }
:global([data-theme="dark"] .okt-view[data-accent="olive"]),      :global([data-theme="dark"] .accent-swatch[data-accent="olive"]) { --accent-bg: #2A241A; --accent-text: #D9C99E; }

/* Dyp, kinematisk header-palett (VG-aktig) — lik i lyst og mørkt tema */
.okt-view[data-accent="warm"]       { --hero-bg: #4A1E14; --hero-accent: #E5A488; --hero-fg: #F6EAE3; }
.okt-view[data-accent="sage"]       { --hero-bg: #233528; --hero-accent: #9CC49A; --hero-fg: #EAF1E7; }
.okt-view[data-accent="cornflower"] { --hero-bg: #232A4A; --hero-accent: #A6B2E4; --hero-fg: #E9ECF6; }
.okt-view[data-accent="peach"]      { --hero-bg: #5A241C; --hero-accent: #F0AE97; --hero-fg: #F8ECE6; }
.okt-view[data-accent="sky"]        { --hero-bg: #1F2E3C; --hero-accent: #9FC2D8; --hero-fg: #E9F1F6; }
.okt-view[data-accent="olive"]      { --hero-bg: #3E331C; --hero-accent: #D8C189; --hero-fg: #F3EDDE; }

.okt-view {
  max-width: 640px;
  margin: 0 auto;
  padding: var(--ds-space-md) var(--ds-space-lg) var(--ds-space-2xl);
}

/* Farget kapittel-panel som svever på vanlig bakgrunn */
.chapter {
  background: var(--hero-bg);
  border-radius: var(--ds-radius-lg);
  box-shadow: var(--ds-shadow-md);
  overflow: hidden;
}

/* Bildet fyller toppen og toner ut i panelfargen (VG-scrim) */
.chapter__hero {
  position: relative;
  min-height: 60vh;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: var(--ds-space-xl);
}

/* Uten illustrasjon: kompakt panel — 60vh tom farge lover innhold som ikke finnes. */
.chapter__hero--bare {
  min-height: 0;
  padding-top: var(--ds-space-2xl);
}

.chapter__img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center top;
  opacity: 0;
  transition: opacity 350ms var(--ds-ease-out);
}

.chapter__img.is-loaded { opacity: 1; }

@media (prefers-reduced-motion: reduce) {
  .chapter__img { transition: none; }
}

.chapter__scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0) 50%, var(--hero-bg) 88%);
}

.chapter__body {
  padding: var(--ds-space-xl) var(--ds-space-xl) var(--ds-space-2xl);
}

.okt-view__nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--ds-space-lg);
}

.okt-view__back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-secondary);
  text-decoration: none;
  letter-spacing: -0.005em;
  min-width: 0;
}

.okt-view__back svg { width: 14px; height: 14px; flex-shrink: 0; }
.okt-view__back:hover { color: var(--ds-color-text-primary); }

.okt-view__nav-actions { display: flex; gap: var(--ds-space-sm); flex-shrink: 0; }

.okt-view__icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: var(--ds-radius-md);
  border: 1px solid var(--ds-color-border);
  background: var(--ds-color-bg-elevated);
  color: var(--ds-color-text-secondary);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: border-color var(--ds-duration-fast) var(--ds-ease-out), color var(--ds-duration-fast) var(--ds-ease-out);
}

.okt-view__icon-btn svg { width: 16px; height: 16px; }
.okt-view__icon-btn:hover { border-color: var(--ds-color-border-strong); color: var(--ds-color-text-primary); }
.okt-view__icon-btn--danger:hover { color: var(--ds-color-error); border-color: var(--ds-color-error); }

/* ---- Header (over bildet, nederst i hero-sonen) ---- */
.hero {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.hero__eyebrow {
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-wider);
  text-transform: uppercase;
  color: var(--hero-accent);
}

.hero__title {
  font-family: var(--ds-font-display-sans);
  font-size: clamp(3rem, 13vw, 4.6rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 0.92;
  text-transform: uppercase;
  color: var(--hero-fg);
  margin: 4px 0 0;
}

.hero__focus {
  font-family: var(--ds-font-display);
  font-size: var(--ds-text-lg);
  font-weight: var(--ds-weight-regular);
  line-height: 1.45;
  letter-spacing: -0.01em;
  color: var(--hero-fg);
  margin: var(--ds-space-md) 0 0;
  max-width: 42ch;
}

.hero__meta {
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-wider);
  text-transform: uppercase;
  color: var(--hero-accent);
  margin-top: var(--ds-space-md);
}

/* ---- Øvelser ---- */
.drills {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.drill {
  padding: var(--ds-space-lg) 0;
  border-top: 1px solid rgba(255, 255, 255, 0.14);
}

.drill:first-child { padding-top: 0; border-top: 0; }

/* Scanne-linja: badge + navn */
.drill__head {
  display: flex;
  align-items: baseline;
  gap: var(--ds-space-sm);
}

.drill__badge {
  flex-shrink: 0;
  padding: 2px 9px;
  border-radius: var(--ds-radius-sm);
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-wider);
  text-transform: uppercase;
}

.drill__badge--diff { background: #E2EDDE; color: #3D5C44; }
.drill__badge--mix  { background: #F8E8E0; color: #7A3A24; }

:global([data-theme="dark"] .drill__badge--diff) { background: #1A241D; color: #B5D2B0; }
:global([data-theme="dark"] .drill__badge--mix) { background: #2A1E18; color: #F4C4A8; }

.drill__name {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-lg);
  font-weight: var(--ds-weight-semibold);
  line-height: 1.25;
  letter-spacing: -0.01em;
  color: var(--hero-fg);
}

/* Stille handlinger per øvelse — skal ikke kjempe mot panelet */
.drill__actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
  align-self: flex-start;
}

.drill__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  border-radius: var(--ds-radius-sm);
  background: transparent;
  color: var(--hero-fg);
  opacity: 0.4;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: opacity var(--ds-duration-fast) var(--ds-ease-out);
}

.drill__action svg { width: 15px; height: 15px; }
.drill__action:hover, .drill__action:active { opacity: 0.9; }

/* Legg-til-rad nederst i panelet */
.drill-add {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  margin-top: var(--ds-space-md);
  padding: 12px;
  background: transparent;
  border: 1px dashed rgba(255, 255, 255, 0.3);
  border-radius: var(--ds-radius-md);
  color: var(--hero-fg);
  opacity: 0.75;
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-sm);
  font-weight: 500;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: opacity var(--ds-duration-fast) var(--ds-ease-out), border-color var(--ds-duration-fast) var(--ds-ease-out);
}

.drill-add svg { width: 15px; height: 15px; }
.drill-add:hover, .drill-add:active { opacity: 1; border-color: rgba(255, 255, 255, 0.55); }

.okt-view__empty-actions {
  display: flex;
  gap: var(--ds-space-sm);
  justify-content: center;
}

/* Fokus — det vi øver på, fremhevet i aksent */
.drill__focus {
  margin: 6px 0 0;
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-md);
  font-weight: var(--ds-weight-medium);
  color: var(--hero-accent);
  letter-spacing: -0.005em;
}

/* Detalj — dempet, sekundært */
.drill__points {
  list-style: none;
  padding: 0;
  margin: var(--ds-space-md) 0 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.drill__points li {
  position: relative;
  padding-left: var(--ds-space-md);
  font-size: var(--ds-text-sm);
  line-height: 1.45;
  color: var(--hero-fg);
  opacity: 0.8;
  letter-spacing: -0.005em;
}

.drill__points li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.62em;
  width: 8px;
  height: 1px;
  background: var(--hero-accent);
  opacity: 0.7;
}

.drill__org {
  margin: var(--ds-space-md) 0 0;
  font-size: var(--ds-text-sm);
  line-height: 1.5;
  color: var(--hero-fg);
  opacity: 0.72;
  letter-spacing: -0.005em;
}

.drill__org-label {
  margin-right: 6px;
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-wider);
  text-transform: uppercase;
  color: var(--hero-accent);
}

.drill__link {
  display: inline-flex;
  align-items: center;
  gap: var(--ds-space-sm);
  margin-top: var(--ds-space-md);
  max-width: 100%;
  padding: 7px var(--ds-space-md);
  background: var(--accent-bg);
  color: var(--accent-text);
  border-radius: var(--ds-radius-md);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  text-decoration: none;
  letter-spacing: -0.005em;
  transition: transform var(--ds-duration-fast) var(--ds-ease-out);
}

.drill__link svg { width: 15px; height: 15px; flex-shrink: 0; }
.drill__link:active { transform: scale(0.98); }

.drill-edit__sublabel {
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-tertiary);
  letter-spacing: -0.005em;
}

/* ---- Illustrasjonsvelger ---- */
.illo-picker {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--ds-space-sm);
}

.illo-opt {
  aspect-ratio: 1;
  border: 2px solid var(--ds-color-border);
  border-radius: var(--ds-radius-md);
  overflow: hidden;
  cursor: pointer;
  background: var(--ds-color-bg-subtle);
  padding: 0;
  -webkit-tap-highlight-color: transparent;
  transition: border-color var(--ds-duration-fast) var(--ds-ease-out);
}

.illo-opt img { width: 100%; height: 100%; object-fit: cover; display: block; }

.illo-opt--none {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-tertiary);
}

.illo-opt--active { border-color: var(--ds-color-accent); }

.okt-view__empty {
  text-align: center;
  padding: var(--ds-space-2xl) 0;
  color: var(--hero-fg);
  opacity: 0.8;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ds-space-md);
}

/* Global p-farge er mørk grå — usynlig på det alltid-mørke panelet. */
.okt-view__empty p {
  color: inherit;
  margin: 0;
}

/* ---- Øvelse-editor i skjema ---- */
.drill-edit {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
  padding: var(--ds-space-md);
  margin-bottom: var(--ds-space-sm);
  background: var(--ds-color-bg-subtle);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-md);
}

.drill-edit__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-sm);
}

.type-toggle {
  display: inline-flex;
  padding: 3px;
  background: var(--ds-color-bg-elevated);
  border-radius: var(--ds-radius-sm);
  gap: 2px;
}

.type-toggle__opt {
  appearance: none;
  border: 0;
  background: transparent;
  padding: 5px 12px;
  border-radius: calc(var(--ds-radius-sm) - 2px);
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-secondary);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color var(--ds-duration-fast) var(--ds-ease-out), color var(--ds-duration-fast) var(--ds-ease-out);
}

.type-toggle__opt:active { transform: scale(0.96); }
.type-toggle__opt--active { font-weight: var(--ds-weight-semibold); box-shadow: var(--ds-shadow-xs); }
.type-toggle__opt--diff.type-toggle__opt--active { background: #E2EDDE; color: #3D5C44; }
.type-toggle__opt--mix.type-toggle__opt--active  { background: #F8E8E0; color: #7A3A24; }
.type-toggle__opt--none.type-toggle__opt--active { background: var(--ds-color-bg-subtle); color: var(--ds-color-text-primary); }

:global([data-theme="dark"] .type-toggle__opt--diff.type-toggle__opt--active) { background: #1A241D; color: #B5D2B0; }
:global([data-theme="dark"] .type-toggle__opt--mix.type-toggle__opt--active) { background: #2A1E18; color: #F4C4A8; }

.link-row {
  display: flex;
  gap: var(--ds-space-sm);
  align-items: center;
}

.link-row .ds-input:first-child { flex: 0 0 38%; }
.link-row .ds-input:nth-child(2) { flex: 1; min-width: 0; }

.link-row__remove {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--ds-radius-md);
  border: 1px solid var(--ds-color-border);
  background: transparent;
  color: var(--ds-color-text-tertiary);
  cursor: pointer;
}

.link-row__remove:hover { color: var(--ds-color-error); border-color: var(--ds-color-error); }

/* ---- Accent-velger ---- */
.accent-picker { display: flex; gap: var(--ds-space-sm); flex-wrap: wrap; }

.weekday-picker { display: flex; gap: 6px; flex-wrap: wrap; }

.weekday-pill {
  padding: 7px 10px;
  border-radius: var(--ds-radius-full);
  border: 1px solid var(--ds-color-border);
  background: var(--ds-color-surface);
  color: var(--ds-color-text-secondary);
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-medium);
  cursor: pointer;
  transition:
    background var(--ds-duration-fast) var(--ds-ease-out),
    color var(--ds-duration-fast) var(--ds-ease-out),
    border-color var(--ds-duration-fast) var(--ds-ease-out);
}

.weekday-pill--active {
  background: var(--ds-color-accent);
  border-color: var(--ds-color-accent);
  color: var(--ds-color-accent-text);
}

.accent-swatch {
  width: 36px;
  height: 36px;
  border-radius: var(--ds-radius-md);
  background: var(--accent-bg);
  border: 2px solid transparent;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: transform var(--ds-duration-fast) var(--ds-ease-out), border-color var(--ds-duration-fast) var(--ds-ease-out);
}

.accent-swatch:active { transform: scale(0.94); }
.accent-swatch--active { border-color: var(--accent-text); }
</style>
