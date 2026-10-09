<script setup>
// Gruppene på én øvelse — lest, eller endret.
//
// LESE er det du gjør på feltet: én rad per gruppe, navnene som rolige
// brikker (lette å skanne), treneren under. Ingenting her kan trykkes.
//
// ENDRE er et eget valg: navnene blir brikker, antallet og «bland» kommer
// fram. Ett trykk velger et navn, et trykk til på et annet bytter dem.
// Handlingene for det valgte navnet («er ikke her») står i arkets faste
// bunn, ikke her — da skyver de ikke gruppene når de dukker opp.
//
// Nivået står som en liten bokstav ved gruppa. Trenerne skal se det, men det
// skal ikke være overskriften på en skjerm som vises frem på banen.
const props = defineProps({
  // Fra grupperFor: { nokkel, antall, iHver, grupper: [{ ids, niva }] }
  plan: { type: Object, required: true },
  type: { type: String, default: 'diff' },
  tilStede: { type: Number, required: true },
  navn: { type: Object, required: true },
  trenere: { type: Array, default: () => [] },
  redigerer: { type: Boolean, default: false },
  valgt: { type: String, default: null }
})
const emit = defineEmits(['bytt', 'antall', 'bland', 'update:valgt'])

function trykk(id) {
  if (!props.valgt) return emit('update:valgt', id)
  if (props.valgt === id) return emit('update:valgt', null)
  emit('bytt', props.valgt, id)
  emit('update:valgt', null)
}

function endreAntall(d) {
  const n = props.plan.antall + d
  if (n < 1 || n > props.tilStede) return
  emit('antall', n)
  emit('update:valgt', null)
}
</script>

<template>
  <div class="grp" :class="{ 'grp--endre': redigerer }">
    <div v-if="redigerer" class="grp__verktoy">
      <div class="grp__antall" role="group" aria-label="Antall grupper">
        <button type="button" class="grp__steg" :disabled="plan.antall <= 1" aria-label="Færre grupper" @click="endreAntall(-1)">−</button>
        <span class="grp__n">{{ plan.antall }} {{ plan.antall === 1 ? 'gruppe' : 'grupper' }}</span>
        <button type="button" class="grp__steg" :disabled="plan.antall >= tilStede" aria-label="Flere grupper" @click="endreAntall(1)">+</button>
      </div>
      <button type="button" class="grp__bland" @click="emit('bland'); emit('update:valgt', null)">Bland</button>
    </div>

    <ol class="grp__liste">
      <li v-for="(gr, i) in plan.grupper" :key="i" class="grp__gruppe">
        <span class="grp__merke" aria-hidden="true">
          <span class="grp__nr">{{ i + 1 }}</span>
          <span v-if="gr.niva" class="grp__niva">{{ gr.niva }}</span>
        </span>
        <div class="grp__innhold">
          <ul v-if="!redigerer" class="grp__brikker grp__brikker--les" :aria-label="`Gruppe ${i + 1}`">
            <li v-for="id in gr.ids" :key="id" class="grp__navn">{{ navn[id] }}</li>
          </ul>
          <div v-else class="grp__brikker">
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
          <span v-if="trenere[i]?.length" class="grp__trener">{{ trenere[i].join(' og ') }}</span>
        </div>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.grp__verktoy {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-md);
  margin-bottom: var(--ds-space-md);
}
.grp__antall {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-elevated);
}
.grp__steg {
  width: 44px; height: 40px;
  border: 0; background: none; cursor: pointer;
  font-size: 1.125rem; line-height: 1;
  color: var(--ds-color-text-primary);
  -webkit-tap-highlight-color: transparent;
}
.grp__steg:disabled { color: var(--ds-color-text-tertiary); cursor: default; }
.grp__n {
  min-width: 6.5em;
  text-align: center;
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-semibold);
  font-variant-numeric: tabular-nums;
}
.grp__bland {
  min-height: 40px;
  padding: 0 16px;
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-elevated);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-primary);
  cursor: pointer;
}

.grp__liste { list-style: none; margin: 0; padding: 0; }
.grp__gruppe {
  display: grid;
  grid-template-columns: 40px 1fr;
  gap: var(--ds-space-md);
  padding: var(--ds-space-md) 0;
}
.grp__gruppe + .grp__gruppe { border-top: 1px solid var(--ds-color-border); }
.grp__gruppe:first-child { padding-top: 0; }

/* Nummeret er ankeret: du roper «gruppe 2», ikke navnene. */
.grp__merke {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.grp__nr {
  display: grid; place-items: center;
  width: 36px; height: 36px;
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-subtle);
  border: 1px solid var(--ds-color-border);
  font-size: var(--ds-text-md);
  font-weight: var(--ds-weight-bold);
  color: var(--ds-color-text-primary);
  font-variant-numeric: tabular-nums;
}
.grp__niva {
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-tertiary);
}

.grp__innhold { min-width: 0; display: flex; flex-direction: column; gap: 6px; }
/* Lese-brikkene: flate, ingen kant å trykke på. Endre-brikkene under har
   kant og trykkflate — forskjellen sier hvilken modus du er i. */
.grp__brikker--les { list-style: none; margin: 0; padding: 0; }
.grp__navn {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 12px;
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-subtle);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-primary);
}
.grp__trener {
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-secondary);
}

.grp__brikker { display: flex; flex-wrap: wrap; gap: 6px; }
.grp__spiller {
  min-height: 40px;
  padding: 0 14px;
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

@media (prefers-reduced-motion: reduce) {
  .grp__spiller { transition: none; }
}
</style>
