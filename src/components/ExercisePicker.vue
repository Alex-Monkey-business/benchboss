<script setup>
import { ref, computed, watch } from 'vue'
import { useExercises, groupByCategory, kullAlder, passerAlder } from '../composables/useExercises'
import { useAuth } from '../stores/auth'
import Sheet from './Sheet.vue'
import ExerciseFields from './ExerciseFields.vue'

// Plukk øvelser fra banken inn i en økt — toggle av/på. Å ta en øvelse ut av
// økta sletter ingenting: den ligger fortsatt i banken. Sheeten blir stående
// åpen så hele økta kan settes sammen i ett besøk.
//
// Her plukker du. Du redigerer ikke: innholdet i en øvelse hører hjemme i
// banken. Eneste unntaket er å lage en ny — det er alltid et skjema, og det
// er greit, for du vet at du lager noe.
const props = defineProps({
  show: { type: Boolean, default: false },
  currentDrills: { type: Array, default: () => [] },
  // Hvilken dag plukker vi til? Uten den mister sheeten konteksten når hele
  // uka står bak den og tre dager ser like ut.
  titlePrefix: { type: String, default: '' }
})

const emit = defineEmits(['close', 'toggle', 'create'])

const { exercises, loaded, supportsCategory, supportsGruppe, fetchExercises } = useExercises()

const search = ref('')
const mode = ref('list') // 'list' | 'new'
const newForm = ref(emptyForm())

function emptyForm() {
  return { name: '', type: 'none', category: '', tema: '', gruppe: '', organisering: '', laeringsmomenter: '', se_etter: '', si_til_barna: '', vanlige_feil: '', min_spillere: null, maks_spillere: null, utstyr_tags: [], plass: null, min_alder: null, link: { label: '', url: '' } }
}

watch(() => props.show, (open) => {
  if (open) {
    search.value = ''
    mode.value = 'list'
    if (!loaded.value) fetchExercises()
  }
})

// Samme aldersregel som i banken, og den betyr mer her: dette er flata der du
// faktisk velger hva ungene skal gjøre på tirsdag.
const { activeCohort } = useAuth()
const alder = computed(() => kullAlder(activeCohort.value))
const visForEldre = ref(false)

const forEldre = computed(() =>
  alder.value == null ? [] : exercises.value.filter(e => !passerAlder(e, alder.value))
)

const forEldreFra = computed(() => {
  const tall = forEldre.value.map(e => e.min_alder).filter(Boolean)
  return tall.length ? Math.min(...tall) : null
})

// En øvelse som ALT ligger i dagen blir aldri skjult, uansett alder. Å plukke
// den bort fra lista fordi kullet er for ungt ville gjort den umulig å fjerne.
const synlige = computed(() =>
  visForEldre.value
    ? exercises.value
    : exercises.value.filter(e => passerAlder(e, alder.value) || isInSession(e))
)

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return synlige.value
  return synlige.value.filter(e =>
    e.name.toLowerCase().includes(q) ||
    (e.tema || '').toLowerCase().includes(q) ||
    (e.organisering || '').toLowerCase().includes(q) ||
    (e.gruppe || '').toLowerCase().includes(q)
  )
})

const grouped = computed(() => groupByCategory(filtered.value))

const selectedCount = computed(() => exercises.value.filter(isInSession).length)

const sheetTitle = computed(() => {
  if (mode.value === 'new') return 'Ny øvelse'
  const dag = props.titlePrefix ? `Øvelser · ${props.titlePrefix}` : 'Øvelser'
  return selectedCount.value ? `${dag} · ${selectedCount.value} valgt` : dag
})

// Finnes ikke øvelsen, lager søket den — med navnet ferdig utfylt.
const newName = computed(() => search.value.trim())

const canCreate = computed(() =>
  newName.value.length > 1 &&
  !exercises.value.some(e => e.name.trim().toLowerCase() === newName.value.toLowerCase())
)

function startNew() {
  newForm.value = { ...emptyForm(), name: newName.value }
  mode.value = 'new'
}

function submitNew() {
  if (!newForm.value.name.trim()) return
  emit('create', { ...newForm.value })
  search.value = ''
  mode.value = 'list'
}

// I økta? Match på opphav (exercise_id), fallback navn for eldre drills.
function isInSession(ex) {
  return props.currentDrills.some(d =>
    d.exercise_id === ex.id || (d.text || '').trim().toLowerCase() === ex.name.trim().toLowerCase()
  )
}

