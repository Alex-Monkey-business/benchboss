<script setup>
import { computed } from 'vue'

const props = defineProps({
  match: { type: Object, required: true },
  expense: { type: Object, default: null },
  paidByName: { type: String, default: '' },
  coachNames: { type: String, default: '' }
})

function isHalsen(name) {
  return (name || '').toLowerCase().includes('halsen')
}

function colorFromName(name) {
  const n = (name || '').toLowerCase()
  if (n.includes('grønn') || n.includes('gronn')) return 'gronn'
  if (n.includes('rød') || n.includes('rod')) return 'rod'
  if (n.includes('hvit')) return 'hvit'
  return ''
}

// All team colors present in this match (1 or 2 for internal matches)
const teamColors = computed(() => {
  const colors = []
  if (isHalsen(props.match.home_team)) {
    const c = colorFromName(props.match.home_team)
    if (c) colors.push(c)
  }
  if (isHalsen(props.match.away_team)) {
    const c = colorFromName(props.match.away_team)
    if (c && !colors.includes(c)) colors.push(c)
  }
  return colors
})

// Is this an away game for Halsen?
const isAway = computed(() => {
  return !isHalsen(props.match.home_team) && isHalsen(props.match.away_team)
})

const formattedTime = computed(() => {
  if (!props.match.match_time) return ''
  const t = props.match.match_time.substring(0, 5)
  // "00:00" means time not set yet
  if (t === '00:00') return ''
  return t
})
</script>

<template>
  <router-link :to="`/kamp/${match.id}`" class="ds-card ds-card--interactive match-card">
    <div class="match-card__top">
      <span class="match-card__datetime">
        <span
          v-for="color in teamColors"
          :key="color"
          class="match-card__team-tag"
          :class="`match-card__team-tag--${color}`"
        >{{ color === 'gronn' ? 'Grønn' : color === 'rod' ? 'Rød' : 'Hvit' }}</span>
        <span v-if="isAway" class="match-card__venue-tag">Borte</span>
        {{ formattedTime }}
      </span>
      <span v-if="expense" class="expense-check">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </span>
    </div>
    <div class="match-card__teams">
      <span class="match-card__team">{{ match.home_team }}</span>
      <span class="match-card__vs">vs</span>
      <span class="match-card__team">{{ match.away_team }}</span>
    </div>
    <div class="match-card__meta">
      <!-- Dommer: fløyte-ikon -->
      <span v-if="match.referee" class="match-card__meta-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="16" r="5"/><line x1="12" y1="12" x2="22" y2="2"/><line x1="17" y1="2" x2="22" y2="2"/><line x1="22" y1="2" x2="22" y2="7"/></svg>
        {{ match.referee }}
      </span>
      <!-- Trenere: profil-ikon -->
      <span v-if="coachNames" class="match-card__meta-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 10-16 0"/></svg>
        {{ coachNames }}
      </span>
      <!-- Betaler: vipps-ikon -->
      <span v-if="paidByName" class="match-card__meta-item">
        <svg class="vipps-icon" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#FF5B24"/><g transform="translate(-60, -20) scale(2)"><path d="M57.3,40.7c3.7,0,5.8-1.8,7.8-4.4c1.1-1.4,2.5-1.7,3.5-0.9s1.1,2.3,0,3.7c-2.9,3.8-6.6,6.1-11.3,6.1c-5.1,0-9.6-2.8-12.7-7.7c-0.9-1.3-0.7-2.7,0.3-3.4s2.5-0.4,3.4,1C50.5,38.4,53.5,40.7,57.3,40.7z M64.2,28.4c0,1.8-1.4,3-3,3s-3-1.2-3-3s1.4-3,3-3S64.2,26.7,64.2,28.4z" fill="white"/></g></svg>
        {{ paidByName }}
      </span>
    </div>
  </router-link>
</template>

<style scoped>
.match-card {
  display: block;
  text-decoration: none;
}

/* Team tag label instead of colored dot */
.match-card__team-tag {
  display: inline-block;
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  letter-spacing: 0.02em;
  margin-right: 4px;
}

.match-card__team-tag--gronn {
  background: var(--ds-color-success-light);
  color: var(--ds-color-success);
}

.match-card__team-tag--rod {
  background: var(--ds-color-error-light);
  color: var(--ds-color-error);
}

.match-card__team-tag--hvit {
  background: var(--ds-color-bg-elevated);
  color: var(--ds-color-text-tertiary);
  border: 1px solid var(--ds-color-border-light);
}

.match-card__venue-tag {
  display: inline-block;
  font-size: 0.6875rem;
  font-weight: 500;
  padding: 1px 5px;
  border-radius: 4px;
  letter-spacing: 0.02em;
  margin-right: 4px;
  background: var(--ds-color-bg-subtle);
  color: var(--ds-color-text-tertiary);
}
</style>
