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
import ExerciseFields from '../components/ExerciseFields.vue'
import { sessionIllustration, illoWebp, illoPng } from '../lib/sessionVisuals'
import { WEEKDAY_LABELS } from '../lib/dateLabels'

const route = useRoute()
const router = useRouter()
const { getPeriod, fetchPeriods } = useTrainingPeriods()
const { sessions, loadedPeriod, fetchSessions, updateSession, removeSession } = useTrainingSessions()
const { fetchExercises, createExercise, upsertFromDrill } = useExercises()
const { show: showToast } = useToast()

const heroLoaded = ref(false)

const periodId = computed(() => route.params.id)
const oktId = computed(() => route.params.oktId)
const period = computed(() => getPeriod(periodId.value))
const okt = computed(() => sessions.value.find(s => s.id === oktId.value) || null)
const drillCount = computed(() => (okt.value?.drills || []).length)

// Bildet velges av ukedagen, ikke av deg — se lib/sessionVisuals.
const heroIllo = computed(() => sessionIllustration(okt.value))

// ---- Rediger økt: dag og fokus. Ikke noe annet. ----
//
// Her lå det før farge, illustrasjon, ukedagspiller og alle øvelsene i samme
// skjema — 20+ felt for å rette en skrivefeil. Fargen følger posisjonen,
// bildet følger ukedagen, ukedagen følger tittelen, og øvelsene redigeres
// én og én ved å trykke på dem.
const showSheet = ref(false)
const form = ref({ title: '', focus: '' })
const saving = ref(false)

// Ukedagen ligger i tittelen. «Tirsdag» er et svar, ikke et spørsmål.
function weekdayFromTitle(title) {
  const t = (title || '').trim().toLowerCase()
  const idx = WEEKDAY_LABELS.findIndex(label => t.startsWith(label.toLowerCase()))
  return idx > -1 ? idx + 1 : null
}

function openEdit() {
  form.value = { title: okt.value.title, focus: okt.value.focus || '' }
  showSheet.value = true
}

async function save() {
  if (!form.value.title.trim() || saving.value) return
  saving.value = true
  const title = form.value.title.trim()
  await updateSession(oktId.value, {
    title,
    focus: form.value.focus.trim() || null,
    // Fant vi ingen ukedag i tittelen, står den gamle — en økt som het
    // «Tirsdag» og døpes om til «Ekstraøkt» skal ikke miste dagen sin.
    weekday: weekdayFromTitle(title) ?? okt.value.weekday ?? null
  })
  saving.value = false
  showSheet.value = false
}

// ---- Øvelser ----
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

// Fant du ikke øvelsen i banken, lager søket den. Ingen egen «skriv selv»-vei
// inn — én knapp legger til øvelser, uansett om de finnes fra før.
async function createFromSearch(name) {
  const row = await createExercise({
    name: name.trim(),
    type: 'none',
    category: null,
    tema: null,
    organisering: null,
    laeringsmomenter: [],
    link: null
  })
  if (row) {
    await queueDrills(ds => [...ds, exerciseToDrill(row)])
    showToast(`«${row.name}» lagt til`, 'success')
  }
}

// ---- Én øvelse om gangen ----
const showDrill = ref(false)
const drillIndex = ref(-1)
const drillForm = ref(emptyDrillForm())
const savingDrill = ref(false)

function emptyDrillForm() {
  return { name: '', type: 'none', category: '', tema: '', organisering: '', laeringsmomenter: '', link: { label: '', url: '' } }
}

function openDrill(i) {
  const d = okt.value.drills[i]
  drillIndex.value = i
  drillForm.value = {
    name: d.text || '',
    type: d.type || 'none',
    category: '',
    tema: d.tema || '',
    organisering: d.organisering || '',
    laeringsmomenter: (d.laeringsmomenter || []).join('\n'),
    link: d.link ? { label: d.link.label || '', url: d.link.url || '' } : { label: '', url: '' },
    exercise_id: d.exercise_id || null
  }
  showDrill.value = true
}

async function saveDrill() {
  const f = drillForm.value
  if (!f.name.trim() || savingDrill.value) return
  savingDrill.value = true
  const drill = {
    type: f.type,
    text: f.name.trim(),
    tema: f.tema.trim() || null,
    organisering: f.organisering.trim() || null,
    laeringsmomenter: f.laeringsmomenter.split('\n').map(s => s.trim()).filter(Boolean),
    link: f.link.url.trim() ? { label: f.link.label.trim(), url: f.link.url.trim() } : null,
    exercise_id: f.exercise_id || null
  }
  // Alle øvelser lever i banken — en ny fanges automatisk der.
  if (!drill.exercise_id) {
    const ex = await upsertFromDrill(drill)
    if (ex) drill.exercise_id = ex.id
  }
  const i = drillIndex.value
  await queueDrills(ds => ds.map((d, idx) => (idx === i ? drill : d)))
  savingDrill.value = false
  showDrill.value = false
}

