<script setup>
// Én øvelse — ett sett felt. Samme skjema enten du redigerer den i banken
// eller i en økt, så du aldri må lære to versjoner av samme greie.
//
// Feltene ER kategoriene, og de heter det samme i skjemaet som på skjermen:
// navn, lengde, diff/mix, hva vi øver på, hvordan vi deler opp gruppa, hva du
// må ha med ut, og hva øvelsen går ut på. «Fokus» og «Øver på» var to etiketter for samme kategori;
// nå er den ene overskriften og den andre momentene under.
//
// Lengden ligger ikke her: den er dagens valg, ikke øvelsens egenskap. Samme
// rondo er 10 minutter på tirsdag og 20 på lørdag — den settes i planmodus.
import { EXERCISE_CATEGORIES } from '../composables/useExercises'

const props = defineProps({
  form: { type: Object, required: true },
  showCategory: { type: Boolean, default: false },
  // Kolonnene finnes først etter migrasjonen — da skal feltene holde seg unna.
  showGruppe: { type: Boolean, default: false },
  showUtstyr: { type: Boolean, default: false },
  showSeEtter: { type: Boolean, default: false },
  showSiTilBarna: { type: Boolean, default: false }
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
    <label class="ds-label" for="ex-tema">Hva vi øver på</label>
    <input id="ex-tema" v-model="form.tema" class="ds-input" type="text" placeholder="F.eks. Spille oss fremover (valgfri)" />
  </div>

  <div class="ds-form-group">
    <label class="ds-label" for="ex-moments">Momenter — ett per linje</label>
    <textarea id="ex-moments" v-model="form.laeringsmomenter" class="ds-input" rows="3" placeholder="Mykt medtak ut til siden&#10;Løft blikket (valgfri)"></textarea>
  </div>

  <div v-if="showGruppe" class="ds-form-group">
    <label class="ds-label" for="ex-gruppe">Hvordan vi deler opp gruppa</label>
    <textarea id="ex-gruppe" v-model="form.gruppe" class="ds-input" rows="2" placeholder="F.eks. To baner med småmål, tre lag à tre (valgfri)"></textarea>
  </div>

  <div v-if="showUtstyr" class="ds-form-group">
    <label class="ds-label" for="ex-utstyr">Utstyr og bane</label>
    <textarea id="ex-utstyr" v-model="form.utstyr" class="ds-input" rows="2" placeholder="F.eks. 12 småmål, kjegler, 27 baller. 25x20 meter (valgfri)"></textarea>
  </div>

  <div class="ds-form-group">
    <label class="ds-label" for="ex-org">Gjennomføring</label>
    <textarea id="ex-org" v-model="form.organisering" class="ds-input" rows="4" placeholder="Ett steg per linje — de nummereres for deg. Én linje blir stående som avsnitt (valgfri)."></textarea>
  </div>

  <div v-if="showSeEtter" class="ds-form-group">
    <label class="ds-label" for="ex-se-etter">Se etter dette — ett per linje</label>
    <textarea id="ex-se-etter" v-model="form.se_etter" class="ds-input" rows="3" placeholder="Ballen trekkes tett bak støttefoten&#10;Lavt tyngdepunkt i vendingen (valgfri)"></textarea>
  </div>

  <div v-if="showSiTilBarna" class="ds-form-group">
    <label class="ds-label" for="ex-si-til-barna">Si dette til barna — én frase per linje</label>
    <textarea id="ex-si-til-barna" v-model="form.si_til_barna" class="ds-input" rows="3" placeholder="Selg skuddet&#10;Vend raskt (valgfri)"></textarea>
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

.type-toggle__opt--active.type-toggle__opt--diff { background: var(--ds-badge-bg); color: var(--ds-badge-text); }
.type-toggle__opt--active.type-toggle__opt--mix { background: transparent; color: var(--ds-badge-text); box-shadow: inset 0 0 0 1px var(--ds-badge-border); }
.type-toggle__opt--active.type-toggle__opt--none { background: var(--ds-color-bg-elevated); color: var(--ds-color-text-primary); }
:global([data-theme="dark"] .type-toggle__opt--active.type-toggle__opt--diff) { background: #1A241D; color: #B5D2B0; }
:global([data-theme="dark"] .type-toggle__opt--active.type-toggle__opt--mix) { background: #2A1E18; color: #F4C4A8; }

.link-row {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
}
</style>
