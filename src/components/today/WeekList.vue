<script setup>
// Ukeliste — «Denne uka» på Hjem (trenere, tappbar) og /serie (foreldre, read-only).
defineProps({
  items: { type: Array, default: () => [] },
  interactive: { type: Boolean, default: true }
})

import { isToday } from '../../lib/dateLabels'

function weekDayLabel(iso) {
  if (isToday(iso)) return 'I dag'
  const s = new Date(iso + 'T12:00:00').toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short' })
  return (s.charAt(0).toUpperCase() + s.slice(1)).replace(/\./g, '')
}

function title(item) {
  if (item.kind === 'training') return 'Trening'
  if (item.kind === 'cup') return `Cup mot ${item.opponent}`
  return `Kamp mot ${item.opponent}`
}

function sub(item) {
  if (item.kind === 'training') return item.focus || ''
  const parts = []
  if (item.kind === 'match') parts.push(item.isHome ? 'Hjemme' : 'Borte')
  if (item.time) parts.push(item.time)
  return parts.join(' · ')
}
</script>

<template>
  <div class="week-list">
    <component
      :is="interactive ? 'router-link' : 'div'"
      v-for="(item, i) in items"
      :key="i"
      :to="interactive ? item.to : undefined"
      class="week-row"
      :class="{ 'week-row--static': !interactive }"
    >
      <span class="week-row__day">{{ weekDayLabel(item.date) }}</span>
      <span class="week-row__body">
        <span class="week-row__title">{{ title(item) }}</span>
        <span v-if="sub(item)" class="week-row__sub">{{ sub(item) }}</span>
      </span>
      <svg v-if="interactive" class="week-row__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
    </component>
  </div>
</template>

<style scoped>
.week-list {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
}

.week-row {
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
  transition:
    border-color var(--ds-duration-fast) var(--ds-ease-out),
    transform var(--ds-duration-fast) var(--ds-ease-out);
}

.week-row:not(.week-row--static):active { transform: scale(0.99); }

@media (hover: hover) and (pointer: fine) {
  .week-row:not(.week-row--static):hover { border-color: var(--ds-color-border-strong); }
}

.week-row__day {
  flex-shrink: 0;
  width: 72px;
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-tertiary);
  font-variant-numeric: tabular-nums;
}

.week-row__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.week-row__title {
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
}

.week-row__sub {
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.week-row__chevron {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--ds-color-text-tertiary);
}
</style>
