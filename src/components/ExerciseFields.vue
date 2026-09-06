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

import { EQUIPMENT_TAGS, PLASS } from '../composables/useExercises'

function toggleTag(v) {
  const liste = props.form.utstyr_tags || (props.form.utstyr_tags = [])
  const i = liste.indexOf(v)
  if (i === -1) liste.push(v)
  else liste.splice(i, 1)
}

const props = defineProps({
  form: { type: Object, required: true },
  showCategory: { type: Boolean, default: false },
  // Kolonnene finnes først etter migrasjonen — da skal feltene holde seg unna.
  showGruppe: { type: Boolean, default: false },
  showSeEtter: { type: Boolean, default: false },
  showSiTilBarna: { type: Boolean, default: false },
  showVanligeFeil: { type: Boolean, default: false },
  showNokkeltall: { type: Boolean, default: false }
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

  <!-- Nøkkeltallene står ØVERST i skjemaet fordi de er det du vet med én gang
       («8 unger, kjegler, gymsalen») — beskrivelsen kommer etterpå. -->
  <template v-if="showNokkeltall">
    <div class="ds-form-group">
      <label class="ds-label">Antall spillere</label>
      <div class="antall-row">
        <input v-model.number="form.min_spillere" class="ds-input" type="number" min="1" max="30" placeholder="Færrest" aria-label="Færrest spillere" />
        <span class="antall-row__strek" aria-hidden="true">–</span>
        <input v-model.number="form.maks_spillere" class="ds-input" type="number" min="1" max="30" placeholder="Flest" aria-label="Flest spillere" />
      </div>
    </div>

    <div class="ds-form-group">
      <label class="ds-label">Utstyr</label>
      <div class="tag-velger">
        <button
          v-for="t in EQUIPMENT_TAGS"
          :key="t.value"
          type="button"
          role="switch"
          :aria-checked="(form.utstyr_tags || []).includes(t.value) ? 'true' : 'false'"
          class="tag-velger__opt"
          :class="{ 'tag-velger__opt--active': (form.utstyr_tags || []).includes(t.value) }"
          @click="toggleTag(t.value)"
        >{{ t.label }}</button>
      </div>
    </div>

    <div class="ds-form-group">
      <label class="ds-label">Plass</label>
      <div class="tag-velger">
        <button
          v-for="pl in PLASS"
          :key="pl.value"
          type="button"
          class="tag-velger__opt"
          :class="{ 'tag-velger__opt--active': form.plass === pl.value }"
          @click="form.plass = form.plass === pl.value ? null : pl.value"
        >{{ pl.label }}</button>
      </div>
    </div>
  </template>

  <div class="ds-form-group">
    <label class="ds-label" for="ex-moments">Momenter — ett per linje</label>
    <textarea id="ex-moments" v-model="form.laeringsmomenter" class="ds-input" rows="3" placeholder="Mykt medtak ut til siden&#10;Løft blikket (valgfri)"></textarea>
  </div>

  <div v-if="showGruppe" class="ds-form-group">
    <label class="ds-label" for="ex-gruppe">Gruppe og baneoppsett</label>
    <textarea id="ex-gruppe" v-model="form.gruppe" class="ds-input" rows="2" placeholder="F.eks. Tre baner à 25x20 meter, tre lag à tre per bane (valgfri)"></textarea>
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

  <div v-if="showVanligeFeil" class="ds-form-group">
    <label class="ds-label" for="ex-vanlige-feil">Vanlige feil — én per linje</label>
    <textarea id="ex-vanlige-feil" v-model="form.vanlige_feil" class="ds-input" rows="3" placeholder="Holder ballen for lenge&#10;Går for tidlig i press (valgfri)"></textarea>
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
/* Fra-til på én linje: to felt og en strek leses som ett spenn, mens to
   merkede felt under hverandre leses som to uavhengige tall. */
.antall-row {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: var(--ds-space-sm);
}

.antall-row__strek {
  color: var(--ds-color-text-tertiary);
}

.tag-velger {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ds-space-sm);
}

.tag-velger__opt {
  border: 1px solid var(--ds-color-border);
  background: var(--ds-color-bg-elevated);
  color: var(--ds-color-text-secondary);
  border-radius: var(--ds-radius-full);
  padding: 8px 14px;
  font-size: var(--ds-text-sm);
  cursor: pointer;
  transition: border-color var(--ds-duration-fast) var(--ds-ease-out),
              background-color var(--ds-duration-fast) var(--ds-ease-out);
}

.tag-velger__opt--active {
  border-color: var(--ds-color-text-primary);
  background: var(--ds-color-text-primary);
  color: var(--ds-color-bg-elevated);
}

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
