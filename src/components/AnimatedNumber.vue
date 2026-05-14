<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  value: { type: Number, required: true },
  duration: { type: Number, default: 450 },
  format: { type: Function, default: (v) => Math.round(v).toLocaleString('nb-NO') }
})

const display = ref(props.value)
let raf = null
let from = props.value
let start = 0

const ease = (t) => 1 - Math.pow(1 - t, 3)

function animate(timestamp) {
  if (!start) start = timestamp
  const elapsed = timestamp - start
  const progress = Math.min(elapsed / props.duration, 1)
  display.value = from + (props.value - from) * ease(progress)
  if (progress < 1) {
    raf = requestAnimationFrame(animate)
  } else {
    display.value = props.value
    raf = null
  }
}

function trigger() {
  if (raf) cancelAnimationFrame(raf)
  from = display.value
  start = 0
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    display.value = props.value
    return
  }
  raf = requestAnimationFrame(animate)
}

watch(() => props.value, trigger)
onMounted(() => { display.value = props.value })
onUnmounted(() => { if (raf) cancelAnimationFrame(raf) })
</script>

<template>
  <span class="ds-animated-number" data-numeric>{{ format(display) }}</span>
</template>

<style scoped>
.ds-animated-number {
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
}
</style>
