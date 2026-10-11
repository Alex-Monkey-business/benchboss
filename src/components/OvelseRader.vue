<script setup>
// Øvelsene i kjøreplanen: nummer, navn og hvordan den kjøres. Et trykk
// åpner øvelsen.
defineProps({
  kort: { type: Array, required: true }, // [{ d, i }]
  meta: { type: Function, required: true }
})
const emit = defineEmits(['apne'])
</script>

<template>
  <ol class="ovelser">
    <li v-for="k in kort" :key="k.i">
      <button type="button" class="rad" @click="emit('apne', k.i)">
        <span class="rad__nr">{{ k.i + 1 }}</span>
        <span class="rad__tekst">
          <span class="rad__navn">{{ k.d.text }}</span>
          <span class="rad__meta">{{ meta(k) }}</span>
        </span>
        <svg class="rad__pil" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
      </button>
    </li>
  </ol>
</template>

<style scoped>
.ovelser { list-style: none; margin: 0; padding: 0; }
.ovelser li + li .rad { border-top: 1px solid var(--ds-color-border-light, var(--ds-color-border)); }
.rad {
  display: flex; align-items: center; gap: var(--ds-space-md);
  width: 100%; min-height: 72px;
  padding: var(--ds-space-md) 0;
  border: 0; background: none;
  text-align: left; color: inherit; cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.rad__nr {
  flex: none;
  display: grid; place-items: center;
  width: 32px; height: 32px;
  border: 1.5px solid var(--ds-color-text-primary);
  border-radius: var(--ds-radius-full);
  font-size: var(--ds-text-sm); font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
  font-variant-numeric: tabular-nums;
}
.rad__tekst { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.rad__navn { font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-primary); line-height: 1.3; }
.rad__meta { font-size: var(--ds-text-sm); line-height: 1.4; color: var(--ds-color-text-secondary); }
.rad__pil { flex: none; width: 20px; height: 20px; color: var(--ds-color-text-tertiary); }
</style>
