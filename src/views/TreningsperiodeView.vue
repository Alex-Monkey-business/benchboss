<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTrainingPeriods } from '../composables/useTrainingPeriods'
import { useTrainingSessions } from '../composables/useTrainingSessions'
import Sheet from '../components/Sheet.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'

const route = useRoute()
const router = useRouter()
const { periods, getPeriod, fetchPeriods, updatePeriod, deletePeriod } = useTrainingPeriods()
const { sessions, fetchSessions, createSession, updateSession, removeSession, moveSession } = useTrainingSessions()

const ACCENTS = [
  { value: 'warm',       label: 'Varm' },
  { value: 'sage',       label: 'Salvie' },
  { value: 'cornflower', label: 'Kornblå' },
  { value: 'peach',      label: 'Fersken' },
  { value: 'sky',        label: 'Himmel' },
  { value: 'olive',      label: 'Oliven' }
]

const periodId = computed(() => route.params.id)
const period = computed(() => getPeriod(periodId.value))
const index = computed(() => periods.value.findIndex(p => p.id === periodId.value))

// ---- Økt-skjema (ny + rediger) ----
const showSessionSheet = ref(false)
const editingId = ref(null)
const sessionForm = ref(emptySessionForm())
const savingSession = ref(false)

function emptySessionForm() {
  return { title: '', body: '', links: [] }
}

function openNewSession() {
  editingId.value = null
  sessionForm.value = emptySessionForm()
  showSessionSheet.value = true
}

function openEditSession(s) {
  editingId.value = s.id
  sessionForm.value = {
    title: s.title,
    body: s.body || '',
    links: (s.links || []).map(l => ({ ...l }))
  }
  showSessionSheet.value = true
}

function addLinkRow() {
  sessionForm.value.links.push({ label: '', url: '' })
}

function removeLinkRow(i) {
  sessionForm.value.links.splice(i, 1)
}

async function saveSession() {
  if (!sessionForm.value.title.trim() || savingSession.value) return
  savingSession.value = true
  const payload = {
    title: sessionForm.value.title.trim(),
    body: sessionForm.value.body.trim() || null,
    links: sessionForm.value.links
      .map(l => ({ label: l.label.trim(), url: l.url.trim() }))
      .filter(l => l.url)
  }
  if (editingId.value) {
    await updateSession(editingId.value, payload)
  } else {
    await createSession(periodId.value, payload)
  }
  savingSession.value = false
  showSessionSheet.value = false
}

// ---- Slett økt ----
const sessionToDelete = ref(null)
async function confirmDeleteSession() {
  await removeSession(sessionToDelete.value.id)
  sessionToDelete.value = null
}

// ---- Periode-skjema (rediger) ----
const showPeriodSheet = ref(false)
const periodForm = ref({ title: '', lead: '', accent: 'warm', start_date: '', end_date: '' })
const savingPeriod = ref(false)

function openEditPeriod() {
  periodForm.value = {
    title: period.value.title,
    lead: period.value.lead || '',
    accent: period.value.accent,
    start_date: period.value.start_date || '',
    end_date: period.value.end_date || ''
  }
  showPeriodSheet.value = true
}

async function savePeriod() {
  if (!periodForm.value.title.trim() || savingPeriod.value) return
  savingPeriod.value = true
  await updatePeriod(periodId.value, {
    title: periodForm.value.title.trim(),
    lead: periodForm.value.lead.trim() || null,
    accent: periodForm.value.accent,
    start_date: periodForm.value.start_date || null,
    end_date: periodForm.value.end_date || null
  })
  savingPeriod.value = false
  showPeriodSheet.value = false
}

// ---- Slett periode ----
const showDeletePeriod = ref(false)
async function confirmDeletePeriod() {
  await deletePeriod(periodId.value)
  showDeletePeriod.value = false
  router.push('/admin/treningsplan')
}

function dateRange(p) {
  const fmt = (d) => new Date(d).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long' })
  if (p.start_date && p.end_date) return `${fmt(p.start_date)} – ${fmt(p.end_date)}`
  if (p.start_date) return `Fra ${fmt(p.start_date)}`
  return ''
}

onMounted(async () => {
  if (!period.value) await fetchPeriods()
  await fetchSessions(periodId.value)
})
</script>

