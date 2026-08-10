<script setup>
import { computed } from 'vue'

// Opptakten til sesongens første kamp. Ikke klikkbart — neste kamp-kortet
// rett under er inngangen; dette er kunngjøringen om at sesongen snur.
const props = defineProps({
  kickoff: { type: Object, required: true }
})

const pill = computed(() => {
  const d = props.kickoff.days
  if (d <= 1) return 'i morgen'
  if (d < 7) return `om ${d} dager`
  if (d < 14) return 'om en uke'
  return `om ${Math.round(d / 7)} uker`
})

const dateLine = computed(() => {
  const d = new Date(props.kickoff.date + 'T12:00:00')
  const day = d.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' })
  return `Første kamp ${day}.`
})
</script>

<template>
  <section class="ds-card kickoff">
    <div class="kickoff__top">
      <span class="kickoff__kicker">{{ kickoff.season || 'Ny sesong' }}</span>
      <span class="kickoff__when">{{ pill }}</span>
    </div>
    <span class="kickoff__title">Sesongen er snart i gang</span>
    <span class="kickoff__detail">{{ dateLine }} Nye lag og nye trenere denne sesongen.</span>
  </section>
</template>

<style scoped>
.kickoff {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-xs);
  padding: var(--ds-space-lg);
}

.kickoff__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-sm);
  margin-bottom: 2px;
}

.kickoff__kicker {
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.kickoff__when {
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  padding: 3px 10px;
  border-radius: var(--ds-radius-full);
  border: 1px solid var(--ds-color-border);
  color: var(--ds-color-text-secondary);
  white-space: nowrap;
  flex-shrink: 0;
}

.kickoff__title {
  font-family: var(--ds-font-heading);
  font-size: var(--ds-text-xl);
  letter-spacing: -0.01em;
  line-height: 1.25;
  color: var(--ds-color-text-primary);
}

.kickoff__detail {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
}
</style>
