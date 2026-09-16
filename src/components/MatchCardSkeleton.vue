<script setup>
import Skeleton from './Skeleton.vue'

defineProps({
  count: { type: Number, default: 3 },
  // 'row' speiler kamprada i lista; standard er kortet på Hjem.
  variant: { type: String, default: 'card' }
})
</script>

<template>
  <div v-if="variant === 'row'" class="match-skel-rows" aria-hidden="true">
    <div v-for="i in count" :key="i" class="match-skel-row" :style="{ animationDelay: `${i * 60}ms` }">
      <Skeleton :width="'64%'" :height="14" />
      <Skeleton :width="40" :height="14" />
      <Skeleton :width="'64%'" :height="14" />
    </div>
  </div>
  <div v-else class="match-skel-stack" aria-hidden="true">
    <div v-for="i in count" :key="i" class="ds-card match-skel" :style="{ animationDelay: `${i * 60}ms` }">
      <div class="match-skel__top">
        <Skeleton :width="58" :height="14" />
        <Skeleton :width="32" :height="14" />
      </div>
      <div class="match-skel__teams">
        <Skeleton :width="'68%'" :height="16" />
        <Skeleton :width="22" :height="16" />
        <Skeleton :width="'56%'" :height="16" />
      </div>
      <div class="match-skel__meta">
        <Skeleton :width="60" :height="12" />
        <Skeleton :width="80" :height="12" />
        <Skeleton :width="50" :height="12" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.match-skel-stack {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
}

.match-skel {
  padding: var(--ds-space-lg);
  opacity: 0;
  animation: skel-fade-in 0.35s var(--ds-ease-out) forwards;
}

@keyframes skel-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.match-skel__top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.match-skel__teams {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  column-gap: 14px;
  margin-bottom: 14px;
}

.match-skel__teams > :last-child {
  justify-self: end;
}

.match-skel__meta {
  display: flex;
  gap: var(--ds-space-md);
}

.match-skel-rows {
  display: flex;
  flex-direction: column;
  background: var(--ds-color-bg-subtle);
  border-radius: var(--ds-radius-lg);
  padding: 8px var(--ds-space-md);
}

.match-skel-row {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  justify-items: center;
  column-gap: 10px;
  padding: 16px 0;
  opacity: 0;
  animation: skel-fade-in 0.35s var(--ds-ease-out) forwards;
}

.match-skel-row > :first-child { justify-self: end; }
.match-skel-row > :last-child { justify-self: start; }

@media (prefers-reduced-motion: reduce) {
  .match-skel, .match-skel-row { animation: none; opacity: 1; }
}
</style>
