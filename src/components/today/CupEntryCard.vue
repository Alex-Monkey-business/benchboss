<script setup>
import { computed } from 'vue'

// Inngangen til cup-modulen mens en cup er aktiv. Ingen egen meny-fane —
// kortet lever på Hjem og forsvinner når cupen settes til completed.
// På kampdag viser pillen antall kamper for MITT lag i stedet for datoene.
const props = defineProps({
  cup: { type: Object, required: true },
  todayCount: { type: Number, default: 0 },
  // Kompakt: én rad, ikke et kort. Brukes når cupen er langt unna — den skal
  // kunne finnes, ikke lede skjermen.
  compact: { type: Boolean, default: false }
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
  <router-link v-if="compact" to="/cup" class="cup-row">
    <span class="cup-row__kicker">Cup</span>
    <span class="cup-row__body">
      <span class="cup-row__title">{{ cup.name }}</span>
      <span v-if="dateRange || cup.venue" class="cup-row__sub">{{ dateRange }}<template v-if="dateRange && cup.venue"> · </template>{{ cup.venue }}</span>
    </span>
    <svg class="cup-row__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
  </router-link>
  <router-link v-else to="/cup" class="ds-card ds-card--interactive cup-entry">
    <div class="cup-entry__top">
      <span class="cup-entry__kicker">Cup</span>
      <span v-if="pill" class="cup-entry__when">{{ pill }}</span>
    </div>
    <span class="cup-entry__name">{{ cup.name }}</span>
    <span v-if="cup.venue" class="cup-entry__detail">{{ cup.venue }}</span>
  </router-link>
</template>

<style scoped>
/* Samme rad som «Denne uka» og «Andre lag» — én form for alt som er en rad. */
.cup-row {
  display: flex;
  align-items: center;
  gap: var(--ds-space-md);
  padding: 14px var(--ds-space-md);
  background: var(--ds-color-bg-elevated);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-lg);
  text-decoration: none;
  color: inherit;
  -webkit-tap-highlight-color: transparent;
}

.cup-row:active { transform: scale(0.99); }

.cup-row__kicker {
  flex-shrink: 0;
  width: 72px;
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
}

.cup-row__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.cup-row__title {
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
}

.cup-row__sub {
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-tertiary);
}

.cup-row__chevron {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--ds-color-text-tertiary);
}

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
