<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useTrainingPeriods } from '../composables/useTrainingPeriods'
import { useTrainingSessions, DEFAULT_WEEK_SESSIONS } from '../composables/useTrainingSessions'
import { localISODate } from '../lib/dateLabels'
import Sheet from '../components/Sheet.vue'
import Skeleton from '../components/Skeleton.vue'

const router = useRouter()
const { periods, fetchPeriods, createPeriod } = useTrainingPeriods()
const { createSession } = useTrainingSessions()

const ACCENTS = [
  { value: 'warm',       label: 'Varm' },
  { value: 'sage',       label: 'Salvie' },
  { value: 'cornflower', label: 'Kornblå' },
  { value: 'peach',      label: 'Fersken' },
  { value: 'sky',        label: 'Himmel' },
  { value: 'olive',      label: 'Oliven' }
]

const deciding = ref(true) // mens vi avgjør hvilken periode vi lander på
const showSheet = ref(false)
const form = ref(emptyForm())
const saving = ref(false)

function emptyForm() {
  return { title: '', lead: '', accent: 'warm', start_date: '', end_date: '' }
}

// Aktuell periode = dekker dagens dato; ellers nyeste (siste start_date),
// til slutt den sist opprettede i lista.
function pickCurrentPeriod() {
  const ps = periods.value
  if (!ps.length) return null
  const today = localISODate()
  const inRange = ps.find(p => p.start_date && p.end_date && p.start_date <= today && today <= p.end_date)
  if (inRange) return inRange
  const openEnded = ps
    .filter(p => p.start_date && !p.end_date && p.start_date <= today)
    .sort((a, b) => b.start_date.localeCompare(a.start_date))[0]
  if (openEnded) return openEnded
  const withStart = ps.filter(p => p.start_date).sort((a, b) => b.start_date.localeCompare(a.start_date))
  return withStart[0] || ps[ps.length - 1]
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
  // Fast ukeoppsett: tirsdag, torsdag og lørdag ligger klare i nye perioder.
  if (row) {
    for (const [i, tpl] of DEFAULT_WEEK_SESSIONS.entries()) {
      await createSession(row.id, { ...tpl, drills: [], position: i })
    }
  }
  saving.value = false
  showSheet.value = false
  if (row) router.replace(`/trening/${row.id}`)
}

onMounted(async () => {
  await fetchPeriods()
  const current = pickCurrentPeriod()
  if (current) router.replace(`/trening/${current.id}`)
  else deciding.value = false
})
</script>

<template>
  <div class="treningsplan">
    <!-- Avgjør hvilken periode vi lander på -->
    <div v-if="deciding" class="treningsplan__list">
      <Skeleton v-for="n in 3" :key="n" height="76px" radius="var(--ds-radius-lg)" />
    </div>

    <!-- Tom tilstand — ingen perioder ennå -->
    <div v-else class="ds-empty">
      <img src="/illustrations/bench-boss-feature-icons/512/training-plan-transparent.png" alt="" class="ds-empty__illo" />
      <div class="ds-empty__title">Ingen perioder ennå</div>
      <div class="ds-empty__description">Lag den første perioden og legg inn øktene fra Messenger.</div>
      <button type="button" class="ds-btn ds-btn--primary ds-empty__action" @click="openSheet">Ny periode</button>
    </div>

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
        <p class="seed-hint">Tirsdag, torsdag og lørdag legges inn automatisk.</p>
        <button type="submit" class="ds-btn ds-btn--primary ds-btn--lg" :disabled="!form.title.trim() || saving" style="width: 100%; margin-top: var(--ds-space-sm);">
          {{ saving ? 'Lagrer…' : 'Opprett periode' }}
        </button>
      </form>
    </Sheet>
  </div>
</template>

<style scoped>
.accent-swatch[data-accent="warm"]       { --accent-bg: #F8E8E0; --accent-text: #7A3A24; }
.accent-swatch[data-accent="sage"]       { --accent-bg: #E2EDDE; --accent-text: #3D5C44; }
.accent-swatch[data-accent="cornflower"] { --accent-bg: #D6DDEF; --accent-text: #3D456B; }
.accent-swatch[data-accent="peach"]      { --accent-bg: #F8E8E0; --accent-text: #7A3A24; }
.accent-swatch[data-accent="sky"]        { --accent-bg: #DDE6EC; --accent-text: #3A4C5C; }
.accent-swatch[data-accent="olive"]      { --accent-bg: #F0E7D6; --accent-text: #6B5630; }

:global([data-theme="dark"] .accent-swatch[data-accent="warm"]) { --accent-bg: #2A1E18; --accent-text: #F4C4A8; }
:global([data-theme="dark"] .accent-swatch[data-accent="sage"]) { --accent-bg: #1A241D; --accent-text: #B5D2B0; }
:global([data-theme="dark"] .accent-swatch[data-accent="cornflower"]) { --accent-bg: #1A1F33; --accent-text: #B9C2E5; }
:global([data-theme="dark"] .accent-swatch[data-accent="peach"]) { --accent-bg: #2A1E18; --accent-text: #F4C4A8; }
:global([data-theme="dark"] .accent-swatch[data-accent="sky"]) { --accent-bg: #1A222A; --accent-text: #B0C5D8; }
:global([data-theme="dark"] .accent-swatch[data-accent="olive"]) { --accent-bg: #2A241A; --accent-text: #D9C99E; }

.treningsplan {
  max-width: 680px;
  margin: 0 auto;
  padding: var(--ds-space-md) var(--ds-space-lg) var(--ds-space-2xl);
}

.treningsplan__list {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
}

.seed-hint {
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-tertiary);
  margin: 0 0 var(--ds-space-sm);
  line-height: 1.5;
}

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
.accent-swatch--active { border-color: var(--accent-text); }
</style>
