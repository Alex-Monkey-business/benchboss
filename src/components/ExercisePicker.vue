<script setup>
import { ref, computed, watch } from 'vue'
import { useExercises, groupByCategory } from '../composables/useExercises'
import Sheet from './Sheet.vue'

// Plukk øvelser fra banken inn i en økt — toggle av/på. Å ta en øvelse ut av
// økta sletter ingenting: den ligger fortsatt i banken. Sheeten blir stående
// åpen så hele økta kan settes sammen i ett besøk.
const props = defineProps({
  show: { type: Boolean, default: false },
  currentDrills: { type: Array, default: () => [] }
})

const emit = defineEmits(['close', 'toggle', 'create'])

const { exercises, loaded, fetchExercises } = useExercises()

const search = ref('')

watch(() => props.show, (open) => {
  if (open) {
    search.value = ''
    if (!loaded.value) fetchExercises()
  }
})

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return exercises.value
  return exercises.value.filter(e =>
    e.name.toLowerCase().includes(q) || (e.tema || '').toLowerCase().includes(q)
  )
})

const grouped = computed(() => groupByCategory(filtered.value))

const selectedCount = computed(() => exercises.value.filter(isInSession).length)

// Finnes ikke øvelsen, lager søket den. Da trengs ingen egen «skriv selv»-vei
// inn i økta — og du havner aldri i en blindvei med null treff.
const newName = computed(() => search.value.trim())

const canCreate = computed(() =>
  newName.value.length > 1 &&
  !exercises.value.some(e => e.name.trim().toLowerCase() === newName.value.toLowerCase())
)

function create() {
  emit('create', newName.value)
  search.value = ''
}

// I økta? Match på opphav (exercise_id), fallback navn for eldre drills.
function isInSession(ex) {
  return props.currentDrills.some(d =>
    d.exercise_id === ex.id || (d.text || '').trim().toLowerCase() === ex.name.trim().toLowerCase()
  )
}
</script>

<template>
  <Sheet :show="show" :title="selectedCount ? `Øvelser · ${selectedCount} valgt` : 'Øvelser'" @close="emit('close')">
    <input
      v-model="search"
      class="ds-input picker-search"
      type="search"
      placeholder="Søk — eller skriv navnet på en ny"
    />

    <button v-if="canCreate" type="button" class="picker-create" @click="create">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      <span>Lag «{{ newName }}»</span>
    </button>

    <p v-if="!exercises.length && !canCreate" class="picker-no-hits">
      Ingen øvelser i banken ennå — skriv et navn over for å lage den første.
    </p>

    <template v-if="exercises.length">
      <div v-for="group in grouped" :key="group.value" class="picker-group">
        <div class="picker-group__label">{{ group.label }}</div>
        <div class="picker-list">
        <button
          v-for="ex in group.items"
          :key="ex.id"
          type="button"
          class="picker-row"
          :class="{ 'picker-row--selected': isInSession(ex) }"
          :aria-pressed="isInSession(ex)"
          @click="emit('toggle', ex)"
        >
          <span
            v-if="ex.type && ex.type !== 'none'"
            class="picker-row__badge"
            :class="`picker-row__badge--${ex.type}`"
          >{{ ex.type === 'diff' ? 'Diff' : 'Mix' }}</span>
          <span class="picker-row__body">
            <span class="picker-row__name">{{ ex.name }}</span>
            <span v-if="ex.tema" class="picker-row__tema">{{ ex.tema }}</span>
          </span>
          <svg v-if="isInSession(ex)" class="picker-row__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          <svg v-else class="picker-row__plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        </div>
      </div>
      <p v-if="!filtered.length && !canCreate" class="picker-no-hits">Ingen treff på «{{ search }}»</p>
    </template>

    <button type="button" class="ds-btn ds-btn--primary ds-btn--lg picker-done" @click="emit('close')">
      Ferdig
    </button>
  </Sheet>
</template>

<style scoped>
/* Søket lager øvelsen når den ikke finnes — ingen blindvei ved null treff. */
.picker-create {
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
  width: 100%;
  padding: 12px;
  margin-bottom: var(--ds-space-sm);
  background: var(--ds-color-bg-elevated);
  border: 1px dashed var(--ds-color-border-strong);
  border-radius: var(--ds-radius-md);
  cursor: pointer;
  text-align: left;
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-primary);
  -webkit-tap-highlight-color: transparent;
  transition: border-color var(--ds-duration-fast) var(--ds-ease-out), transform var(--ds-duration-fast) var(--ds-ease-out);
}

.picker-create svg { width: 16px; height: 16px; flex-shrink: 0; color: var(--ds-color-text-tertiary); }
.picker-create:active { transform: scale(0.99); }
.picker-create span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.picker-search {
  width: 100%;
  margin-bottom: var(--ds-space-sm);
}

.picker-group + .picker-group { margin-top: var(--ds-space-md); }

.picker-group__label {
  font-size: var(--ds-text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ds-color-text-tertiary);
  padding: 0 4px;
  margin-bottom: 6px;
}

.picker-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.picker-row {
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
  width: 100%;
  padding: 12px;
  background: var(--ds-color-bg-subtle);
  border: 1px solid transparent;
  border-radius: var(--ds-radius-md);
  cursor: pointer;
  text-align: left;
  font-family: var(--ds-font-body);
  -webkit-tap-highlight-color: transparent;
  transition:
    background-color var(--ds-duration-fast) var(--ds-ease-out),
    border-color var(--ds-duration-fast) var(--ds-ease-out),
    transform var(--ds-duration-fast) var(--ds-ease-out);
}

.picker-row:active { transform: scale(0.99); }

@media (hover: hover) and (pointer: fine) {
  .picker-row:hover { border-color: var(--ds-color-border-strong); }
}

.picker-row--selected {
  background: var(--ds-color-accent-light);
  border-color: var(--ds-color-accent);
}

.picker-row__badge {
  flex-shrink: 0;
  font-size: 0.65rem;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: var(--ds-radius-sm);
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.picker-row__badge--diff { background: #E2EDDE; color: #3D5C44; }
.picker-row__badge--mix { background: #F8E8E0; color: #7A3A24; }
:global([data-theme="dark"] .picker-row__badge--diff) { background: #1A241D; color: #B5D2B0; }
:global([data-theme="dark"] .picker-row__badge--mix) { background: #2A1E18; color: #F4C4A8; }

.picker-row__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.picker-row__name {
  font-weight: var(--ds-weight-semibold);
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-primary);
}

.picker-row__tema {
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.picker-row__check {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--ds-color-accent);
}

.picker-row__plus {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--ds-color-text-tertiary);
}

.picker-no-hits {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-tertiary);
  text-align: center;
  padding: var(--ds-space-md) 0;
  margin: 0;
}

.picker-done {
  width: 100%;
  margin-top: var(--ds-space-md);
}
</style>
