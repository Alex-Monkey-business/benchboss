<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTrainingPeriods } from '../composables/useTrainingPeriods'
import { useTrainingSessions } from '../composables/useTrainingSessions'
import Sheet from '../components/Sheet.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'

const route = useRoute()
const router = useRouter()
const { getPeriod, fetchPeriods } = useTrainingPeriods()
const { sessions, loadedPeriod, fetchSessions, updateSession, removeSession } = useTrainingSessions()

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
  return { type: 'diff', text: '', link: { label: '', url: '' } }
}

function emptyForm() {
  return { title: '', accent: 'warm', focus: '', drills: [emptyDrill()] }
}

function openEdit() {
  const s = okt.value
  const drills = (s.drills || []).map(d => ({
    type: d.type || 'none',
    text: d.text || '',
    link: d.link ? { label: d.link.label || '', url: d.link.url || '' } : { label: '', url: '' }
  }))
  form.value = {
    title: s.title,
    accent: s.accent || 'warm',
    focus: s.focus || '',
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
      link: d.link.url.trim() ? { label: d.link.label.trim(), url: d.link.url.trim() } : null
    }))
    .filter(d => d.text || d.link)
  await updateSession(oktId.value, {
    title: form.value.title.trim(),
    accent: form.value.accent,
    focus: form.value.focus.trim() || null,
    drills
  })
  saving.value = false
  showSheet.value = false
}

// ---- Slett økt ----
const showDelete = ref(false)
async function confirmDelete() {
  await removeSession(oktId.value)
  showDelete.value = false
  router.push(`/admin/treningsplan/${periodId.value}`)
}

onMounted(async () => {
  if (!period.value) await fetchPeriods()
  if (loadedPeriod.value !== periodId.value || !sessions.value.length) {
    await fetchSessions(periodId.value)
  }
})
</script>

<template>
  <div v-if="okt" class="okt-view" :data-accent="okt.accent || 'warm'">
    <div class="okt-view__nav">
      <router-link :to="`/admin/treningsplan/${periodId}`" class="okt-view__back">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        {{ period ? period.title : 'Tilbake' }}
      </router-link>
      <div class="okt-view__nav-actions">
        <button type="button" class="okt-view__icon-btn" aria-label="Rediger økt" @click="openEdit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
        </button>
        <button type="button" class="okt-view__icon-btn okt-view__icon-btn--danger" aria-label="Slett økt" @click="showDelete = true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>

    <!-- Immersiv farget header -->
    <header class="hero">
      <span v-if="period" class="hero__eyebrow">{{ period.title }}</span>
      <h1 class="hero__title">{{ okt.title }}</h1>
      <p v-if="okt.focus" class="hero__focus">{{ okt.focus }}</p>
      <span class="hero__meta">{{ drillCount }} {{ drillCount === 1 ? 'øvelse' : 'øvelser' }}</span>
    </header>

    <!-- Øvelser -->
    <div v-if="drillCount" class="drills">
      <div v-for="(d, di) in okt.drills" :key="di" class="drill">
        <span
          v-if="d.type && d.type !== 'none'"
          class="drill__badge"
          :class="`drill__badge--${d.type}`"
        >{{ d.type === 'diff' ? 'Diff' : 'Mix' }}</span>
        <div class="drill__main">
          <p v-if="d.text" class="drill__text">{{ d.text }}</p>
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
    </div>

    <div v-else class="okt-view__empty">
      <p>Ingen øvelser ennå.</p>
      <button type="button" class="ds-btn ds-btn--primary" @click="openEdit">Legg til øvelser</button>
    </div>

    <!-- Rediger økt -->
    <Sheet :show="showSheet" title="Rediger økt" @close="showSheet = false">
      <form @submit.prevent="save">
        <div class="ds-form-group">
          <label class="ds-label" for="okt-title">Dag / tittel</label>
          <input id="okt-title" v-model="form.title" class="ds-input" type="text" placeholder="F.eks. Tirsdag" required />
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
            <textarea v-model="d.text" class="ds-input" rows="3" placeholder="Hva øvelsen går ut på — oppsett, antall, fokus."></textarea>
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
  </div>
</template>

