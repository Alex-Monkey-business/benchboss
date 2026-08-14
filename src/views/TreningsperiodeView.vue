<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTrainingPeriods } from '../composables/useTrainingPeriods'
import { useTrainingSessions, DEFAULT_WEEK_SESSIONS } from '../composables/useTrainingSessions'
import { useExercises } from '../composables/useExercises'
import { useToast } from '../composables/useToast'
import { parseTreningsplan } from '../lib/treningParser'
import { localISODate } from '../lib/dateLabels'
import Sheet from '../components/Sheet.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'

const route = useRoute()
const router = useRouter()
const { periods, getPeriod, fetchPeriods, createPeriod, updatePeriod, deletePeriod } = useTrainingPeriods()
const { sessions, fetchSessions, createSession } = useTrainingSessions()
const { upsertFromDrill } = useExercises()
const { show: showToast } = useToast()

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
  router.push(`/trening/${periodId.value}/okt/${s.id}`)
}

// ---- Periode-bytter ----
const showSwitcher = ref(false)

function goToPeriod(id) {
  showSwitcher.value = false
  if (id !== periodId.value) router.push(`/trening/${id}`)
}

// Bytte periode gjenbruker komponenten — hent øktene for den nye perioden.
watch(periodId, (id) => { if (id) fetchSessions(id) })

const creating = ref(false)
async function addOkt() {
  if (creating.value) return
  creating.value = true
  const row = await createSession(periodId.value, { title: 'Ny økt', accent: period.value?.accent || 'warm' })
  creating.value = false
  if (row) openOkt(row)
}

// ---- Lim inn plan ----
const ACCENT_ROTATION = ['sky', 'peach', 'olive', 'sage', 'cornflower', 'warm']
const showPaste = ref(false)
const pasteText = ref('')
const savingPaste = ref(false)

const parsedPlan = computed(() => parseTreningsplan(pasteText.value))

function openPaste() {
  pasteText.value = ''
  showPaste.value = true
}

async function confirmPaste() {
  const parsed = parsedPlan.value
  if (!parsed.sessions.length || savingPaste.value) return
  savingPaste.value = true
  const base = sessions.value.length
  for (const [i, s] of parsed.sessions.entries()) {
    // Alle øvelser lever i banken — nye fanges automatisk ved import.
    const drills = []
    for (const d of s.drills) {
      const ex = await upsertFromDrill(d)
      drills.push(ex ? { ...d, exercise_id: ex.id } : d)
    }
    await createSession(periodId.value, {
      title: s.title,
      weekday: s.weekday,
      focus: s.focus || null,
      accent: ACCENT_ROTATION[(base + i) % ACCENT_ROTATION.length],
      drills,
      position: base + i
    })
  }
  savingPaste.value = false
  showPaste.value = false
  const n = parsed.sessions.length
  pasteText.value = ''
  showToast(`${n} ${n === 1 ? 'økt' : 'økter'} lagt til`, 'success')
}