<template>
  <div v-if="period" class="periode" :data-accent="period.accent">
    <div class="periode__nav">
      <router-link to="/admin/treningsplan" class="periode__back">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Treningsplan
      </router-link>
      <div class="periode__nav-actions">
        <button type="button" class="periode__icon-btn" aria-label="Rediger periode" @click="openEditPeriod">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
        </button>
        <button type="button" class="periode__icon-btn periode__icon-btn--danger" aria-label="Slett periode" @click="showDeletePeriod = true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>

    <article class="periode__article">
      <span class="periode__number">{{ String(index + 1).padStart(2, '0') }}</span>
      <h1 class="periode__title">{{ period.title }}</h1>
      <p v-if="period.lead" class="periode__lead">{{ period.lead }}</p>
      <span v-if="dateRange(period)" class="periode__dates">{{ dateRange(period) }}</span>

      <!-- Økter -->
      <div v-for="(s, i) in sessions" :key="s.id" class="okt">
        <div class="okt__head">
          <h2 class="okt__title">{{ s.title }}</h2>
          <div class="okt__controls">
            <button type="button" class="okt__ctrl" :disabled="i === 0" aria-label="Flytt opp" @click="moveSession(s.id, 'up')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
            </button>
            <button type="button" class="okt__ctrl" :disabled="i === sessions.length - 1" aria-label="Flytt ned" @click="moveSession(s.id, 'down')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <button type="button" class="okt__ctrl" aria-label="Rediger økt" @click="openEditSession(s)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
            </button>
            <button type="button" class="okt__ctrl okt__ctrl--danger" aria-label="Slett økt" @click="sessionToDelete = s">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
        <p v-if="s.body" class="okt__body">{{ s.body }}</p>
        <div v-if="s.links && s.links.length" class="okt__links">
          <a
            v-for="(l, j) in s.links"
            :key="j"
            :href="l.url"
            target="_blank"
            rel="noopener"
            class="okt__link"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            {{ l.label || l.url }}
          </a>
        </div>
      </div>

      <button type="button" class="ds-btn ds-btn--secondary periode__add" @click="openNewSession">
        Legg til økt
      </button>
    </article>

    <!-- Ny / rediger økt -->
    <Sheet :show="showSessionSheet" :title="editingId ? 'Rediger økt' : 'Ny økt'" @close="showSessionSheet = false">
      <form @submit.prevent="saveSession">
        <div class="ds-form-group">
          <label class="ds-label" for="okt-title">Tittel</label>
          <input id="okt-title" v-model="sessionForm.title" class="ds-input" type="text" placeholder="F.eks. T1 — Avslutning fra kant" required />
        </div>
        <div class="ds-form-group">
          <label class="ds-label" for="okt-body">Beskrivelse</label>
          <textarea id="okt-body" v-model="sessionForm.body" class="ds-input" rows="5" placeholder="Lim inn fra Messenger — hva økta går ut på, oppsett, fokus."></textarea>
        </div>
        <div class="ds-form-group">
          <label class="ds-label">Lenker</label>
          <div v-for="(l, i) in sessionForm.links" :key="i" class="link-row">
            <input v-model="l.label" class="ds-input" type="text" placeholder="Tekst (f.eks. YouTube)" />
            <input v-model="l.url" class="ds-input" type="url" placeholder="https://…" />
            <button type="button" class="link-row__remove" aria-label="Fjern lenke" @click="removeLinkRow(i)">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <button type="button" class="ds-btn ds-btn--ghost ds-btn--sm" @click="addLinkRow">+ Lenke</button>
        </div>
        <button type="submit" class="ds-btn ds-btn--primary ds-btn--lg" :disabled="!sessionForm.title.trim() || savingSession" style="width: 100%; margin-top: var(--ds-space-sm);">
          {{ savingSession ? 'Lagrer…' : (editingId ? 'Lagre endringer' : 'Legg til økt') }}
        </button>
      </form>
    </Sheet>

    <!-- Rediger periode -->
    <Sheet :show="showPeriodSheet" title="Rediger periode" @close="showPeriodSheet = false">
      <form @submit.prevent="savePeriod">
        <div class="ds-form-group">
          <label class="ds-label" for="per-title">Tittel</label>
          <input id="per-title" v-model="periodForm.title" class="ds-input" type="text" required />
        </div>
        <div class="ds-form-group">
          <label class="ds-label" for="per-lead">Ingress</label>
          <input id="per-lead" v-model="periodForm.lead" class="ds-input" type="text" />
        </div>
        <div class="ds-form-group">
          <label class="ds-label">Farge</label>
          <div class="accent-picker">
            <button
              v-for="a in ACCENTS"
              :key="a.value"
              type="button"
              :data-accent="a.value"
              :class="['accent-swatch', { 'accent-swatch--active': periodForm.accent === a.value }]"
              :aria-label="a.label"
              :title="a.label"
              @click="periodForm.accent = a.value"
            />
          </div>
        </div>
        <div class="ds-form-row">
          <div class="ds-form-group">
            <label class="ds-label" for="per-start">Fra</label>
            <input id="per-start" v-model="periodForm.start_date" class="ds-input" type="date" />
          </div>
          <div class="ds-form-group">
            <label class="ds-label" for="per-end">Til</label>
            <input id="per-end" v-model="periodForm.end_date" class="ds-input" type="date" />
          </div>
        </div>
        <button type="submit" class="ds-btn ds-btn--primary ds-btn--lg" :disabled="!periodForm.title.trim() || savingPeriod" style="width: 100%; margin-top: var(--ds-space-sm);">
          {{ savingPeriod ? 'Lagrer…' : 'Lagre endringer' }}
        </button>
      </form>
    </Sheet>

    <ConfirmDialog
      :show="!!sessionToDelete"
      title="Slett økt?"
      :message="`«${sessionToDelete?.title}» blir borte for godt.`"
      confirm-label="Slett"
      variant="warning"
      @confirm="confirmDeleteSession"
      @cancel="sessionToDelete = null"
    />

    <ConfirmDialog
      :show="showDeletePeriod"
      title="Slett periode?"
      message="Hele perioden og alle øktene i den blir borte for godt."
      confirm-label="Slett periode"
      variant="warning"
      @confirm="confirmDeletePeriod"
      @cancel="showDeletePeriod = false"
    />
  </div>