<style scoped>
.okt-view[data-accent="warm"],       .accent-swatch[data-accent="warm"]       { --accent-bg: #F8E8E0; --accent-text: #7A3A24; }
.okt-view[data-accent="sage"],       .accent-swatch[data-accent="sage"]       { --accent-bg: #E2EDDE; --accent-text: #3D5C44; }
.okt-view[data-accent="cornflower"], .accent-swatch[data-accent="cornflower"] { --accent-bg: #D6DDEF; --accent-text: #3D456B; }
.okt-view[data-accent="peach"],      .accent-swatch[data-accent="peach"]      { --accent-bg: #F8E8E0; --accent-text: #7A3A24; }
.okt-view[data-accent="sky"],        .accent-swatch[data-accent="sky"]        { --accent-bg: #DDE6EC; --accent-text: #3A4C5C; }
.okt-view[data-accent="olive"],      .accent-swatch[data-accent="olive"]      { --accent-bg: #F0E7D6; --accent-text: #6B5630; }

:global([data-theme="dark"]) .okt-view[data-accent="warm"],       :global([data-theme="dark"]) .accent-swatch[data-accent="warm"]       { --accent-bg: #2A1E18; --accent-text: #F4C4A8; }
:global([data-theme="dark"]) .okt-view[data-accent="sage"],       :global([data-theme="dark"]) .accent-swatch[data-accent="sage"]       { --accent-bg: #1A241D; --accent-text: #B5D2B0; }
:global([data-theme="dark"]) .okt-view[data-accent="cornflower"], :global([data-theme="dark"]) .accent-swatch[data-accent="cornflower"] { --accent-bg: #1A1F33; --accent-text: #B9C2E5; }
:global([data-theme="dark"]) .okt-view[data-accent="peach"],      :global([data-theme="dark"]) .accent-swatch[data-accent="peach"]      { --accent-bg: #2A1E18; --accent-text: #F4C4A8; }
:global([data-theme="dark"]) .okt-view[data-accent="sky"],        :global([data-theme="dark"]) .accent-swatch[data-accent="sky"]        { --accent-bg: #1A222A; --accent-text: #B0C5D8; }
:global([data-theme="dark"]) .okt-view[data-accent="olive"],      :global([data-theme="dark"]) .accent-swatch[data-accent="olive"]      { --accent-bg: #2A241A; --accent-text: #D9C99E; }

.okt-view {
  max-width: 640px;
  margin: 0 auto;
  padding: var(--ds-space-md) var(--ds-space-lg) var(--ds-space-2xl);
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

/* ---- Immersiv header ---- */
.hero {
  background: var(--accent-bg);
  color: var(--accent-text);
  border-radius: var(--ds-radius-lg);
  padding: var(--ds-space-2xl) var(--ds-space-xl);
  margin-bottom: var(--ds-space-2xl);
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
}

.hero__eyebrow {
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-wider);
  text-transform: uppercase;
  opacity: 0.75;
}

.hero__title {
  font-family: var(--ds-font-display);
  font-size: clamp(2.4rem, 8vw, 3.4rem);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-tighter);
  line-height: 1.02;
  margin: 0;
  font-variation-settings: var(--ds-font-display-settings);
}

.hero__focus {
  font-family: var(--ds-font-display);
  font-size: var(--ds-text-lg);
  font-weight: var(--ds-weight-regular);
  line-height: 1.4;
  letter-spacing: -0.01em;
  margin: var(--ds-space-sm) 0 0;
  max-width: 40ch;
}

.hero__meta {
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-medium);
  letter-spacing: var(--ds-tracking-wider);
  text-transform: uppercase;
  opacity: 0.7;
  margin-top: var(--ds-space-sm);
}

/* ---- Øvelser ---- */
.drills {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-xl);
}

.drill {
  display: flex;
  gap: var(--ds-space-md);
  align-items: flex-start;
}

.drill__badge {
  flex-shrink: 0;
  margin-top: 3px;
  padding: 3px 10px;
  border-radius: var(--ds-radius-sm);
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-wider);
  text-transform: uppercase;
}

.drill__badge--diff { background: #E2EDDE; color: #3D5C44; }
.drill__badge--mix  { background: #F8E8E0; color: #7A3A24; }

:global([data-theme="dark"]) .drill__badge--diff { background: #1A241D; color: #B5D2B0; }
:global([data-theme="dark"]) .drill__badge--mix  { background: #2A1E18; color: #F4C4A8; }

.drill__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
}

.drill__text {
  font-size: var(--ds-text-lg);
  line-height: 1.55;
  color: var(--ds-color-text-primary);
  margin: 0;
  letter-spacing: -0.01em;
  white-space: pre-wrap;
}

.drill__link {
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

.drill__link svg { width: 15px; height: 15px; flex-shrink: 0; }
.drill__link:active { transform: scale(0.98); }

.okt-view__empty {
  text-align: center;
  padding: var(--ds-space-2xl) 0;
  color: var(--ds-color-text-tertiary);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ds-space-md);
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

:global([data-theme="dark"]) .type-toggle__opt--diff.type-toggle__opt--active { background: #1A241D; color: #B5D2B0; }
:global([data-theme="dark"]) .type-toggle__opt--mix.type-toggle__opt--active  { background: #2A1E18; color: #F4C4A8; }

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
