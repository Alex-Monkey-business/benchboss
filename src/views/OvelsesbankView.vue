<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useExercises, EXERCISE_CATEGORIES, groupByCategory } from '../composables/useExercises'
import Sheet from '../components/Sheet.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import ExerciseFields from '../components/ExerciseFields.vue'

const router = useRouter()
const { exercises, supportsCategory, fetchExercises, createExercise, updateExercise, deleteExercise } = useExercises()

// Ekte tilbake: dit du kom fra (perioden, en økt …); /trening som fallback.
function goBack() {
  if (window.history.state?.back) router.back()
  else router.push('/trening')
}

const search = ref('')
const showSearch = computed(() => exercises.value.length > 8)

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return exercises.value
  return exercises.value.filter(e =>
    e.name.toLowerCase().includes(q) || (e.tema || '').toLowerCase().includes(q)
  )
})

const grouped = computed(() =>
  supportsCategory.value
    ? groupByCategory(filtered.value)
    : [{ value: 'alle', label: '', items: filtered.value }]
)

// ---- Detalj-sheet: visning først, redigering er sekundært ----
const showSheet = ref(false)
const mode = ref('view') // 'view' | 'edit' | 'new'
const activeId = ref(null)
const saving = ref(false)
const form = ref(emptyForm())

const active = computed(() => exercises.value.find(e => e.id === activeId.value) || null)
const categoryLabel = computed(() =>
  EXERCISE_CATEGORIES.find(c => c.value === active.value?.category)?.label || ''
)

function emptyForm() {
  return { name: '', type: 'none', category: '', tema: '', organisering: '', laeringsmomenter: '', link: { label: '', url: '' } }
}

function openView(ex) {
  activeId.value = ex.id
  mode.value = 'view'
  showSheet.value = true
}

function openNew() {
  activeId.value = null
  form.value = emptyForm()
  mode.value = 'new'
  showSheet.value = true
}

function startEdit() {
  const ex = active.value
  form.value = {
    name: ex.name,
    type: ex.type || 'none',
    category: ex.category || '',
    tema: ex.tema || '',
    organisering: ex.organisering || '',
    laeringsmomenter: (ex.laeringsmomenter || []).join('\n'),
    link: ex.link ? { label: ex.link.label || '', url: ex.link.url || '' } : { label: '', url: '' }
  }
  mode.value = 'edit'
}

async function save() {
  if (!form.value.name.trim() || saving.value) return
  saving.value = true
  const payload = {
    name: form.value.name.trim(),
    type: form.value.type,
    tema: form.value.tema.trim() || null,
    organisering: form.value.organisering.trim() || null,
    laeringsmomenter: form.value.laeringsmomenter.split('\n').map(s => s.trim()).filter(Boolean),
    link: form.value.link.url.trim() ? { label: form.value.link.label.trim(), url: form.value.link.url.trim() } : null
  }
  if (supportsCategory.value) payload.category = form.value.category || null
  if (mode.value === 'edit') {
    await updateExercise(activeId.value, payload)
    mode.value = 'view'
  } else {
    const row = await createExercise(payload)
    if (row) {
      activeId.value = row.id
      mode.value = 'view'
    } else {
      showSheet.value = false
    }
  }
  saving.value = false
}

function closeSheet() {
  showSheet.value = false
  mode.value = 'view'
}

// ---- Slett (kun her — å slette fra banken er ekte sletting) ----
const showDelete = ref(false)

async function confirmDelete() {
  await deleteExercise(activeId.value)
  showDelete.value = false
  showSheet.value = false
}

onMounted(fetchExercises)
</script>