// Kort forhåndsvisning så du vet hva du plukker uten å åpne noe.
function preview(ex) {
  return ex.organisering || (ex.laeringsmomenter || []).join(' · ') || ''
}
</script>

<template>
  <Sheet
    :show="show"
    :title="sheetTitle"
    @close="emit('close')"
  >
    <!-- NY ØVELSE — det eneste skjemaet i plukkeren -->
    <form v-if="mode === 'new'" @submit.prevent="submitNew">
      <ExerciseFields :form="newForm" :show-category="supportsCategory" :show-gruppe="supportsGruppe" />
      <div class="picker-form-actions">
        <button type="button" class="ds-btn ds-btn--ghost" @click="mode = 'list'">Avbryt</button>
        <button type="submit" class="ds-btn ds-btn--primary ds-btn--lg picker-form-actions__save" :disabled="!newForm.name.trim()">
          Legg i banken og dagen
        </button>
      </div>
    </form>

    <!-- PLUKK -->
    <template v-else>
      <input
        v-model="search"
        class="ds-input picker-search"
        type="search"
        placeholder="Søk — eller skriv navnet på en ny"
      />

      <button v-if="canCreate" type="button" class="picker-create" @click="startNew">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span>Lag «{{ newName }}»</span>
      </button>

      <button
        v-if="forEldre.length && !visForEldre"
        type="button"
        class="picker-eldre"
        @click="visForEldre = true"
      >
        {{ forEldre.length }} {{ forEldre.length === 1 ? 'øvelse' : 'øvelser' }}
        anbefalt fra {{ forEldreFra }} år — vis {{ forEldre.length === 1 ? 'den' : 'dem' }}
      </button>
      <button
        v-else-if="forEldre.length && visForEldre"
        type="button"
        class="picker-eldre"
        @click="visForEldre = false"
      >
        Vis bare det som passer kullet
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
              <span class="picker-row__body">
                <span class="picker-row__head">
                  <span
                    v-if="ex.type && ex.type !== 'none'"
                    class="picker-row__badge"
                    :class="`picker-row__badge--${ex.type}`"
                  >{{ ex.type === 'diff' ? 'Diff' : 'Mix' }}</span>
                  <span class="picker-row__name">{{ ex.name }}</span>
                </span>
                <span v-if="ex.tema" class="picker-row__tema">{{ ex.tema }}</span>
                <span v-if="preview(ex)" class="picker-row__preview">{{ preview(ex) }}</span>
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

      <!-- Redigering og sletting hører hjemme i banken, ikke her. -->
      <router-link to="/trening/ovelser" class="picker-bank-link" @click="emit('close')">
        Rediger øvelser i banken
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </router-link>
    </template>
  </Sheet>
</template>

<style scoped>
.picker-eldre {
  display: block;
  width: 100%;
  margin-top: var(--ds-space-md);
  padding: var(--ds-space-sm) var(--ds-space-md);
  background: var(--ds-color-bg-subtle);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-md);
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
  text-align: left;
  cursor: pointer;
}

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

.picker-form-actions {
  display: flex;
  gap: var(--ds-space-sm);
  margin-top: var(--ds-space-sm);
}

.picker-form-actions__save { flex: 1; }

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
  align-items: flex-start;
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

.picker-row__head {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
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
.picker-row__badge--diff { background: var(--accent-bg, var(--ds-badge-bg)); color: var(--accent-text, var(--ds-badge-text)); }
.picker-row__badge--mix { background: transparent; color: var(--accent-text, var(--ds-badge-text)); box-shadow: inset 0 0 0 1px currentColor; }

.picker-row__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.picker-row__name {
  font-weight: var(--ds-weight-semibold);
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-primary);
  min-width: 0;
}

.picker-row__tema {
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-warm-text);
}

/* Så du vet hva du plukker uten å måtte åpne noe. */
.picker-row__preview {
  font-size: var(--ds-text-xs);
  line-height: 1.45;
  color: var(--ds-color-text-tertiary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.picker-row__check {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--ds-color-accent);
}

.picker-row__plus {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  margin-top: 2px;
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

.picker-bank-link {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin-top: var(--ds-space-md);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-secondary);
  text-decoration: none;
}

.picker-bank-link svg { width: 14px; height: 14px; }
</style>
