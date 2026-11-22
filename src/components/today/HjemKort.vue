<script setup>
import Ikon from '../Ikon.vue'
// Det ene store kortet på Hjem: det neste som skjer. Bilde øverst, én tittel,
// én linje, pil. Brukes for dagens trening, neste trening og tom plan.
// Kampkortene har egne handlinger og bruker bare bildeflaten (HjemBilde).
import HjemBilde from './HjemBilde.vue'

defineProps({
  to: { type: String, default: null },
  bilde: { type: String, default: 'trening' },
  tittel: { type: String, required: true },
  // Hver del holdes samlet: linja brekker ved «·», aldri midt i «4 øvelser».
  linje: { type: Array, default: () => [] }
})
</script>

<template>
  <component :is="to ? 'router-link' : 'div'" :to="to || undefined" class="ds-card hjem-kort" :class="{ 'hjem-kort--trykk': to }">
    <HjemBilde :navn="bilde" />
    <span class="hjem-kort__bunn">
      <span class="hjem-kort__tekst">
        <span class="hjem-kort__tittel">{{ tittel }}</span>
        <span v-if="linje.length" class="hjem-kort__linje"><template v-for="(d, i) in linje" :key="i"><template v-if="i"> · </template><span class="hjem-kort__del">{{ d }}</span></template></span>
      </span>
      <span v-if="to" class="hjem-kort__pil" aria-hidden="true">
        <Ikon navn="videre" />
      </span>
    </span>
  </component>
</template>

<style scoped>
.hjem-kort {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-md);
  padding: var(--ds-space-12);
  border-radius: 24px;
  background: var(--ds-color-bg-elevated);
  border: var(--ds-border-width) solid var(--ds-color-border);
  box-shadow: var(--ds-shadow-md);
  color: var(--ds-color-text-primary);
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
}
.hjem-kort--trykk { transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1); }
.hjem-kort--trykk:active { transform: scale(0.97); }

.hjem-kort__bunn {
  display: flex;
  align-items: center;
  gap: var(--ds-space-12);
  padding: 0 var(--ds-space-sm) var(--ds-space-sm);
}
.hjem-kort__tekst { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--ds-space-xs); }
.hjem-kort__tittel {
  font-family: var(--ds-font-heading);
  font-size: var(--ds-text-lg);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: -0.01em;
  line-height: 1.25;
}
.hjem-kort__linje { font-size: var(--ds-text-md); color: var(--ds-color-text-tertiary); }
.hjem-kort__del { white-space: nowrap; }

/* Pila er dempet: Del inn er den eneste fylte aksenten på Hjem. */
.hjem-kort__pil {
  flex: none;
  width: 44px;
  height: 44px;
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-subtle);
  display: flex;
  align-items: center;
  justify-content: center;
}
.hjem-kort__pil svg { width: 20px; height: 20px; }

@media (prefers-reduced-motion: reduce) {
  .hjem-kort--trykk { transition: none; }
  .hjem-kort--trykk:active { transform: none; }
}
</style>
