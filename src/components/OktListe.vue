<script setup>
import { computed } from 'vue'

// Økta i kort form: ei stripe der hver bit er én øvelse og lengden er tida,
// og øvelsene som rader med navn og minutter. Brukes på dagkortene på
// Trening og på treningskortene på Hjem, så økta ser lik ut begge steder.
const props = defineProps({
  drills: { type: Array, default: () => [] },
  total: { type: Number, default: 0 },   // dagens lengde i minutter
  maks: { type: Number, default: 4 }
})

const ovelser = computed(() => props.drills.filter(d => d?.text))
// Bare når alle øvelsene har tid; ellers ville stripa løyet om fordelingen.
const stripe = computed(() => {
  const l = ovelser.value
  if (!l.length || !l.every(d => d.minutes > 0)) return null
  const sum = l.reduce((a, d) => a + d.minutes, 0)
  return { deler: l.map(d => d.minutes), ledig: Math.max(0, (props.total || 0) - sum) }
})
</script>

<template>
  <div v-if="ovelser.length" class="okt-liste">
    <span v-if="stripe" class="okt-liste__stripe" aria-hidden="true">
      <span v-for="(m, i) in stripe.deler" :key="i" class="okt-liste__bit" :style="{ flexGrow: m }"></span>
      <span v-if="stripe.ledig" class="okt-liste__bit okt-liste__bit--ledig" :style="{ flexGrow: stripe.ledig }"></span>
    </span>
    <ul class="okt-liste__rader">
      <li v-for="(d, i) in ovelser.slice(0, maks)" :key="i">
        <span class="okt-liste__navn">{{ d.text }}</span>
        <span v-if="d.minutes" class="okt-liste__tid">{{ d.minutes }} min</span>
      </li>
      <li v-if="ovelser.length > maks" class="okt-liste__flere">{{ ovelser.length - maks }} til</li>
    </ul>
  </div>
</template>

<style scoped>
.okt-liste {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

/* Solide biter med luft mellom, ledig tid som et dempet spor. Fargene kan
   overstyres av kortet rundt (Hjem har farget bakgrunn). */
.okt-liste__stripe {
  display: flex;
  gap: 3px;
  height: 6px;
}
.okt-liste__bit {
  flex-basis: 0;
  min-width: 6px;
  border-radius: var(--ds-radius-full);
  background: var(--okt-farge, var(--ds-color-accent));
}
.okt-liste__bit--ledig { background: var(--okt-spor, var(--ds-color-border-light)); }

.okt-liste__rader {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.okt-liste__rader li {
  display: flex;
  align-items: baseline;
  gap: var(--ds-space-md);
  min-width: 0;
  font-size: var(--ds-text-sm);
  line-height: 1.35;
}
.okt-liste__navn {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-primary);
}
.okt-liste__tid {
  flex-shrink: 0;
  font-size: var(--ds-text-xs);
  font-variant-numeric: tabular-nums;
  color: var(--okt-dempet, var(--ds-color-text-tertiary));
}
.okt-liste__rader .okt-liste__flere {
  font-size: var(--ds-text-xs);
  color: var(--okt-dempet, var(--ds-color-text-tertiary));
}
</style>
