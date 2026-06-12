<script setup>
import { computed } from 'vue'
import { cupTeam } from '../../lib/cupTeams'

const props = defineProps({
  match: { type: Object, required: true }
})

const teamName = computed(() => cupTeam(props.match.our_team)?.name || '')

const kickoff = computed(() => {
  const t = (props.match.match_time || '').slice(0, 5)
  return t && t !== '00:00' ? t : ''
})
</script>

<template>
  <router-link :to="`/cup/kamp/${match.id}`" class="ds-card ds-card--interactive today-cup">
    <div class="today-cup__top">
      <span v-if="teamName" class="today-cup__team">{{ teamName }}</span>
      <span class="today-cup__kicker">Cupkamp</span>
    </div>
    <div class="today-cup__main">
      <span v-if="kickoff" class="today-cup__time">{{ kickoff }}</span>
      <span class="today-cup__opponent">mot {{ match.opponent }}</span>
    </div>
    <div class="today-cup__meta">
      <span v-if="match.pitch">{{ match.pitch }}</span>
      <span v-if="match.round">{{ match.round }}</span>
    </div>
  </router-link>
</template>

<style scoped>
.today-cup {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-xs);
  padding: var(--ds-space-lg);
  text-decoration: none;
}

.today-cup__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-sm);
}

.today-cup__team {
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: var(--ds-radius-sm);
  background: var(--ds-color-bg-subtle);
  color: var(--ds-color-text-secondary);
  letter-spacing: 0.02em;
}

.today-cup__kicker {
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ds-color-warm);
}

.today-cup__main {
  display: flex;
  align-items: baseline;
  gap: var(--ds-space-sm);
  flex-wrap: wrap;
}

.today-cup__time {
  font-family: var(--ds-font-heading);
  font-size: 1.75rem;
  font-weight: var(--ds-weight-bold);
  line-height: 1;
  color: var(--ds-color-text-primary);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}

.today-cup__opponent {
  font-size: var(--ds-text-base);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-primary);
}

.today-cup__meta {
  display: flex;
  gap: var(--ds-space-md);
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-tertiary);
}
</style>