// Fjerne fra økta er ikke sletting: øvelsen blir liggende i banken.
function removeDrillFromSession() {
  const i = drillIndex.value
  const d = okt.value?.drills?.[i]
  showDrill.value = false
  if (!d) return
  queueDrills(ds => ds.filter((_, idx) => idx !== i))
  showToast(d.exercise_id ? 'Fjernet — ligger i banken' : 'Fjernet', 'success')
}

// Ekte tilbake: dit du kom fra (Hjem, perioden, banken …). Perioden er
// bare fallback ved direkte-lenke uten historikk.
function goBack() {
  if (window.history.state?.back) router.back()
  else router.push(`/trening/${periodId.value}`)
}

// ---- Slett økt (fra redigeringen — ikke som ikon ved siden av den) ----
const showDelete = ref(false)
async function confirmDelete() {
  await removeSession(oktId.value)
  showDelete.value = false
  showSheet.value = false
  router.push(`/trening/${periodId.value}`)
}

onMounted(async () => {
  if (!period.value) await fetchPeriods()
  if (loadedPeriod.value !== periodId.value || !sessions.value.length) {
    await fetchSessions(periodId.value)
  }
  fetchExercises() // banken — for dedupe og rask plukker (loaded-guard i composablen)
})
</script>

<template>
  <div v-if="okt" class="okt-view" :data-accent="okt.accent || 'warm'">
    <div class="okt-view__nav">
      <button type="button" class="okt-view__back" @click="goBack">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Tilbake
      </button>
      <button type="button" class="okt-view__icon-btn" aria-label="Rediger økt" @click="openEdit">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
      </button>
    </div>

    <!-- Farget kapittel-panel -->
    <div class="chapter">
    <div class="chapter__hero" :class="{ 'chapter__hero--bare': !heroIllo }">
      <picture v-if="heroIllo">
        <source :srcset="illoWebp(heroIllo)" type="image/webp" />
        <img
          :src="illoPng(heroIllo)"
          :alt="okt.title"
          class="chapter__img"
          :class="{ 'is-loaded': heroLoaded }"
          decoding="async"
          fetchpriority="high"
          @load="heroLoaded = true"
        />
      </picture>
      <div v-if="heroIllo" class="chapter__scrim"></div>
      <header class="hero">
        <h1 class="hero__title">{{ okt.title }}</h1>
        <p v-if="okt.focus" class="hero__focus">{{ okt.focus }}</p>
      </header>
    </div>
    <div class="chapter__body">

    <!-- Øvelser: trykk på én for å redigere den alene -->
    <div v-if="drillCount" class="drills">
      <div
        v-for="(d, di) in okt.drills"
        :key="di"
        class="drill"
        role="button"
        tabindex="0"
        @click="openDrill(di)"
        @keydown.enter.prevent="openDrill(di)"
        @keydown.space.prevent="openDrill(di)"
      >
        <div class="drill__head">
          <span
            v-if="d.type && d.type !== 'none'"
            class="drill__badge"
            :class="`drill__badge--${d.type}`"
          >{{ d.type === 'diff' ? 'Diff' : 'Mix' }}</span>
          <h3 class="drill__name">{{ d.text }}</h3>
          <svg class="drill__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
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
          @click.stop
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          {{ d.link.label || d.link.url }}
        </a>
      </div>
    </div>

    <div v-else class="okt-view__empty">
      <p>Ingen øvelser ennå.</p>
      <button type="button" class="ds-btn ds-btn--primary" @click="showPicker = true">Legg til øvelse</button>
    </div>

    <button v-if="drillCount" type="button" class="drill-add" @click="showPicker = true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Legg til øvelse
    </button>
    </div>
    </div>

    <!-- Rediger økt: dag og fokus -->
    <Sheet :show="showSheet" title="Rediger økt" @close="showSheet = false">
      <form @submit.prevent="save">
        <div class="ds-form-group">
          <label class="ds-label" for="okt-title">Dag</label>
          <input id="okt-title" v-model="form.title" class="ds-input" type="text" placeholder="F.eks. Tirsdag" required />
        </div>
        <div class="ds-form-group">
          <label class="ds-label" for="okt-focus">Fokusområde</label>
          <textarea id="okt-focus" v-model="form.focus" class="ds-input" rows="3" placeholder="Hva økta bygger — fokus, hvorfor, hva de skal sitte igjen med."></textarea>
        </div>
        <div class="sheet-actions">
          <button type="button" class="ds-btn ds-btn--ghost sheet-actions__danger" @click="showDelete = true">
            Slett økt
          </button>
          <button type="submit" class="ds-btn ds-btn--primary ds-btn--lg sheet-actions__save" :disabled="!form.title.trim() || saving">
            {{ saving ? 'Lagrer…' : 'Lagre endringer' }}
          </button>
        </div>
      </form>
    </Sheet>

    <!-- Én øvelse -->
    <Sheet :show="showDrill" :title="drillForm.name || 'Øvelse'" @close="showDrill = false">
      <form @submit.prevent="saveDrill">
        <ExerciseFields :form="drillForm" />
        <div class="sheet-actions">
          <button type="button" class="ds-btn ds-btn--ghost sheet-actions__danger" @click="removeDrillFromSession">
            Fjern fra økta
          </button>
          <button type="submit" class="ds-btn ds-btn--primary ds-btn--lg sheet-actions__save" :disabled="!drillForm.name.trim() || savingDrill">
            {{ savingDrill ? 'Lagrer…' : 'Lagre' }}
          </button>
        </div>
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
      @create="createFromSearch"
    />
  </div>
