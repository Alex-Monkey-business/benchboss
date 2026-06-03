<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useTrainingPeriods } from '../composables/useTrainingPeriods'
import Sheet from '../components/Sheet.vue'
import Skeleton from '../components/Skeleton.vue'

const router = useRouter()
const { periods, loading, fetchPeriods, createPeriod } = useTrainingPeriods()

const ACCENTS = [
  { value: 'warm',       label: 'Varm' },
  { value: 'sage',       label: 'Salvie' },
  { value: 'cornflower', label: 'Kornblå' },
  { value: 'peach',      label: 'Fersken' },
  { value: 'sky',        label: 'Himmel' },
  { value: 'olive',      label: 'Oliven' }
]

const showSheet = ref(false)
const form = ref(emptyForm())
const saving = ref(false)

function emptyForm() {
  return { title: '', lead: '', accent: 'warm', start_date: '', end_date: '' }
}

function open(id) {
  router.push(`/admin/treningsplan/${id}`)
}

function openSheet() {
  form.value = emptyForm()
  showSheet.value = true
}

async function save() {
  if (!form.value.title.trim() || saving.value) return
  saving.value = true
  const payload = {
    title: form.value.title.trim(),
    lead: form.value.lead.trim() || null,
    accent: form.value.accent,
    start_date: form.value.start_date || null,
    end_date: form.value.end_date || null
  }
  const row = await createPeriod(payload)
  saving.value = false
  showSheet.value = false
  if (row) open(row.id)
}

function dateRange(p) {
  const fmt = (d) => new Date(d).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })
  if (p.start_date && p.end_date) return `${fmt(p.start_date)} – ${fmt(p.end_date)}`
  if (p.start_date) return `Fra ${fmt(p.start_date)}`
  return ''
}

onMounted(fetchPeriods)
</script>

<template>
  <div class="treningsplan">
    <div class="treningsplan__back-wrap">
      <router-link to="/admin" class="treningsplan__back">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Admin
      </router-link>
    </div>

    <header class="treningsplan__hero">
      <h1 class="treningsplan__title">Treningsøkter</h1>
    </header>

    <!-- Lasting -->
    <div v-if="loading && !periods.length" class="treningsplan__list">
      <Skeleton v-for="n in 3" :key="n" height="76px" radius="var(--ds-radius-lg)" />
    </div>

    <!-- Tom tilstand -->
    <div v-else-if="!periods.length" class="ds-empty">
      <div class="ds-empty__title">Ingen perioder ennå</div>
      <div class="ds-empty__description">Lag den første perioden og legg inn øktene fra Messenger.</div>
      <button type="button" class="ds-btn ds-btn--primary ds-empty__action" @click="openSheet">Ny periode</button>
    </div>

    <!-- Liste -->
    <template v-else>
      <div class="treningsplan__list">
        <button
          v-for="(p, i) in periods"
          :key="p.id"
          type="button"
          :data-accent="p.accent"
          class="period-card"
          :style="{ '--card-delay': `${i * 60}ms` }"
          @click="open(p.id)"
        >
          <span class="period-card__number">{{ String(i + 1).padStart(2, '0') }}</span>
          <span class="period-card__body">
            <span class="period-card__title">{{ p.title }}</span>
            <span v-if="p.lead" class="period-card__lead">{{ p.lead }}</span>
            <span v-if="dateRange(p)" class="period-card__dates">{{ dateRange(p) }}</span>
          </span>
          <svg class="period-card__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
      </div>

      <button type="button" class="ds-btn ds-btn--secondary treningsplan__add" @click="openSheet">
        Ny periode
      </button>
    </template>

    <!-- Ny periode -->
    <Sheet :show="showSheet" title="Ny periode" @close="showSheet = false">
      <form @submit.prevent="save">
        <div class="ds-form-group">
          <label class="ds-label" for="tp-title">Tittel</label>
          <input id="tp-title" v-model="form.title" class="ds-input" type="text" placeholder="F.eks. Juni — avslutning foran mål" required />
        </div>
        <div class="ds-form-group">
          <label class="ds-label" for="tp-lead">Ingress</label>
          <input id="tp-lead" v-model="form.lead" class="ds-input" type="text" placeholder="Kort om hva perioden handler om" />
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
        <div class="ds-form-row">
          <div class="ds-form-group">
            <label class="ds-label" for="tp-start">Fra</label>
            <input id="tp-start" v-model="form.start_date" class="ds-input" type="date" />
          </div>
          <div class="ds-form-group">
            <label class="ds-label" for="tp-end">Til</label>
            <input id="tp-end" v-model="form.end_date" class="ds-input" type="date" />
          </div>
        </div>
        <button type="submit" class="ds-btn ds-btn--primary ds-btn--lg" :disabled="!form.title.trim() || saving" style="width: 100%; margin-top: var(--ds-space-sm);">
          {{ saving ? 'Lagrer…' : 'Opprett periode' }}
        </button>
      </form>
    </Sheet>
  </div>
</template>