// ---- Dupliser periode (med alle økter, uten datoer) ----
const duplicating = ref(false)
async function duplicatePeriod() {
  if (duplicating.value) return
  duplicating.value = true
  const src = period.value
  const copies = [...sessions.value].sort((a, b) => a.position - b.position)
  const row = await createPeriod({
    title: `${src.title} (kopi)`,
    lead: src.lead || null,
    accent: src.accent,
    start_date: null,
    end_date: null
  })
  if (row) {
    for (const [i, s] of copies.entries()) {
      await createSession(row.id, {
        title: s.title,
        weekday: s.weekday ?? null,
        accent: s.accent || 'warm',
        illustration: s.illustration || null,
        focus: s.focus || null,
        drills: s.drills || [],
        position: i
      })
    }
    showToast(`«${row.title}» opprettet`, 'success')
    router.push(`/trening/${row.id}`)
  }
  duplicating.value = false
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

// ---- Ny periode (fra bytteren) ----
const showCreateSheet = ref(false)
const createForm = ref({ title: '', lead: '', accent: 'warm', start_date: '', end_date: '' })
const savingCreate = ref(false)

function openCreate() {
  showSwitcher.value = false
  createForm.value = { title: '', lead: '', accent: 'warm', start_date: '', end_date: '' }
  showCreateSheet.value = true
}

async function saveCreate() {
  if (!createForm.value.title.trim() || savingCreate.value) return
  savingCreate.value = true
  const row = await createPeriod({
    title: createForm.value.title.trim(),
    lead: createForm.value.lead.trim() || null,
    accent: createForm.value.accent,
    start_date: createForm.value.start_date || null,
    end_date: createForm.value.end_date || null
  })
  // Fast ukeoppsett: tirsdag, torsdag og lørdag ligger klare i nye perioder.
  if (row) {
    for (const [i, tpl] of DEFAULT_WEEK_SESSIONS.entries()) {
      await createSession(row.id, { ...tpl, drills: [], position: i })
    }
  }
  savingCreate.value = false
  showCreateSheet.value = false
  if (row) router.push(`/trening/${row.id}`)
}

// ---- Slett periode ----
const showDeletePeriod = ref(false)
async function confirmDeletePeriod() {
  await deletePeriod(periodId.value)
  showDeletePeriod.value = false
  router.push('/trening')
}

// En periode som er over skal si det. Uten dette leser en åpnet gammel plan
// nøyaktig som en gjeldende — det var hele grunnen til at Trening-fanen
// virket som om det alltid fantes en aktiv plan.
function hasEnded(p) {
  return !!(p?.end_date && p.end_date < localISODate())
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
      <div class="periode__nav-actions">
        <button type="button" class="periode__icon-btn" aria-label="Rediger periode" @click="openEditPeriod">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
        </button>
        <button type="button" class="periode__icon-btn" aria-label="Dupliser periode" :disabled="duplicating" @click="duplicatePeriod">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
        <button type="button" class="periode__icon-btn periode__icon-btn--danger" aria-label="Slett periode" @click="showDeletePeriod = true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>

    <header class="periode__head">
      <span class="periode__number">{{ String(index + 1).padStart(2, '0') }}</span>
      <button type="button" class="periode__switcher" @click="showSwitcher = true" aria-label="Bytt periode">
        <h1 class="periode__title">{{ period.title }}</h1>
        <svg class="periode__switcher-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <p v-if="period.lead" class="periode__lead">{{ period.lead }}</p>
      <span v-if="dateRange(period)" class="periode__dates">
        {{ dateRange(period) }}
        <span v-if="hasEnded(period)" class="periode__ended">Avsluttet</span>
      </span>
    </header>

    <!-- Ressurser: håndboka (filosofien) + øvelsesbanken (byggeklossene) -->
    <div class="resource-row">
      <router-link to="/trening/handbok" class="handbok-link">
        <span class="handbok-link__body">
          <span class="handbok-link__eyebrow">Håndbok</span>
          <span class="handbok-link__title">Slik trener vi</span>
        </span>
        <svg class="handbok-link__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </router-link>
      <router-link to="/trening/ovelser" class="handbok-link">
        <span class="handbok-link__body">
          <span class="handbok-link__eyebrow">Øvelsesbank</span>
          <span class="handbok-link__title">Alle øvelser</span>
        </span>
        <svg class="handbok-link__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </router-link>
    </div>

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

    <div class="periode__add-row">
      <button type="button" class="ds-btn ds-btn--secondary periode__add" @click="openPaste">
        Lim inn plan
      </button>
      <button type="button" class="ds-btn ds-btn--secondary periode__add" :disabled="creating" @click="addOkt">
        {{ creating ? 'Lager…' : 'Legg til økt' }}
      </button>
    </div>

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
      <p class="paste-hint">Ukedag starter ny økt, kulepunkter blir øvelser. «(diff)» og «(mix)» merker type.</p>

      <div v-if="parsedPlan.sessions.length" class="paste-preview">
        <div v-for="(s, i) in parsedPlan.sessions" :key="i" class="paste-preview__row" :data-accent="ACCENT_ROTATION[(sessions.length + i) % ACCENT_ROTATION.length]">
          <span class="paste-preview__day">{{ s.title }}</span>
          <span v-if="s.focus" class="paste-preview__focus">{{ s.focus }}</span>
          <span class="paste-preview__meta">{{ s.drills.length }} {{ s.drills.length === 1 ? 'øvelse' : 'øvelser' }}</span>
        </div>
      </div>

      <button
        type="button"
        class="ds-btn ds-btn--primary ds-btn--lg"
        style="width: 100%; margin-top: var(--ds-space-md);"
        :disabled="!parsedPlan.sessions.length || savingPaste"
        @click="confirmPaste"
      >
        {{ savingPaste ? 'Lagrer…' : parsedPlan.sessions.length ? `Opprett ${parsedPlan.sessions.length} ${parsedPlan.sessions.length === 1 ? 'økt' : 'økter'}` : 'Opprett økter' }}
      </button>
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

    <!-- Periode-bytter -->
    <Sheet :show="showSwitcher" title="Perioder" @close="showSwitcher = false">
      <div class="period-switch-list">
        <button
          v-for="(p, i) in periods"
          :key="p.id"
          type="button"
          :data-accent="p.accent"
          :class="['period-switch', { 'period-switch--active': p.id === periodId }]"
          @click="goToPeriod(p.id)"
        >
          <span class="period-switch__num">{{ String(i + 1).padStart(2, '0') }}</span>
          <span class="period-switch__body">
            <span class="period-switch__title">{{ p.title }}</span>
            <span v-if="dateRange(p)" class="period-switch__dates">{{ dateRange(p) }}</span>
          </span>
          <svg v-if="p.id === periodId" class="period-switch__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </button>
      </div>
      <button type="button" class="ds-btn ds-btn--secondary period-switch__add" @click="openCreate">
        + Ny periode
      </button>
    </Sheet>

    <!-- Ny periode -->
    <Sheet :show="showCreateSheet" title="Ny periode" @close="showCreateSheet = false">
      <form @submit.prevent="saveCreate">
        <div class="ds-form-group">
          <label class="ds-label" for="new-title">Tittel</label>
          <input id="new-title" v-model="createForm.title" class="ds-input" type="text" placeholder="F.eks. Juni — avslutning foran mål" required />
        </div>
        <div class="ds-form-group">
          <label class="ds-label" for="new-lead">Ingress</label>
          <input id="new-lead" v-model="createForm.lead" class="ds-input" type="text" placeholder="Kort om hva perioden handler om" />
        </div>
        <div class="ds-form-group">
          <label class="ds-label">Farge</label>
          <div class="accent-picker">
            <button
              v-for="a in ACCENTS"
              :key="a.value"
              type="button"
              :data-accent="a.value"
              :class="['accent-swatch', { 'accent-swatch--active': createForm.accent === a.value }]"
              :aria-label="a.label"
              :title="a.label"
              @click="createForm.accent = a.value"
            />
          </div>
        </div>
        <div class="ds-form-row">
          <div class="ds-form-group">
            <label class="ds-label" for="new-start">Fra</label>
            <input id="new-start" v-model="createForm.start_date" class="ds-input" type="date" />
          </div>
          <div class="ds-form-group">
            <label class="ds-label" for="new-end">Til</label>
            <input id="new-end" v-model="createForm.end_date" class="ds-input" type="date" />
          </div>
        </div>
        <p class="paste-hint">Tirsdag, torsdag og lørdag legges inn automatisk.</p>
        <button type="submit" class="ds-btn ds-btn--primary ds-btn--lg" :disabled="!createForm.title.trim() || savingCreate" style="width: 100%; margin-top: var(--ds-space-sm);">
          {{ savingCreate ? 'Lagrer…' : 'Opprett periode' }}
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

:global([data-theme="dark"] .periode[data-accent="warm"]),       :global([data-theme="dark"] .okt-card[data-accent="warm"]),       :global([data-theme="dark"] .accent-swatch[data-accent="warm"]) { --accent-bg: #2A1E18; --accent-text: #F4C4A8; }
:global([data-theme="dark"] .periode[data-accent="sage"]),       :global([data-theme="dark"] .okt-card[data-accent="sage"]),       :global([data-theme="dark"] .accent-swatch[data-accent="sage"]) { --accent-bg: #1A241D; --accent-text: #B5D2B0; }
:global([data-theme="dark"] .periode[data-accent="cornflower"]), :global([data-theme="dark"] .okt-card[data-accent="cornflower"]), :global([data-theme="dark"] .accent-swatch[data-accent="cornflower"]) { --accent-bg: #1A1F33; --accent-text: #B9C2E5; }
:global([data-theme="dark"] .periode[data-accent="peach"]),      :global([data-theme="dark"] .okt-card[data-accent="peach"]),      :global([data-theme="dark"] .accent-swatch[data-accent="peach"]) { --accent-bg: #2A1E18; --accent-text: #F4C4A8; }
:global([data-theme="dark"] .periode[data-accent="sky"]),        :global([data-theme="dark"] .okt-card[data-accent="sky"]),        :global([data-theme="dark"] .accent-swatch[data-accent="sky"]) { --accent-bg: #1A222A; --accent-text: #B0C5D8; }
:global([data-theme="dark"] .periode[data-accent="olive"]),      :global([data-theme="dark"] .okt-card[data-accent="olive"]),      :global([data-theme="dark"] .accent-swatch[data-accent="olive"]) { --accent-bg: #2A241A; --accent-text: #D9C99E; }

.periode {
  max-width: 640px;
  margin: 0 auto;
  padding: var(--ds-space-md) var(--ds-space-lg) var(--ds-space-2xl);
}

.periode__nav {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  margin-bottom: var(--ds-space-2xl);
}

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

.periode__ended {
  display: inline-block; margin-left: 8px; padding: 2px 8px;
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-elevated); border: 1px solid var(--ds-color-border);
  font-size: var(--ds-text-xs); font-weight: var(--ds-weight-semibold);
  letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
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

.periode__add-row {
  display: flex;
  gap: var(--ds-space-sm);
}
.periode__add { flex: 1; }

/* ---- Lim inn plan ---- */
.paste-input {
  width: 100%;
  font-size: var(--ds-text-sm);
  line-height: 1.5;
  resize: vertical;
}

.paste-hint {
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-tertiary);
  margin: var(--ds-space-sm) 0 0;
  line-height: 1.5;
}

.paste-preview {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: var(--ds-space-md);
}

.paste-preview__row {
  display: flex;
  align-items: baseline;
  gap: var(--ds-space-sm);
  padding: 10px 12px;
  background: var(--accent-bg, var(--ds-color-bg-subtle));
  color: var(--accent-text, var(--ds-color-text-primary));
  border-radius: var(--ds-radius-md);
  min-width: 0;
}

.paste-preview__row[data-accent="warm"]       { --accent-bg: #F8E8E0; --accent-text: #7A3A24; }
.paste-preview__row[data-accent="sage"]       { --accent-bg: #E2EDDE; --accent-text: #3D5C44; }
.paste-preview__row[data-accent="cornflower"] { --accent-bg: #D6DDEF; --accent-text: #3D456B; }
.paste-preview__row[data-accent="peach"]      { --accent-bg: #F8E8E0; --accent-text: #7A3A24; }
.paste-preview__row[data-accent="sky"]        { --accent-bg: #DDE6EC; --accent-text: #3A4C5C; }
.paste-preview__row[data-accent="olive"]      { --accent-bg: #F0E7D6; --accent-text: #6B5630; }

:global([data-theme="dark"] .paste-preview__row[data-accent="warm"]) { --accent-bg: #2A1E18; --accent-text: #F4C4A8; }
:global([data-theme="dark"] .paste-preview__row[data-accent="sage"]) { --accent-bg: #1A241D; --accent-text: #B5D2B0; }
:global([data-theme="dark"] .paste-preview__row[data-accent="cornflower"]) { --accent-bg: #1A1F33; --accent-text: #B9C2E5; }
:global([data-theme="dark"] .paste-preview__row[data-accent="peach"]) { --accent-bg: #2A1E18; --accent-text: #F4C4A8; }
:global([data-theme="dark"] .paste-preview__row[data-accent="sky"]) { --accent-bg: #1A222A; --accent-text: #B0C5D8; }
:global([data-theme="dark"] .paste-preview__row[data-accent="olive"]) { --accent-bg: #2A241A; --accent-text: #D9C99E; }

.paste-preview__day {
  font-weight: var(--ds-weight-semibold);
  font-size: var(--ds-text-sm);
  flex-shrink: 0;
}

.paste-preview__focus {
  flex: 1;
  font-size: var(--ds-text-xs);
  opacity: 0.75;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.paste-preview__meta {
  font-size: var(--ds-text-xs);
  flex-shrink: 0;
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}

/* Ressursrad — håndbok + øvelsesbank side om side, lettere vekt enn økt-kortene.
   På smale skjermer stables de: avkuttede labels er verre enn én ekstra rad. */
.resource-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--ds-space-sm);
  margin-bottom: var(--ds-space-lg);
}

@media (max-width: 379px) {
  .resource-row { grid-template-columns: 1fr; }
}

.handbok-link {
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
  /* Grid-item: uten denne nekter 1fr-kolonnen å krympe under tekstens
     min-bredde (nowrap-eyebrow) og raden renner ut av smale viewports. */
  min-width: 0;
  padding: 14px var(--ds-space-md);
  background: var(--ds-color-bg-elevated);
  border: 1px solid var(--ds-color-border-light);
  border-radius: var(--ds-radius-lg);
  text-decoration: none;
  color: inherit;
  -webkit-tap-highlight-color: transparent;
  transition:
    transform var(--ds-duration-fast) var(--ds-ease-out),
    border-color var(--ds-duration-fast) var(--ds-ease-out);
}

.handbok-link:active { transform: scale(0.99); }

@media (hover: hover) and (pointer: fine) {
  .handbok-link:hover { border-color: var(--ds-color-border); }
}

.handbok-link__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.handbok-link__eyebrow {
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-medium);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.handbok-link__title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.handbok-link__title {
  font-size: var(--ds-text-md);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
}

.handbok-link__chevron {
  width: 18px;
  height: 18px;
  color: var(--ds-color-text-tertiary);
  flex-shrink: 0;
}

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

/* ---- Periode-bytter ---- */
.periode__switcher {
  display: inline-flex;
  align-items: flex-start;
  gap: 8px;
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  cursor: pointer;
  text-align: left;
  color: inherit;
  -webkit-tap-highlight-color: transparent;
}

.periode__switcher-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  margin-top: 0.35em;
  color: var(--ds-color-text-tertiary);
  transition: color var(--ds-duration-fast) var(--ds-ease-out);
}

.periode__switcher:active { opacity: 0.7; }

@media (hover: hover) and (pointer: fine) {
  .periode__switcher:hover .periode__switcher-icon { color: var(--ds-color-text-secondary); }
}

.period-switch-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: var(--ds-space-md);
}

.period-switch {
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
  transition: border-color var(--ds-duration-fast) var(--ds-ease-out), transform var(--ds-duration-fast) var(--ds-ease-out);
}

.period-switch:active { transform: scale(0.99); }
.period-switch--active { border-color: var(--ds-color-text-primary); }

.period-switch__num {
  flex-shrink: 0;
  width: 28px;
  font-family: var(--ds-font-display);
  font-weight: var(--ds-weight-semibold);
  font-variant-numeric: tabular-nums;
  font-size: var(--ds-text-md);
  color: var(--ds-color-text-tertiary);
}

.period-switch__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.period-switch__title {
  font-weight: var(--ds-weight-semibold);
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-primary);
}

.period-switch__dates {
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-tertiary);
  font-variant-numeric: tabular-nums;
}

.period-switch__check {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  color: var(--ds-color-text-primary);
}

.period-switch__add { width: 100%; }
</style>
