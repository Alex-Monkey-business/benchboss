<script setup>
import Ikon from './Ikon.vue'
// − 3 +: antall grupper eller lag. Ett trykk er ett mer eller ett mindre.
const props = defineProps({
  verdi: { type: Number, required: true },
  min: { type: Number, default: 1 },
  maks: { type: Number, default: 6 },
  navn: { type: String, default: 'Antall' }
})
const emit = defineEmits(['endre'])
const til = v => { if (v >= props.min && v <= props.maks) emit('endre', v) }
</script>

<template>
  <div class="steg" role="group" :aria-label="navn">
    <button type="button" class="steg__knapp" aria-label="Færre" :disabled="verdi <= min" @click="til(verdi - 1)">
      <Ikon navn="minus" vekt="bold" aria-hidden="true" />
    </button>
    <span class="steg__tall" aria-live="polite">{{ verdi }}</span>
    <button type="button" class="steg__knapp" aria-label="Flere" :disabled="verdi >= maks" @click="til(verdi + 1)">
      <Ikon navn="pluss" vekt="bold" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.steg {
  display: inline-flex; align-items: center; gap: var(--ds-space-xs);
  padding: var(--ds-space-xs);
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-subtle, var(--ds-color-bg-elevated));
}
.steg__knapp {
  display: grid; place-items: center;
  width: 44px; height: 44px;
  border: 0; border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-elevated);
  color: var(--ds-color-text-primary);
  box-shadow: var(--ds-shadow-sm, 0 1px 2px rgba(15, 15, 15, .08));
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.steg__knapp svg { width: 18px; height: 18px; }
:global([data-theme="dark"]) .steg__knapp:not(:disabled) { background: var(--ds-color-bg-hover); }
.steg__knapp:disabled { color: var(--ds-color-text-tertiary); box-shadow: none; opacity: .5; cursor: default; }
.steg__tall {
  min-width: 28px; text-align: center;
  font-size: var(--ds-text-md); font-weight: var(--ds-weight-bold);
  color: var(--ds-color-text-primary);
  font-variant-numeric: tabular-nums;
}
</style>