<style scoped>
/* Per-accent palette — matches trener-håndboken */
.period-card[data-accent="warm"],       .accent-swatch[data-accent="warm"]       { --accent-bg: #F8E8E0; --accent-text: #7A3A24; }
.period-card[data-accent="sage"],       .accent-swatch[data-accent="sage"]       { --accent-bg: #E2EDDE; --accent-text: #3D5C44; }
.period-card[data-accent="cornflower"], .accent-swatch[data-accent="cornflower"] { --accent-bg: #D6DDEF; --accent-text: #3D456B; }
.period-card[data-accent="peach"],      .accent-swatch[data-accent="peach"]      { --accent-bg: #F8E8E0; --accent-text: #7A3A24; }
.period-card[data-accent="sky"],        .accent-swatch[data-accent="sky"]        { --accent-bg: #DDE6EC; --accent-text: #3A4C5C; }
.period-card[data-accent="olive"],      .accent-swatch[data-accent="olive"]      { --accent-bg: #F0E7D6; --accent-text: #6B5630; }

:global([data-theme="dark"]) .period-card[data-accent="warm"],       :global([data-theme="dark"]) .accent-swatch[data-accent="warm"]       { --accent-bg: #2A1E18; --accent-text: #F4C4A8; }
:global([data-theme="dark"]) .period-card[data-accent="sage"],       :global([data-theme="dark"]) .accent-swatch[data-accent="sage"]       { --accent-bg: #1A241D; --accent-text: #B5D2B0; }
:global([data-theme="dark"]) .period-card[data-accent="cornflower"], :global([data-theme="dark"]) .accent-swatch[data-accent="cornflower"] { --accent-bg: #1A1F33; --accent-text: #B9C2E5; }
:global([data-theme="dark"]) .period-card[data-accent="peach"],      :global([data-theme="dark"]) .accent-swatch[data-accent="peach"]      { --accent-bg: #2A1E18; --accent-text: #F4C4A8; }
:global([data-theme="dark"]) .period-card[data-accent="sky"],        :global([data-theme="dark"]) .accent-swatch[data-accent="sky"]        { --accent-bg: #1A222A; --accent-text: #B0C5D8; }
:global([data-theme="dark"]) .period-card[data-accent="olive"],      :global([data-theme="dark"]) .accent-swatch[data-accent="olive"]      { --accent-bg: #2A241A; --accent-text: #D9C99E; }

.treningsplan {
  max-width: 680px;
  margin: 0 auto;
  padding: var(--ds-space-md) var(--ds-space-lg) var(--ds-space-2xl);
}

.treningsplan__back-wrap { margin-bottom: var(--ds-space-xl); }

.treningsplan__back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-secondary);
  text-decoration: none;
  letter-spacing: -0.005em;
}

.treningsplan__back svg { width: 14px; height: 14px; }
.treningsplan__back:hover { color: var(--ds-color-text-primary); }

.treningsplan__hero { margin-bottom: var(--ds-space-2xl); }

.treningsplan__eyebrow {
  display: inline-block;
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-medium);
  letter-spacing: var(--ds-tracking-wider);
  text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
  margin-bottom: var(--ds-space-md);
}

.treningsplan__title {
  font-family: var(--ds-font-display);
  font-size: clamp(2.2rem, 7vw, 3.2rem);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-tighter);
  line-height: 1.05;
  color: var(--ds-color-text-primary);
  font-variation-settings: var(--ds-font-display-settings);
  margin: 0 0 var(--ds-space-lg);
}

.treningsplan__lead {
  font-family: var(--ds-font-display);
  font-size: var(--ds-text-lg);
  font-weight: var(--ds-weight-regular);
  line-height: 1.45;
  letter-spacing: -0.01em;
  color: var(--ds-color-text-secondary);
  max-width: 36ch;
  margin: 0;
}

.treningsplan__list {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
  margin-bottom: var(--ds-space-lg);
}

.period-card {
  display: flex;
  align-items: stretch;
  gap: var(--ds-space-md);
  padding: var(--ds-space-md) var(--ds-space-md) var(--ds-space-md) 0;
  background: var(--ds-color-bg-elevated);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-lg);
  cursor: pointer;
  text-align: left;
  font-family: var(--ds-font-body);
  -webkit-tap-highlight-color: transparent;
  transition:
    transform var(--ds-duration-fast) var(--ds-ease-out),
    border-color var(--ds-duration-fast) var(--ds-ease-out),
    box-shadow var(--ds-duration-fast) var(--ds-ease-out);
  opacity: 0;
  animation: period-card-in 450ms var(--ds-ease-smooth) both;
  animation-delay: var(--card-delay);
}

@media (hover: hover) and (pointer: fine) {
  .period-card:hover {
    border-color: var(--ds-color-border-strong);
    box-shadow: var(--ds-shadow-sm);
    transform: translateY(-1px);
  }
}

.period-card:active { transform: scale(0.99); }

.period-card__number {
  flex-shrink: 0;
  width: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-bg);
  color: var(--accent-text);
  font-family: var(--ds-font-display);
  font-size: var(--ds-text-xl);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  font-variation-settings: var(--ds-font-display-settings);
  border-radius: var(--ds-radius-md) 0 0 var(--ds-radius-md);
  margin: calc(var(--ds-space-md) * -1) 0;
}

.period-card__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding-top: 2px;
}

.period-card__title {
  font-family: var(--ds-font-display);
  font-size: var(--ds-text-md);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-tight);
  color: var(--ds-color-text-primary);
  line-height: 1.2;
}

.period-card__lead {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
  line-height: 1.45;
  letter-spacing: -0.005em;
}

.period-card__dates {
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-tertiary);
  font-variant-numeric: tabular-nums;
}

.period-card__chevron {
  width: 16px;
  height: 16px;
  align-self: center;
  color: var(--ds-color-text-tertiary);
  flex-shrink: 0;
}

.treningsplan__add { width: 100%; }

/* Accent-velger i skjema */
.accent-picker {
  display: flex;
  gap: var(--ds-space-sm);
  flex-wrap: wrap;
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

.accent-swatch--active {
  border-color: var(--accent-text);
}

@keyframes period-card-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .period-card { animation: none; opacity: 1; }
}
</style>
