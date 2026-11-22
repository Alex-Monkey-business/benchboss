<script setup>
// Bildeflaten i kortene på Hjem. Leiresettet ligger i
// public/illustrations/bench-boss-card-art/, 684 × 352 px (2x av flaten).
import { computed } from 'vue'

const props = defineProps({
  navn: { type: String, default: 'trening' }
})

const FILER = {
  trening: 'trening-mal-og-kjegler.webp',
  kamp: 'kamp-syvermal.webp',
  ingen: 'ingen-hendelse-leire.webp'
}
const src = computed(() => `/illustrations/bench-boss-card-art/${FILER[props.navn] || FILER.trening}`)
</script>

<template>
  <span class="hjem-bilde" aria-hidden="true">
    <img :src="src" alt="" width="342" height="176" decoding="async" />
  </span>
</template>

<style scoped>
.hjem-bilde {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 176px;
  border-radius: var(--ds-radius-lg);
  background: var(--ds-color-bg-subtle);
  overflow: hidden;
}
.hjem-bilde img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
</style>
