<script setup>
import { computed } from 'vue'

// Inngangen til cup-modulen mens en cup er aktiv. Ingen egen meny-fane —
// kortet lever på Hjem og forsvinner når cupen settes til completed.
// På kampdag viser pillen antall kamper for MITT lag i stedet for datoene.
const props = defineProps({
  cup: { type: Object, required: true },
  todayCount: { type: Number, default: 0 }
})

const dateRange = computed(() => {
  const { start_date: start, end_date: end } = props.cup
  if (!start) return ''
  const s = new Date(start + 'T12:00:00')
  const month = (d) => d.toLocaleDateString('nb-NO', { month: 'long' })
  if (!end || end === start) return `${s.getDate()}. ${month(s)}`
  const e = new Date(end + 'T12:00:00')
  if (s.getMonth() === e.getMonth()) return `${s.getDate()}.–${e.getDate()}. ${month(s)}`
  return `${s.getDate()}. ${month(s)} – ${e.getDate()}. ${month(e)}`
})

const pill = computed(() => {
  if (props.todayCount === 1) return '1 kamp i dag'
  if (props.todayCount > 1) return `${props.todayCount} kamper i dag`
  return dateRange.value
})
</script>

<template>
  <router-link to="/cup" class="ds-card ds-card--interactive cup-entry">
    <div class="cup-entry__top">
      <span class="cup-entry__kicker">Cup</span>
      <span v-if="pill" class="cup-entry__when">{{ pill }}</span>
    </div>
    <span class="cup-entry__name">{{ cup.name }}</span>
    <span v-if="cup.venue" class="cup-entry__detail">{{ cup.venue }}</span>
  </router-link>
</template>

<style scoped>
.cup-entry {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-xs);
  padding: var(--ds-space-lg);
  text-decoration: none;
}

.cup-entry__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-sm);
  margin-bottom: 2px;
}

.cup-entry__kicker {
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
  white-space: nowrap;
}

.cup-entry__when {
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  padding: 3px 10px;
  border-radius: var(--ds-radius-full);
  border: 1px solid var(--ds-color-border);
  color: var(--ds-color-text-secondary);
  white-space: nowrap;
  flex-shrink: 0;
}

.cup-entry__name {
  font-family: var(--ds-font-heading);
  font-size: var(--ds-text-xl);
  letter-spacing: -0.01em;
  line-height: 1.25;
  color: var(--ds-color-text-primary);
}

.cup-entry__detail {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
}
</style>
