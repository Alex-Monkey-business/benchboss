<script setup>
defineProps({
  width: { type: [String, Number], default: '100%' },
  height: { type: [String, Number], default: '12px' },
  radius: { type: [String, Number], default: '6px' },
  circle: { type: Boolean, default: false }
})
</script>

<template>
  <span
    class="skeleton"
    :class="{ 'skeleton--circle': circle }"
    :style="{
      width: typeof width === 'number' ? `${width}px` : width,
      height: typeof height === 'number' ? `${height}px` : height,
      borderRadius: circle ? '50%' : (typeof radius === 'number' ? `${radius}px` : radius)
    }"
    aria-hidden="true"
  />
</template>

<style scoped>
.skeleton {
  display: inline-block;
  position: relative;
  overflow: hidden;
  background: var(--ds-color-bg-subtle);
  vertical-align: middle;
}

.skeleton::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.55) 50%,
    transparent 100%
  );
  animation: skeleton-shimmer 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

@keyframes skeleton-shimmer {
  from { transform: translateX(-100%); }
  to   { transform: translateX(100%); }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton::after { animation: none; opacity: 0.5; }
}
</style>
