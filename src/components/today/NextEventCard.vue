<script setup>
import { computed } from 'vue'
import { daysUntil } from '../../lib/dateLabels'

const props = defineProps({
  event: { type: Object, required: true }
})

const countdown = computed(() => {
  const days = daysUntil(props.event.date)
  if (days === 1) return 'I morgen'
  if (days === 2) return 'I overmorgen'
  return `Om ${days} dager`
})

const kickoff = computed(() => {
  const t = (props.event.time || '').slice(0, 5)
  return t && t !== '00:00' ? t : ''
})
</script>

<template>
  <router-link :to="event.to" class="ds-card ds-card--interactive next-event">
    <span class="next-event__kicker">Neste</span>
    <span class="next-event__label">{{ event.label }}</span>
    <span class="next-event__sub">
      {{ countdown }}<template v-if="event.sublabel"> — {{ event.sublabel }}</template><template v-if="kickoff"> kl. {{ kickoff }}</template>
    </span>
    <p v-if="event.focus" class="next-event__focus">{{ event.focus }}</p>
    <ul v-if="event.drills?.length" class="next-event__drills">
      <li v-for="drill in event.drills" :key="drill">{{ drill }}</li>
    </ul>
  </router-link>
</template>

<style scoped>
.next-event {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-xs);
  padding: var(--ds-space-lg);
  text-decoration: none;
}

.next-event__kicker {
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
}

.next-event__label {
  font-family: var(--ds-font-heading);
  font-size: var(--ds-text-xl);
  letter-spacing: -0.01em;
  color: var(--ds-color-text-primary);
}

.next-event__sub {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
}

.next-event__focus {
  margin: var(--ds-space-xs) 0 0;
  font-family: var(--ds-font-heading);
  font-size: var(--ds-text-base);
  line-height: 1.45;
  color: var(--ds-color-text-primary);
}

.next-event__drills {
  list-style: none;
  margin: var(--ds-space-xs) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.next-event__drills li {
  position: relative;
  padding-left: 14px;
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
}

.next-event__drills li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.55em;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--ds-color-text-tertiary);
}
</style>
