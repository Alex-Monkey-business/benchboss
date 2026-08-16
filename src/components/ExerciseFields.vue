<script setup>
// Én øvelse — ett sett felt. Samme skjema enten du redigerer den i banken
// eller i en økt, så du aldri må lære to versjoner av samme greie.
import { EXERCISE_CATEGORIES } from '../composables/useExercises'

const props = defineProps({
  form: { type: Object, required: true },
  showCategory: { type: Boolean, default: false }
})

const DRILL_TYPES = [
  { value: 'diff', label: 'Diff' },
  { value: 'mix', label: 'Mix' },
  { value: 'none', label: '—' }
]

function pickCategory(value) {
  props.form.category = props.form.category === value ? '' : value
}
</script>

<template>
  <div class="ds-form-group">
    <label class="ds-label" for="ex-name">Navn</label>
    <input id="ex-name" v-model="form.name" class="ds-input" type="text" placeholder="F.eks. Rondo 4v1" required />
  </div>

  <div v-if="showCategory" class="ds-form-group">
    <label class="ds-label">Kategori</label>
    <div class="cat-pills">
      <button
        v-for="c in EXERCISE_CATEGORIES"
        :key="c.value"
        type="button"
        :class="['cat-pill', { 'cat-pill--active': form.category === c.value }]"
        @click="pickCategory(c.value)"
      >{{ c.label }}</button>
    </div>
  </div>

  <div class="ds-form-group">
    <label class="ds-label">Type</label>
    <div class="type-toggle" role="radiogroup" aria-label="Type øvelse">
      <button
        v-for="t in DRILL_TYPES"
        :key="t.value"
        type="button"
        role="radio"
        :aria-checked="form.type === t.value"
        :class="['type-toggle__opt', `type-toggle__opt--${t.value}`, { 'type-toggle__opt--active': form.type === t.value }]"
        @click="form.type = t.value"
      >{{ t.label }}</button>
    </div>
  </div>

  <div class="ds-form-group">
    <label class="ds-label" for="ex-tema">Fokus</label>
    <input id="ex-tema" v-model="form.tema" class="ds-input" type="text" placeholder="F.eks. Spille oss fremover (valgfri)" />
  </div>

  <div class="ds-form-group">
    <label class="ds-label" for="ex-moments">Øver på — ett per linje</label>
    <textarea id="ex-moments" v-model="form.laeringsmomenter" class="ds-input" rows="3" placeholder="Mykt medtak ut til siden&#10;Løft blikket (valgfri)"></textarea>
  </div>

  <div class="ds-form-group">
    <label class="ds-label" for="ex-org">Oppsett</label>
    <textarea id="ex-org" v-model="form.organisering" class="ds-input" rows="3" placeholder="Hvordan øvelsen settes opp og kjøres (valgfri)."></textarea>
  </div>

  <div class="ds-form-group">
    <label class="ds-label">Lenke</label>
    <div class="link-row">
      <input v-model="form.link.label" class="ds-input" type="text" placeholder="Lenketekst (valgfri)" />
      <input v-model="form.link.url" class="ds-input" type="url" placeholder="https://… (valgfri)" />
    </div>
  </div>
</template>

<style scoped>
.cat-pills {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ds-space-sm);
}

.cat-pill {
  border: 1px solid var(--ds-color-border);
  background: var(--ds-color-bg-elevated);
  padding: 7px 12px;
  border-radius: var(--ds-radius-full);
  font-size: var(--ds-text-xs);
  font-weight: 600;
  color: var(--ds-color-text-secondary);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: all var(--ds-duration-fast) var(--ds-ease-out);
}

.cat-pill--active {
  background: var(--ds-color-accent);
  border-color: var(--ds-color-accent);
  color: var(--ds-color-accent-text);
}

.type-toggle {
  display: inline-flex;
  gap: 4px;
  padding: 3px;
  background: var(--ds-color-bg-subtle);
  border-radius: var(--ds-radius-md);
}

.type-toggle__opt {
  border: none;
  background: transparent;
  padding: 6px 14px;
  border-radius: var(--ds-radius-sm);
  font-size: var(--ds-text-xs);
  font-weight: 600;
  color: var(--ds-color-text-tertiary);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: all var(--ds-duration-fast) var(--ds-ease-out);
}

.type-toggle__opt--active.type-toggle__opt--diff { background: #E2EDDE; color: #3D5C44; }
.type-toggle__opt--active.type-toggle__opt--mix { background: #F8E8E0; color: #7A3A24; }
.type-toggle__opt--active.type-toggle__opt--none { background: var(--ds-color-bg-elevated); color: var(--ds-color-text-primary); }
:global([data-theme="dark"] .type-toggle__opt--active.type-toggle__opt--diff) { background: #1A241D; color: #B5D2B0; }
:global([data-theme="dark"] .type-toggle__opt--active.type-toggle__opt--mix) { background: #2A1E18; color: #F4C4A8; }

.link-row {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
}
</style>
