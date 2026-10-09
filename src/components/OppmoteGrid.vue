<script setup>
// Hvem er her: spillerne og trenerne som store brikker. På = her, overstrøket
// = ikke her. Samme rutenett før økta (hele skjermen) og under økta (i et ark).
defineProps({
  spillere: { type: Array, required: true }, // [{ id }]
  trenere: { type: Array, default: () => [] },
  navn: { type: Object, required: true },
  trenerNavn: { type: Object, required: true },
  erHer: { type: Function, required: true },
  trenerHer: { type: Function, required: true },
  // Rigger: én trener utenfor gruppene, som tar det praktiske. null = ingen.
  rigger: { type: String, default: null }
})
const emit = defineEmits(['spiller', 'trener', 'rigger'])
</script>

<template>
  <div class="oppg">
    <div class="oppg__grid">
      <button
        v-for="p in spillere"
        :key="p.id"
        type="button"
        class="oppg__navn"
        :class="{ 'oppg__navn--borte': !erHer(p.id) }"
        :aria-pressed="erHer(p.id) ? 'true' : 'false'"
        @click="emit('spiller', p.id)"
      >{{ navn[p.id] }}</button>
    </div>

    <template v-if="trenere.length">
      <h2 class="oppg__h2">Trenere</h2>
      <div class="oppg__grid">
        <button
          v-for="c in trenere"
          :key="c.id"
          type="button"
          class="oppg__navn"
          :class="{ 'oppg__navn--borte': !trenerHer(c.id) }"
          :aria-pressed="trenerHer(c.id) ? 'true' : 'false'"
          @click="emit('trener', c.id)"
        >{{ trenerNavn[c.id] }}</button>
      </div>

      <h2 class="oppg__h2">Rigger</h2>
      <div class="oppg__valg" role="radiogroup" aria-label="Rigger">
        <button
          type="button"
          role="radio"
          class="oppg__valg-knapp"
          :class="{ 'oppg__valg-knapp--pa': !rigger }"
          :aria-checked="!rigger ? 'true' : 'false'"
          @click="emit('rigger', null)"
        >Ingen</button>
        <button
          v-for="c in trenere.filter(t => trenerHer(t.id))"
          :key="c.id"
          type="button"
          role="radio"
          class="oppg__valg-knapp"
          :class="{ 'oppg__valg-knapp--pa': rigger === c.id }"
          :aria-checked="rigger === c.id ? 'true' : 'false'"
          @click="emit('rigger', c.id)"
        >{{ trenerNavn[c.id] }}</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.oppg__h2 {
  margin: var(--ds-space-xl) 0 var(--ds-space-sm);
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-secondary);
}

/* Store mål: tjue navn trykkes med tommelen i kulda. */
.oppg__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 10px;
}
.oppg__navn {
  min-height: 48px;
  padding: 0 10px;
  border: 1.5px solid var(--ds-color-accent);
  border-radius: var(--ds-radius-md);
  background: var(--ds-color-accent-light, var(--ds-color-bg-elevated));
  color: var(--ds-color-text-primary);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  cursor: pointer;
  transition: background .15s ease, border-color .15s ease, color .15s ease, transform .1s ease;
  -webkit-tap-highlight-color: transparent;
}
.oppg__navn:active { transform: scale(0.96); }
.oppg__navn--borte {
  border-color: var(--ds-color-border);
  background: transparent;
  color: var(--ds-color-text-tertiary);
  text-decoration: line-through;
}

/* Ett valg, ikke av/på: mindre og rundere enn navnebrikkene over. */
.oppg__valg { display: flex; flex-wrap: wrap; gap: 8px; }
.oppg__valg-knapp {
  min-height: 40px;
  padding: 0 16px;
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-elevated);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-secondary);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.oppg__valg-knapp--pa {
  border-color: var(--ds-color-accent);
  background: var(--ds-color-accent);
  color: var(--ds-color-accent-text);
}

@media (prefers-reduced-motion: reduce) {
  .oppg__navn { transition: none; }
}
</style>
