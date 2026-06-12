<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { teamColorsForMatch, teamLabel, isHomeMatch } from '../../lib/matchMeta'

const props = defineProps({
  match: { type: Object, required: true },
  prep: { type: Object, default: null },
  coachNames: { type: String, default: '' }
})

const router = useRouter()

const teamColors = computed(() => teamColorsForMatch(props.match))
const home = computed(() => isHomeMatch(props.match))
const opponent = computed(() => home.value ? props.match.away_team : props.match.home_team)

const kickoff = computed(() => {
  const t = (props.match.match_time || '').slice(0, 5)
  return t && t !== '00:00' ? t : ''
})

const inProgress = computed(() => props.prep?.status === 'running' || props.prep?.status === 'paused')

// Sjekkliste: dommer kun på hjemmekamp (prep.referee er null borte).
const checklist = computed(() => {
  if (!props.prep) return []
  const items = []
  if (props.prep.referee !== null) {
    items.push({ key: 'referee', label: 'Dommer satt', done: props.prep.referee })
  }
  items.push({ key: 'squad', label: 'Tropp tatt ut (vurder hospitanter)', done: props.prep.squad })
  items.push({ key: 'lineup', label: 'Lag satt opp', done: props.prep.lineup })
  return items
})

function openDetail() {
  router.push(`/kamp/${props.match.id}`)
}

function openLive() {
  router.push(`/kamp/${props.match.id}/live`)
}
</script>

<template>
  <div class="ds-card today-match" role="link" tabindex="0" @click="openDetail" @keydown.enter="openDetail">
    <div class="today-match__top">
      <span class="today-match__tags">
        <span
          v-for="color in teamColors"
          :key="color"
          class="today-match__team-tag"
          :class="`today-match__team-tag--${color}`"
        >{{ teamLabel(color) }}</span>
        <span class="today-match__venue">{{ home ? 'Hjemme' : 'Borte' }}</span>
      </span>
      <span class="today-match__kicker">Kampdag</span>
    </div>

    <div class="today-match__main">
      <span v-if="kickoff" class="today-match__time">{{ kickoff }}</span>
      <span class="today-match__opponent">mot {{ opponent }}</span>
    </div>

    <span v-if="coachNames" class="today-match__coaches">{{ coachNames }}</span>

    <ul v-if="checklist.length" class="today-match__checklist">
      <li v-for="item in checklist" :key="item.key" class="check-item" :class="{ 'check-item--done': item.done }">
        <svg v-if="item.done" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9"/>
          <polyline points="8.5 12.5 11 15 15.5 9.5"/>
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9"/>
        </svg>
        {{ item.label }}
      </li>
    </ul>

    <button type="button" class="ds-btn ds-btn--primary today-match__cta" @click.stop="openLive">
      {{ inProgress ? 'Fortsett kampen' : 'Åpne kampmodus' }}
    </button>
  </div>
</template>

<style scoped>
.today-match {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
  padding: var(--ds-space-lg);
  cursor: pointer;
  transition:
    transform 160ms var(--ds-ease-out),
    border-color 160ms var(--ds-ease-out);
  -webkit-tap-highlight-color: transparent;
}

@media (hover: hover) and (pointer: fine) {
  .today-match:hover {
    transform: translateY(-1px);
  }
}

.today-match:active {
  transform: scale(0.99);
}

@media (prefers-reduced-motion: reduce) {
  .today-match,
  .today-match:active {
    transform: none;
    transition: none;
  }
}

.today-match__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-sm);
}

.today-match__tags {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.today-match__team-tag {
  display: inline-block;
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: var(--ds-radius-sm);
  letter-spacing: 0.02em;
}

.today-match__team-tag--gronn { background: var(--ds-team-gronn-bg); color: var(--ds-team-gronn); }
.today-match__team-tag--rod   { background: var(--ds-team-rod-bg);   color: var(--ds-team-rod); }
.today-match__team-tag--hvit  { background: var(--ds-team-hvit-bg);  color: var(--ds-team-hvit); border: 1px solid var(--ds-team-hvit-border); }

.today-match__venue {
  font-size: 0.6875rem;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: var(--ds-radius-sm);
  background: var(--ds-color-bg-subtle);
  color: var(--ds-color-text-tertiary);
  letter-spacing: 0.02em;
}

.today-match__kicker {
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ds-color-warm);
}

.today-match__main {
  display: flex;
  align-items: baseline;
  gap: var(--ds-space-sm);
  flex-wrap: wrap;
}

.today-match__time {
  font-family: var(--ds-font-heading);
  font-size: 2.5rem;
  font-weight: var(--ds-weight-bold);
  line-height: 1;
  color: var(--ds-color-text-primary);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}

.today-match__opponent {
  font-size: var(--ds-text-lg);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-primary);
}

.today-match__coaches {
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-tertiary);
}

.today-match__checklist {
  list-style: none;
  margin: var(--ds-space-xs) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.check-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
}

.check-item svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  color: var(--ds-color-text-tertiary);
}

.check-item--done {
  color: var(--ds-color-text-primary);
}

.check-item--done svg {
  color: var(--ds-color-success);
}

.today-match__cta {
  margin-top: var(--ds-space-sm);
  width: 100%;
}
</style>
