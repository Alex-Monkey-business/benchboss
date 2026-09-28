<script setup>
import { computed } from 'vue'

// Økta i kort form: øvelsene som rader med nummer, navn og minutter. Brukes
// på dagkortene på Trening og på treningskortene på Hjem, så økta ser lik ut
// begge steder. Rekkefølgen er treninga, derfor nummeret.
const props = defineProps({
  drills: { type: Array, default: () => [] },
  maks: { type: Number, default: 4 }
})

const ovelser = computed(() => props.drills.filter(d => d?.text))
</script>

<template>
  <div v-if="ovelser.length" class="okt-liste">
    <ul class="okt-liste__rader">
      <li v-for="(d, i) in ovelser.slice(0, maks)" :key="i">
        <span class="okt-liste__nr">{{ i + 1 }}</span>
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
  min-width: 0;
}

.okt-liste__rader {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.okt-liste__rader li {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  font-size: var(--ds-text-sm);
  line-height: 1.35;
}
/* Nummeret i en liten rund flate: skiller øvelsene uten å rope, og står i
   samme kolonne så navnene ligger på linje. */
.okt-liste__nr {
  flex-shrink: 0;
  display: inline-grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: var(--ds-radius-full);
  background: var(--okt-nr-bg, var(--ds-color-bg-subtle));
  font-size: 11px;
  font-weight: var(--ds-weight-semibold);
  font-variant-numeric: tabular-nums;
  color: var(--okt-dempet, var(--ds-color-text-secondary));
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
  padding-left: 30px;
  font-size: var(--ds-text-xs);
  color: var(--okt-dempet, var(--ds-color-text-tertiary));
}
</style>
