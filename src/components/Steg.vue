<script setup>
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
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12" /></svg>
    </button>
    <span class="steg__tall" aria-live="polite">{{ verdi }}</span>
    <button type="button" class="steg__knapp" aria-label="Flere" :disabled="verdi >= maks" @click="til(verdi + 1)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
    </button>
  </div>
</template>

<style scoped>
.steg {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px;
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-subtle, var(--ds-color-bg-elevated));
}
.steg__knapp {
  display: grid; place-items: center;
  width: 36px; height: 36px;
  border: 0; border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-elevated);
  color: var(--ds-color-text-primary);
  box-shadow: var(--ds-shadow-sm, 0 1px 2px rgba(15, 15, 15, .08));
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.steg__knapp svg { width: 16px; height: 16px; }
:global([data-theme="dark"]) .steg__knapp:not(:disabled) { background: var(--ds-color-bg-hover); }
.steg__knapp:disabled { color: var(--ds-color-text-tertiary); box-shadow: none; opacity: .5; cursor: default; }
.steg__tall {
  min-width: 28px; text-align: center;
  font-size: var(--ds-text-md); font-weight: var(--ds-weight-bold);
  color: var(--ds-color-text-primary);
  font-variant-numeric: tabular-nums;
}
</style>