<template>
  <div class="bank">
    <div class="bank__nav">
      <button type="button" class="back-btn" @click="goBack">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Tilbake
      </button>
    </div>

    <!-- «Ny øvelse» ligger øverst: det var det Alex ikke fant da den lå
         under en liste som kan bli hundre rader lang. -->
    <header class="bank__head">
      <div class="bank__head-text">
        <h1 class="bank__title">Øvelsesbank</h1>
        <p class="bank__count">{{ exercises.length }} {{ exercises.length === 1 ? 'øvelse' : 'øvelser' }}</p>
      </div>
      <button v-if="exercises.length" type="button" class="ds-btn ds-btn--primary bank__new" @click="openNew">
        Ny øvelse
      </button>
    </header>

    <input
      v-if="showSearch"
      v-model="search"
      class="ds-input bank__search"
      type="search"
      placeholder="Søk i øvelser"
    />

    <div v-if="exercises.length === 0" class="ds-empty">
      <img src="/illustrations/bench-boss-feature-icons/512/training-plan-transparent.png" alt="" class="ds-empty__illo" />
      <div class="ds-empty__title">Ingen øvelser ennå</div>
      <div class="ds-empty__description">Øvelser du lager i øktene havner her automatisk.</div>
      <button type="button" class="ds-btn ds-btn--primary ds-empty__action" @click="openNew">Ny øvelse</button>
    </div>

    <template v-else>
      <div v-for="group in grouped" :key="group.value" class="bank__group">
        <div v-if="group.label" class="bank__group-label">{{ group.label }}</div>
        <div class="bank__list">
          <button v-for="ex in group.items" :key="ex.id" type="button" class="bank-row" @click="openView(ex)">
            <span
              v-if="ex.type && ex.type !== 'none'"
              class="bank-row__badge"
              :class="`bank-row__badge--${ex.type}`"
            >{{ ex.type === 'diff' ? 'Diff' : 'Mix' }}</span>
            <span class="bank-row__body">
              <span class="bank-row__name">{{ ex.name }}</span>
              <span v-if="ex.tema" class="bank-row__tema">{{ ex.tema }}</span>
            </span>
            <svg class="bank-row__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>
      <p v-if="!filtered.length" class="bank__no-hits">Ingen treff på «{{ search }}»</p>
    </template>

    <!-- Detalj: visning først, redigering sekundært -->
    <Sheet :show="showSheet" :title="mode === 'new' ? 'Ny øvelse' : mode === 'edit' ? 'Rediger øvelse' : (active?.name || '')" @close="closeSheet">
      <!-- VISNING -->
      <template v-if="mode === 'view' && active">
        <div class="ex-view">
          <div v-if="(active.type && active.type !== 'none') || categoryLabel" class="ex-view__head">
            <span
              v-if="active.type && active.type !== 'none'"
              class="bank-row__badge"
              :class="`bank-row__badge--${active.type}`"
            >{{ active.type === 'diff' ? 'Diff' : 'Mix' }}</span>
            <span v-if="categoryLabel" class="ex-view__category">{{ categoryLabel }}</span>
          </div>
          <p v-if="active.tema" class="ex-view__tema">{{ active.tema }}</p>

          <div v-if="(active.laeringsmomenter || []).length" class="ex-view__section">
            <div class="ex-view__label">Øver på</div>
            <ul class="ex-view__points">
              <li v-for="(p, i) in active.laeringsmomenter" :key="i">{{ p }}</li>
            </ul>
          </div>

          <div v-if="active.organisering" class="ex-view__section">
            <div class="ex-view__label">Oppsett</div>
            <p class="ex-view__text">{{ active.organisering }}</p>
          </div>

          <a
            v-if="active.link && active.link.url"
            :href="active.link.url"
            target="_blank"
            rel="noopener"
            class="ex-view__link"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            {{ active.link.label || active.link.url }}
          </a>

          <button type="button" class="ds-btn ds-btn--secondary ds-btn--lg ex-view__edit" @click="startEdit">
            Rediger
          </button>
        </div>
      </template>

      <!-- REDIGERING / NY -->
      <form v-else @submit.prevent="save">
        <ExerciseFields :form="form" :show-category="supportsCategory" />
        <div class="bank__form-actions">
          <button
            v-if="mode === 'edit'"
            type="button"
            class="ds-btn ds-btn--ghost bank__delete"
            @click="showDelete = true"
          >
            Slett
          </button>
          <button type="submit" class="ds-btn ds-btn--primary ds-btn--lg bank__save" :disabled="!form.name.trim() || saving">
            {{ saving ? 'Lagrer…' : mode === 'edit' ? 'Lagre endringer' : 'Legg i banken' }}
          </button>
        </div>
      </form>
    </Sheet>

    <ConfirmDialog
      :show="showDelete"
      title="Slett øvelse?"
      :message="`«${active?.name}» fjernes fra banken. Økter som bruker den beholder sin kopi.`"
      confirm-label="Slett"
      variant="warning"
      @confirm="confirmDelete"
      @cancel="showDelete = false"
    />
  </div>
