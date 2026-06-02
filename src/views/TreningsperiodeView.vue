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
const { sessions, fetchSessions, createSession } = useTrainingSessions()

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

function openOkt(s) {
  router.push(`/admin/treningsplan/${periodId.value}/okt/${s.id}`)
}

const creating = ref(false)
async function addOkt() {
  if (creating.value) return
  creating.value = true
  const row = await createSession(periodId.value, { title: 'Ny økt', accent: period.value?.accent || 'warm' })
  creating.value = false
  if (row) openOkt(row)
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

function abbr(title) {
  return (title || '').trim().slice(0, 3)
}

function drillCount(s) {
  return (s.drills || []).length
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

    <header class="periode__head">
      <span class="periode__number">{{ String(index + 1).padStart(2, '0') }}</span>
      <h1 class="periode__title">{{ period.title }}</h1>
      <p v-if="period.lead" class="periode__lead">{{ period.lead }}</p>
      <span v-if="dateRange(period)" class="periode__dates">{{ dateRange(period) }}</span>
    </header>

    <!-- Økt-kort -->
    <div class="okt-list">
      <div
        v-for="s in sessions"
        :key="s.id"
        class="okt-card"
        :data-accent="s.accent || 'warm'"
        @click="openOkt(s)"
      >
        <span class="okt-card__color">{{ abbr(s.title) }}</span>
        <span class="okt-card__body">
          <span class="okt-card__title">{{ s.title }}</span>
          <span v-if="s.focus" class="okt-card__focus">{{ s.focus }}</span>
          <span class="okt-card__meta">{{ drillCount(s) }} {{ drillCount(s) === 1 ? 'øvelse' : 'øvelser' }}</span>
        </span>
        <svg class="okt-card__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    </div>

    <button type="button" class="ds-btn ds-btn--secondary periode__add" :disabled="creating" @click="addOkt">
      {{ creating ? 'Lager…' : 'Legg til økt' }}
    </button>

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
.periode[data-accent="warm"],       .okt-card[data-accent="warm"],       .accent-swatch[data-accent="warm"]       { --accent-bg: #F8E8E0; --accent-text: #7A3A24; }
.periode[data-accent="sage"],       .okt-card[data-accent="sage"],       .accent-swatch[data-accent="sage"]       { --accent-bg: #E2EDDE; --accent-text: #3D5C44; }
.periode[data-accent="cornflower"], .okt-card[data-accent="cornflower"], .accent-swatch[data-accent="cornflower"] { --accent-bg: #D6DDEF; --accent-text: #3D456B; }
.periode[data-accent="peach"],      .okt-card[data-accent="peach"],      .accent-swatch[data-accent="peach"]      { --accent-bg: #F8E8E0; --accent-text: #7A3A24; }
.periode[data-accent="sky"],        .okt-card[data-accent="sky"],        .accent-swatch[data-accent="sky"]        { --accent-bg: #DDE6EC; --accent-text: #3A4C5C; }
.periode[data-accent="olive"],      .okt-card[data-accent="olive"],      .accent-swatch[data-accent="olive"]      { --accent-bg: #F0E7D6; --accent-text: #6B5630; }

:global([data-theme="dark"]) .periode[data-accent="warm"],       :global([data-theme="dark"]) .okt-card[data-accent="warm"],       :global([data-theme="dark"]) .accent-swatch[data-accent="warm"]       { --accent-bg: #2A1E18; --accent-text: #F4C4A8; }
:global([data-theme="dark"]) .periode[data-accent="sage"],       :global([data-theme="dark"]) .okt-card[data-accent="sage"],       :global([data-theme="dark"]) .accent-swatch[data-accent="sage"]       { --accent-bg: #1A241D; --accent-text: #B5D2B0; }
:global([data-theme="dark"]) .periode[data-accent="cornflower"], :global([data-theme="dark"]) .okt-card[data-accent="cornflower"], :global([data-theme="dark"]) .accent-swatch[data-accent="cornflower"] { --accent-bg: #1A1F33; --accent-text: #B9C2E5; }
:global([data-theme="dark"]) .periode[data-accent="peach"],      :global([data-theme="dark"]) .okt-card[data-accent="peach"],      :global([data-theme="dark"]) .accent-swatch[data-accent="peach"]      { --accent-bg: #2A1E18; --accent-text: #F4C4A8; }
:global([data-theme="dark"]) .periode[data-accent="sky"],        :global([data-theme="dark"]) .okt-card[data-accent="sky"],        :global([data-theme="dark"]) .accent-swatch[data-accent="sky"]        { --accent-bg: #1A222A; --accent-text: #B0C5D8; }
:global([data-theme="dark"]) .periode[data-accent="olive"],      :global([data-theme="dark"]) .okt-card[data-accent="olive"],      :global([data-theme="dark"]) .accent-swatch[data-accent="olive"]      { --accent-bg: #2A241A; --accent-text: #D9C99E; }

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

.periode__head { margin-bottom: var(--ds-space-2xl); }

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
  margin-bottom: var(--ds-space-md);
}

.periode__title {
  font-family: var(--ds-font-display);
  font-size: clamp(2rem, 6.5vw, 2.8rem);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-tighter);
  line-height: 1.1;
  color: var(--ds-color-text-primary);
  font-variation-settings: var(--ds-font-display-settings);
  margin: 0 0 var(--ds-space-md);
}

.periode__lead {
  font-family: var(--ds-font-display);
  font-size: var(--ds-text-lg);
  font-weight: var(--ds-weight-regular);
  line-height: 1.45;
  letter-spacing: -0.01em;
  color: var(--ds-color-text-primary);
  margin: 0 0 var(--ds-space-sm);
}

.periode__dates {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-tertiary);
  font-variant-numeric: tabular-nums;
}

/* ---- Økt-kort (VG-aktig liste) ---- */
.okt-list {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-md);
  margin-bottom: var(--ds-space-lg);
}

.okt-card {
  display: flex;
  align-items: stretch;
  gap: var(--ds-space-md);
  padding: 0 var(--ds-space-md) 0 0;
  background: var(--ds-color-bg-elevated);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-lg);
  cursor: pointer;
  overflow: hidden;
  -webkit-tap-highlight-color: transparent;
  transition:
    transform var(--ds-duration-fast) var(--ds-ease-out),
    border-color var(--ds-duration-fast) var(--ds-ease-out),
    box-shadow var(--ds-duration-fast) var(--ds-ease-out);
}

@media (hover: hover) and (pointer: fine) {
  .okt-card:hover {
    border-color: var(--ds-color-border-strong);
    box-shadow: var(--ds-shadow-md);
    transform: translateY(-2px);
  }
}

.okt-card:active { transform: scale(0.99); }

.okt-card__color {
  flex-shrink: 0;
  width: 84px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-bg);
  color: var(--accent-text);
  font-family: var(--ds-font-display);
  font-size: var(--ds-text-xl);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: -0.01em;
  text-transform: lowercase;
}

.okt-card__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: var(--ds-space-md) 0;
}

.okt-card__title {
  font-family: var(--ds-font-display);
  font-size: var(--ds-text-lg);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-tight);
  color: var(--ds-color-text-primary);
  line-height: 1.15;
}

.okt-card__focus {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
  line-height: 1.45;
  letter-spacing: -0.005em;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.okt-card__meta {
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-tertiary);
  margin-top: 2px;
}

.okt-card__chevron {
  width: 16px;
  height: 16px;
  align-self: center;
  color: var(--ds-color-text-tertiary);
  flex-shrink: 0;
}

.periode__add { width: 100%; }

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
