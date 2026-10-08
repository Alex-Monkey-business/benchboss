<script setup>
// Gruppene på én øvelse i økta — og rettingen på banen.
//
// Gruppene regnes ut av oppmøtet (grupperFor), likt på hver trenertelefon.
// Denne komponenten viser dem og sender inngrepene oppover: bytt, ikke her,
// antall, bland. Den eier ingen tilstand utover hvilket navn som er valgt.
//
// Ett trykk på et navn velger det. Trykk et annet navn, så bytter de plass.
// Eller «er ikke her». Dra-og-slipp på en telefon med kalde fingre er ikke et
// alternativ.
//
// Nivået står som en liten bokstav ved gruppa — trenerne skal se det, men det
// skal ikke være overskriften på en skjerm som vises frem på banen.
import { ref, watch } from 'vue'

const props = defineProps({
  // Fra grupperFor: { nokkel, antall, iHver, grupper: [{ ids, niva }] }
  plan: { type: Object, required: true },
  type: { type: String, default: 'diff' },
  tilStede: { type: Number, required: true },
  // id → kortnavn
  navn: { type: Object, required: true },
  // Én liste med trenernavn per gruppe.
  trenere: { type: Array, default: () => [] }
})
const emit = defineEmits(['bytt', 'borte', 'antall', 'bland'])

const valgt = ref(null)
watch(() => props.plan.nokkel, () => { valgt.value = null })

function trykk(id) {
  if (!valgt.value) { valgt.value = id; return }
  if (valgt.value === id) { valgt.value = null; return }
  emit('bytt', valgt.value, id)
  valgt.value = null
}

function ikkeHer() {
  if (!valgt.value) return
  emit('borte', valgt.value)
  valgt.value = null
}

function endreAntall(d) {
  const n = props.plan.antall + d
  if (n < 1 || n > props.tilStede) return
  emit('antall', n)
  valgt.value = null
}

function bland() {
  emit('bland')
  valgt.value = null
}
</script>

<template>
  <div class="grp">
    <div class="grp__hode">
      <p class="grp__meta">
        {{ type === 'mix' ? 'Nivåene blandet' : 'Likt nivå i hver gruppe' }}
      </p>
      <div class="grp__antall" role="group" aria-label="Antall grupper">
        <button type="button" class="grp__steg" :disabled="plan.antall <= 1" aria-label="Færre grupper" @click="endreAntall(-1)">−</button>
        <span class="grp__n">{{ plan.antall }}</span>
        <button type="button" class="grp__steg" :disabled="plan.antall >= tilStede" aria-label="Flere grupper" @click="endreAntall(1)">+</button>
      </div>
    </div>

    <ol class="grp__liste">
      <li v-for="(gr, i) in plan.grupper" :key="i" class="grp__gruppe">
        <span class="grp__merke">
          Gruppe {{ i + 1 }}<span v-if="gr.niva" class="grp__niva">{{ gr.niva }}</span>
          <span v-if="trenere[i]?.length" class="grp__trener">{{ trenere[i].join(' og ') }}</span>
        </span>
        <div class="grp__navn">
          <button
            v-for="id in gr.ids"
            :key="id"
            type="button"
            class="grp__spiller"
            :class="{ 'grp__spiller--valgt': valgt === id, 'grp__spiller--mal': valgt && valgt !== id }"
            :aria-pressed="valgt === id ? 'true' : 'false'"
            @click="trykk(id)"
          >{{ navn[id] }}</button>
        </div>
      </li>
    </ol>

    <div v-if="valgt" class="grp__valg" role="status">
      <span>Trykk et annet navn for å bytte</span>
      <button type="button" class="grp__knapp" @click="ikkeHer">{{ navn[valgt] }} er ikke her</button>
    </div>

    <div class="grp__fot">
      <button type="button" class="grp__lenke" @click="bland">Bland på nytt</button>
    </div>
  </div>
</template>

<style scoped>
.grp__hode {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-md);
}

.grp__antall {
  flex: none;
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-elevated);
}
.grp__steg {
  width: 40px; height: 36px;
  border: 0; background: none; cursor: pointer;
  font-size: 1.125rem; line-height: 1;
  color: var(--ds-color-text-primary);
  -webkit-tap-highlight-color: transparent;
}
.grp__steg:disabled { color: var(--ds-color-text-tertiary); cursor: default; }
.grp__n {
  min-width: 1.5em;
  text-align: center;
  font-weight: var(--ds-weight-semibold);
  font-variant-numeric: tabular-nums;
}

.grp__meta {
  margin: 0;
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-secondary);
  font-variant-numeric: tabular-nums;
}

.grp__liste {
  list-style: none;
  margin: var(--ds-space-sm) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.grp__gruppe { padding: var(--ds-space-sm) 0; }
.grp__gruppe + .grp__gruppe { border-top: 1px solid var(--ds-color-border); }

.grp__merke {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 6px;
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-secondary);
}
.grp__niva {
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-tertiary);
}
.grp__trener {
  margin-left: auto;
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
}

.grp__navn { display: flex; flex-wrap: wrap; gap: 6px; }

.grp__spiller {
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-elevated);
  color: var(--ds-color-text-primary);
  font-size: var(--ds-text-sm);
  cursor: pointer;
  transition: background .15s ease, border-color .15s ease, color .15s ease, transform .1s ease;
  -webkit-tap-highlight-color: transparent;
}
.grp__spiller:active { transform: scale(0.96); }
.grp__spiller--valgt {
  background: var(--ds-color-accent);
  border-color: var(--ds-color-accent);
  color: var(--ds-color-accent-text);
}
.grp__spiller--mal { border-style: dashed; }

.grp__valg {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-sm);
  margin-top: var(--ds-space-sm);
  padding: var(--ds-space-sm) 0;
  border-top: 1px solid var(--ds-color-border);
  background: var(--ds-color-bg-elevated);
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-secondary);
}
.grp__knapp {
  flex: none;
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-subtle);
  color: var(--ds-color-text-primary);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  cursor: pointer;
}

.grp__fot { margin-top: var(--ds-space-sm); }
.grp__lenke {
  border: 0; background: none; padding: 0; cursor: pointer;
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-accent);
}

@media (prefers-reduced-motion: reduce) {
  .grp__spiller { transition: none; }
}
</style>