</template>

<style scoped>
.bank {
  max-width: 640px;
  margin: 0 auto;
  padding: var(--ds-space-md) var(--ds-space-lg) var(--ds-space-2xl);
}

.bank__nav { margin-bottom: var(--ds-space-xl); }

.bank__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--ds-space-md);
  margin-bottom: var(--ds-space-lg);
}

.bank__head-text { min-width: 0; }
.bank__new { flex-shrink: 0; }

.bank__title {
  font-family: var(--ds-font-display);
  font-size: clamp(2rem, 6.5vw, 2.8rem);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-tighter);
  line-height: 1.1;
  color: var(--ds-color-text-primary);
  font-variation-settings: var(--ds-font-display-settings);
  margin: 0 0 4px;
}

.bank__count {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-tertiary);
  margin: 0;
  font-variant-numeric: tabular-nums;
}

.bank__search {
  width: 100%;
  margin-bottom: var(--ds-space-md);
}

.bank__group { margin-bottom: var(--ds-space-lg); }

.bank__group-label {
  font-size: var(--ds-text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ds-color-text-tertiary);
  padding: 0 4px;
  margin-bottom: 8px;
}

.bank__list {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
}

.bank-row {
  display: flex;
  align-items: center;
  gap: var(--ds-space-md);
  width: 100%;
  padding: 14px var(--ds-space-md);
  background: var(--ds-color-bg-elevated);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-lg);
  cursor: pointer;
  text-align: left;
  font-family: var(--ds-font-body);
  -webkit-tap-highlight-color: transparent;
  transition: border-color var(--ds-duration-fast) var(--ds-ease-out), transform var(--ds-duration-fast) var(--ds-ease-out);
}

.bank-row:active { transform: scale(0.99); }

@media (hover: hover) and (pointer: fine) {
  .bank-row:hover { border-color: var(--ds-color-border-strong); }
}

.bank-row__badge {
  flex-shrink: 0;
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: var(--ds-radius-sm);
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.bank-row__badge--diff { background: #E2EDDE; color: #3D5C44; }
.bank-row__badge--mix { background: #F8E8E0; color: #7A3A24; }
:global([data-theme="dark"] .bank-row__badge--diff) { background: #1A241D; color: #B5D2B0; }
:global([data-theme="dark"] .bank-row__badge--mix) { background: #2A1E18; color: #F4C4A8; }

.bank-row__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.bank-row__name {
  font-weight: var(--ds-weight-semibold);
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-primary);
}

.bank-row__tema {
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bank-row__chevron {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--ds-color-text-tertiary);
}

.bank__no-hits {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-tertiary);
  text-align: center;
  padding: var(--ds-space-lg) 0;
  margin: 0;
}


/* ---- Visning av øvelse ---- */
.ex-view {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-md);
}

.ex-view__head {
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
}

.ex-view__tema {
  font-size: var(--ds-text-md);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-warm-text);
  margin: 0;
}

.ex-view__section { margin: 0; }

.ex-view__label {
  font-size: var(--ds-text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ds-color-text-tertiary);
  margin-bottom: 4px;
}

.ex-view__points {
  margin: 0;
  padding-left: 1.2em;
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-primary);
  line-height: 1.6;
}

.ex-view__text {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-primary);
  line-height: 1.55;
  margin: 0;
}

.ex-view__link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--ds-text-sm);
  font-weight: 500;
  color: var(--ds-color-accent);
  text-decoration: none;
}

.ex-view__link svg { width: 15px; height: 15px; }

.ex-view__category {
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-full);
  padding: 2px 8px;
}

.ex-view__edit { width: 100%; margin-top: var(--ds-space-sm); }

.bank__form-actions {
  display: flex;
  gap: var(--ds-space-sm);
  margin-top: var(--ds-space-sm);
}

.bank__delete { flex-shrink: 0; color: var(--ds-color-error); }
.bank__save { flex: 1; }

</style>