</template>

<style scoped>
.periode[data-accent="warm"],       .accent-swatch[data-accent="warm"]       { --accent-bg: #F8E8E0; --accent-text: #7A3A24; }
.periode[data-accent="sage"],       .accent-swatch[data-accent="sage"]       { --accent-bg: #E2EDDE; --accent-text: #3D5C44; }
.periode[data-accent="cornflower"], .accent-swatch[data-accent="cornflower"] { --accent-bg: #D6DDEF; --accent-text: #3D456B; }
.periode[data-accent="peach"],      .accent-swatch[data-accent="peach"]      { --accent-bg: #F8E8E0; --accent-text: #7A3A24; }
.periode[data-accent="sky"],        .accent-swatch[data-accent="sky"]        { --accent-bg: #DDE6EC; --accent-text: #3A4C5C; }
.periode[data-accent="olive"],      .accent-swatch[data-accent="olive"]      { --accent-bg: #F0E7D6; --accent-text: #6B5630; }

:global([data-theme="dark"]) .periode[data-accent="warm"],       :global([data-theme="dark"]) .accent-swatch[data-accent="warm"]       { --accent-bg: #2A1E18; --accent-text: #F4C4A8; }
:global([data-theme="dark"]) .periode[data-accent="sage"],       :global([data-theme="dark"]) .accent-swatch[data-accent="sage"]       { --accent-bg: #1A241D; --accent-text: #B5D2B0; }
:global([data-theme="dark"]) .periode[data-accent="cornflower"], :global([data-theme="dark"]) .accent-swatch[data-accent="cornflower"] { --accent-bg: #1A1F33; --accent-text: #B9C2E5; }
:global([data-theme="dark"]) .periode[data-accent="peach"],      :global([data-theme="dark"]) .accent-swatch[data-accent="peach"]      { --accent-bg: #2A1E18; --accent-text: #F4C4A8; }
:global([data-theme="dark"]) .periode[data-accent="sky"],        :global([data-theme="dark"]) .accent-swatch[data-accent="sky"]        { --accent-bg: #1A222A; --accent-text: #B0C5D8; }
:global([data-theme="dark"]) .periode[data-accent="olive"],      :global([data-theme="dark"]) .accent-swatch[data-accent="olive"]      { --accent-bg: #2A241A; --accent-text: #D9C99E; }

.periode {
  max-width: 640px;
  margin: 0 auto;
  padding: var(--ds-space-md) var(--ds-space-lg) var(--ds-space-2xl);
}

.periode__nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--ds-space-2xl);
}

.periode__back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-secondary);
  text-decoration: none;
  letter-spacing: -0.005em;
}

.periode__back svg { width: 14px; height: 14px; }
.periode__back:hover { color: var(--ds-color-text-primary); }

.periode__nav-actions { display: flex; gap: var(--ds-space-sm); }

.periode__icon-btn {
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

.periode__icon-btn svg { width: 16px; height: 16px; }
.periode__icon-btn:hover { border-color: var(--ds-color-border-strong); color: var(--ds-color-text-primary); }
.periode__icon-btn--danger:hover { color: var(--ds-color-error); border-color: var(--ds-color-error); }

.periode__article {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-lg);
}

.periode__number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  background: var(--accent-bg);
  color: var(--accent-text);
  border-radius: var(--ds-radius-lg);
  font-family: var(--ds-font-display);
  font-size: var(--ds-text-2xl);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
  font-variation-settings: var(--ds-font-display-settings);
  margin-bottom: var(--ds-space-sm);
}

.periode__title {
  font-family: var(--ds-font-display);
  font-size: clamp(2rem, 6.5vw, 2.8rem);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-tighter);
  line-height: 1.1;
  color: var(--ds-color-text-primary);
  font-variation-settings: var(--ds-font-display-settings);
  margin: 0;
}

.periode__lead {
  font-family: var(--ds-font-display);
  font-size: var(--ds-text-lg);
  font-weight: var(--ds-weight-regular);
  line-height: 1.45;
  letter-spacing: -0.01em;
  color: var(--ds-color-text-primary);
  margin: 0;
}

.periode__dates {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-tertiary);
  font-variant-numeric: tabular-nums;
}

/* ---- Økt ---- */
.okt {
  margin-top: var(--ds-space-md);
  padding-top: var(--ds-space-lg);
  border-top: 1px solid var(--ds-color-border-light);
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
}

.okt__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ds-space-sm);
}

.okt__title {
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-wider);
  text-transform: uppercase;
  color: var(--accent-text);
  margin: 0;
  padding-top: 4px;
}

.okt__controls {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.okt__ctrl {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--ds-radius-sm);
  border: 0;
  background: transparent;
  color: var(--ds-color-text-tertiary);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color var(--ds-duration-fast) var(--ds-ease-out), color var(--ds-duration-fast) var(--ds-ease-out);
}

.okt__ctrl svg { width: 15px; height: 15px; }
.okt__ctrl:hover:not(:disabled) { background: var(--ds-color-bg-subtle); color: var(--ds-color-text-primary); }
.okt__ctrl--danger:hover:not(:disabled) { color: var(--ds-color-error); }
.okt__ctrl:disabled { opacity: 0.3; cursor: default; }

.okt__body {
  font-size: var(--ds-text-md);
  line-height: 1.6;
  color: var(--ds-color-text-secondary);
  margin: 0;
  letter-spacing: -0.005em;
  white-space: pre-wrap;
}

.okt__links {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
  margin-top: 2px;
}

.okt__link {
  display: inline-flex;
  align-items: center;
  gap: var(--ds-space-sm);
  align-self: flex-start;
  max-width: 100%;
  padding: 8px var(--ds-space-md);
  background: var(--accent-bg);
  color: var(--accent-text);
  border-radius: var(--ds-radius-md);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  text-decoration: none;
  letter-spacing: -0.005em;
  transition: transform var(--ds-duration-fast) var(--ds-ease-out);
}

.okt__link svg { width: 15px; height: 15px; flex-shrink: 0; }
.okt__link:active { transform: scale(0.98); }

.periode__add { width: 100%; margin-top: var(--ds-space-lg); }

/* ---- Lenke-repeater i skjema ---- */
.link-row {
  display: flex;
  gap: var(--ds-space-sm);
  align-items: center;
  margin-bottom: var(--ds-space-sm);
}

.link-row .ds-input:first-child { flex: 0 0 38%; }
.link-row .ds-input:nth-child(2) { flex: 1; min-width: 0; }

.link-row__remove {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--ds-radius-md);
  border: 1px solid var(--ds-color-border);
  background: transparent;
  color: var(--ds-color-text-tertiary);
  cursor: pointer;
}

.link-row__remove:hover { color: var(--ds-color-error); border-color: var(--ds-color-error); }

/* ---- Accent-velger ---- */
.accent-picker { display: flex; gap: var(--ds-space-sm); flex-wrap: wrap; }

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
