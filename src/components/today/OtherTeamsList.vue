<script setup>
import { teamLabel } from '../../lib/matchMeta'

// De andre lagenes neste kamp. Bevisst lettere enn NextMatchCard — samme
// informasjon, mindre vekt, så egen kamp fortsatt er det øyet lander på.
defineProps({
  items: { type: Array, default: () => [] }
})

function dayLabel(iso) {
  const s = new Date(iso + 'T12:00:00').toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short' })
  return (s.charAt(0).toUpperCase() + s.slice(1)).replace(/\./g, '')
}
</script>

<template>
  <div class="other-teams">
    <router-link
      v-for="item in items"
      :key="item.color"
      :to="item.to"
      class="other-row"
    >
      <span class="other-row__tag" :class="`other-row__tag--${item.color}`">{{ teamLabel(item.color) }}</span>
      <span class="other-row__body">
        <span class="other-row__title">mot {{ item.opponent }}</span>
        <span class="other-row__sub">{{ dayLabel(item.date) }}<template v-if="item.time"> · {{ item.time }}</template> · {{ item.isHome ? 'hjemme' : 'borte' }}</span>
      </span>
      <svg class="other-row__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
    </router-link>
  </div>
</template>

<style scoped>
.other-teams {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
}

.other-row {
  display: flex;
  align-items: center;
  gap: var(--ds-space-md);
  padding: 12px var(--ds-space-md);
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

.other-row:active { transform: scale(0.99); }

@media (hover: hover) and (pointer: fine) {
  .other-row:hover { border-color: var(--ds-color-border-strong); }
}

.other-row__tag {
  flex-shrink: 0;
  min-width: 44px;
  text-align: center;
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: var(--ds-radius-sm);
  letter-spacing: 0.02em;
}

.other-row__tag--gronn { background: var(--ds-team-gronn-bg); color: var(--ds-team-gronn); }
.other-row__tag--rod   { background: var(--ds-team-rod-bg);   color: var(--ds-team-rod); }
.other-row__tag--hvit  { background: var(--ds-team-hvit-bg);  color: var(--ds-team-hvit); border: 1px solid var(--ds-team-hvit-border); }

.other-row__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.other-row__title {
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.other-row__sub {
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.other-row__chevron {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--ds-color-text-tertiary);
}
</style>
