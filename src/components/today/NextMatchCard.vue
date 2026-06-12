<script setup>
import { computed } from 'vue'
import { relativeDateLabel } from '../../lib/dateLabels'
import { teamLabel } from '../../lib/matchMeta'

// event fra useToday.nextMatch: { type: 'match'|'cup', date, time, opponent,
// teams (fargeslugs), teamName (cup), isHome, pitch, round, to }
const props = defineProps({
  event: { type: Object, required: true }
})

const when = computed(() => relativeDateLabel(props.event.date))

const detailLine = computed(() => {
  const d = new Date(props.event.date + 'T12:00:00')
  const t = (props.event.time || '').slice(0, 5)
  let when = d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'long' })
  if (t && t !== '00:00') when += ` kl. ${t}`
  const where = props.event.type === 'cup'
    ? props.event.pitch
    : (props.event.isHome ? 'hjemme' : 'borte')
  return where ? `${when} — ${where}` : when
})
</script>

<template>
  <router-link :to="event.to" class="ds-card ds-card--interactive next-match">
    <div class="next-match__top">
      <span class="next-match__tags">
        <span
          v-for="color in event.teams || []"
          :key="color"
          class="next-match__team-tag"
          :class="`next-match__team-tag--${color}`"
        >{{ teamLabel(color) }}</span>
        <span v-if="event.teamName" class="next-match__team-tag next-match__team-tag--cup">{{ event.teamName }}</span>
        <span class="next-match__kicker">{{ event.type === 'cup' ? 'Neste cupkamp' : 'Neste kamp' }}</span>
      </span>
      <span class="next-match__when">{{ when }}</span>
    </div>

    <span class="next-match__opponent">mot {{ event.opponent }}</span>
    <span class="next-match__detail">{{ detailLine }}</span>
  </router-link>
</template>

<style scoped>
.next-match {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-xs);
  padding: var(--ds-space-lg);
  text-decoration: none;
}

.next-match__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-sm);
  margin-bottom: 2px;
}

.next-match__tags {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.next-match__team-tag {
  display: inline-block;
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: var(--ds-radius-sm);
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.next-match__team-tag--gronn { background: var(--ds-team-gronn-bg); color: var(--ds-team-gronn); }
.next-match__team-tag--rod   { background: var(--ds-team-rod-bg);   color: var(--ds-team-rod); }
.next-match__team-tag--hvit  { background: var(--ds-team-hvit-bg);  color: var(--ds-team-hvit); border: 1px solid var(--ds-team-hvit-border); }
.next-match__team-tag--cup   { background: var(--ds-color-bg-subtle); color: var(--ds-color-text-secondary); }

.next-match__kicker {
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
  white-space: nowrap;
}

.next-match__when {
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  padding: 3px 10px;
  border-radius: var(--ds-radius-full);
  border: 1px solid var(--ds-color-border);
  color: var(--ds-color-text-secondary);
  white-space: nowrap;
  flex-shrink: 0;
}

.next-match__opponent {
  font-family: var(--ds-font-heading);
  font-size: var(--ds-text-xl);
  letter-spacing: -0.01em;
  line-height: 1.25;
  color: var(--ds-color-text-primary);
}

.next-match__detail {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
}
</style>
