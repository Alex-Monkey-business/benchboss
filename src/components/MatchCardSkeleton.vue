<script setup>
import Skeleton from './Skeleton.vue'

defineProps({
  count: { type: Number, default: 3 }
})
</script>

<template>
  <div class="match-skel-stack" aria-hidden="true">
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
  padding: 20px 22px;
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

@media (prefers-reduced-motion: reduce) {
  .match-skel { animation: none; opacity: 1; }
}
</style>