</template>

<style scoped>
.okt-view[data-accent="warm"]       { --accent-bg: #F8E8E0; --accent-text: #7A3A24; }
.okt-view[data-accent="sage"]       { --accent-bg: #E2EDDE; --accent-text: #3D5C44; }
.okt-view[data-accent="cornflower"] { --accent-bg: #D6DDEF; --accent-text: #3D456B; }
.okt-view[data-accent="peach"]      { --accent-bg: #F8E8E0; --accent-text: #7A3A24; }
.okt-view[data-accent="sky"]        { --accent-bg: #DDE6EC; --accent-text: #3A4C5C; }
.okt-view[data-accent="olive"]      { --accent-bg: #F0E7D6; --accent-text: #6B5630; }

:global([data-theme="dark"] .okt-view[data-accent="warm"]) { --accent-bg: #2A1E18; --accent-text: #F4C4A8; }
:global([data-theme="dark"] .okt-view[data-accent="sage"]) { --accent-bg: #1A241D; --accent-text: #B5D2B0; }
:global([data-theme="dark"] .okt-view[data-accent="cornflower"]) { --accent-bg: #1A1F33; --accent-text: #B9C2E5; }
:global([data-theme="dark"] .okt-view[data-accent="peach"]) { --accent-bg: #2A1E18; --accent-text: #F4C4A8; }
:global([data-theme="dark"] .okt-view[data-accent="sky"]) { --accent-bg: #1A222A; --accent-text: #B0C5D8; }
:global([data-theme="dark"] .okt-view[data-accent="olive"]) { --accent-bg: #2A241A; --accent-text: #D9C99E; }

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

/* Uten illustrasjon: kompakt panel — 60vh tom farge lover innhold som ikke finnes.
   Stram bunn: body-en under har egen padding, to lag stables til død sone. */
.chapter__hero--bare {
  min-height: 0;
  padding-top: var(--ds-space-2xl);
  padding-bottom: var(--ds-space-sm);
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
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-secondary);
  text-decoration: none;
  letter-spacing: -0.005em;
  min-width: 0;
}

.okt-view__back svg { width: 14px; height: 14px; flex-shrink: 0; }
.okt-view__back:hover { color: var(--ds-color-text-primary); }

.okt-view__icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
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

/* ---- Header (over bildet, nederst i hero-sonen) ---- */
.hero {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 0;
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

/* ---- Øvelser ---- */
.drills {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.drill {
  padding: var(--ds-space-lg) 0;
  border-top: 1px solid rgba(255, 255, 255, 0.14);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: opacity var(--ds-duration-fast) var(--ds-ease-out);
}

.drill:first-child { padding-top: 0; border-top: 0; }
.drill:active { opacity: 0.7; }

@media (hover: hover) and (pointer: fine) {
  .drill:hover .drill__chevron { opacity: 0.9; }
}

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

/* Stille hint om at øvelsen kan åpnes — skal ikke kjempe mot panelet */
.drill__chevron {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  align-self: center;
  color: var(--hero-fg);
  opacity: 0.45;
  transition: opacity var(--ds-duration-fast) var(--ds-ease-out);
}

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
  transition:
    opacity var(--ds-duration-fast) var(--ds-ease-out),
    border-color var(--ds-duration-fast) var(--ds-ease-out),
    transform var(--ds-duration-fast) var(--ds-ease-out);
}

.drill-add svg { width: 15px; height: 15px; }
.drill-add:hover { opacity: 1; border-color: rgba(255, 255, 255, 0.55); }
.drill-add:active { opacity: 1; transform: scale(0.98); }

/* Panelet er alltid mørkt — standardknappene (nesten svart primær, lys grå
   sekundær) drukner eller gjørmer seg. Panel-lokal variant i panelets språk. */
.okt-view__empty .ds-btn--primary {
  background: var(--hero-fg);
  border-color: var(--hero-fg);
  color: var(--hero-bg);
}
.okt-view__empty .ds-btn--primary:hover { opacity: 0.92; }

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

.okt-view__empty {
  text-align: center;
  padding: var(--ds-space-lg) 0 var(--ds-space-sm);
  color: var(--hero-fg);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ds-space-md);
}

/* Global p-farge er mørk grå — usynlig på det alltid-mørke panelet.
   Dempingen ligger på teksten alene: lå den på hele blokka, arvet knappen
   den og så deaktivert ut. */
.okt-view__empty p {
  color: inherit;
  opacity: 0.8;
  margin: 0;
}

/* Sletting bor i redigeringen, ikke som ikon ved siden av den. */
.sheet-actions {
  display: flex;
  gap: var(--ds-space-sm);
  margin-top: var(--ds-space-sm);
}

.sheet-actions__danger { flex-shrink: 0; color: var(--ds-color-error); }
.sheet-actions__save { flex: 1; }
</style>
