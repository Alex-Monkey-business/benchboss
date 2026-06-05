<script setup>
import { computed } from 'vue'
import { isPast, isToday } from '../lib/dateLabels'
import { isHalsen, teamColorsForMatch, teamLabel, isPlayed, hasResult } from '../lib/matchMeta'

const props = defineProps({
  match: { type: Object, required: true },
  expense: { type: Object, default: null },
  paidByName: { type: String, default: '' },
  coachNames: { type: String, default: '' }
})

// Days until match (negative = past)
function daysUntil(dateStr) {
  if (!dateStr) return 999
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const d = new Date(dateStr + 'T12:00:00'); d.setHours(0, 0, 0, 0)
  return Math.round((d - now) / (24 * 60 * 60 * 1000))
}

// One-status-at-a-time, prioritized by urgency.
// Utlegg + dommer is a HOME match concern only — away matches don't need either.
const status = computed(() => {
  const m = props.match
  const isHome = isHalsen(m.home_team)
  const past = isPast(m.match_date)
  const days = daysUntil(m.match_date)
  const upcomingSoon = days >= 0 && days <= 7
  const played = isPlayed(m)

  // 1. Spilt, men resultat ikke lagt inn — viktigst rett etter kamp (alle kamper)
  if (played && !hasResult(m)) {
    return { label: 'Mangler resultat', tone: 'warn' }
  }

  // 2. Kommende hjemmekamp uten dommer
  if (isHome && !played && upcomingSoon && !m.referee) {
    return { label: 'Trenger dommer', tone: 'warn' }
  }

  // 3. Spilt hjemmekamp uten utlegg
  if (isHome && past && !props.expense) {
    return { label: 'Mangler utlegg', tone: 'warn' }
  }

  // 4. Spilt hjemmekamp med utlegg → check ✓
  if (isHome && past && props.expense) {
    return { icon: 'check', tone: 'ok' }
  }

  return null
})

// All team colors present in this match (1 or 2 for internal matches)
const teamColors = computed(() => teamColorsForMatch(props.match))

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
        >{{ teamLabel(color) }}</span>
      </span>
      <span v-if="status" class="match-status" :class="`match-status--${status.tone}`">
        <svg v-if="status.icon === 'check'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        <template v-else>{{ status.label }}</template>
      </span>
    </div>
    <div class="match-card__teams">
      <span class="match-card__team">{{ match.home_team }}</span>
      <span v-if="hasResult(match)" class="match-card__score">{{ match.home_score }} – {{ match.away_score }}</span>
      <span v-else-if="formattedTime" class="match-card__time">{{ formattedTime }}</span>
      <span v-else class="match-card__vs">vs</span>
      <span class="match-card__team">{{ match.away_team }}</span>
    </div>
    <div class="match-card__meta">
      <!-- Dommer: fløyte -->
      <span v-if="match.referee" class="match-card__meta-item">
        <svg class="icon--wide" viewBox="0 0 473 296" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M284.905 0.425146C306.948 -1.97707 339.141 5.96786 356.503 20.0267C364.583 26.5708 373.088 34.6402 380.786 41.7611C397.525 57.4304 413.993 73.3832 430.186 89.6124C436.181 95.5755 442.067 101.646 447.842 107.822C451.48 111.704 456.131 116.486 458.928 120.91C466.331 132.621 470.567 147.114 471.97 160.765C474.809 188.382 464.984 218.808 447.169 239.994C442.131 245.984 437.731 250.311 432.507 255.697C419.033 269.581 408.493 276.549 390.62 284.124C376.651 290.042 367.33 292.965 352.011 294.271C335.557 295.674 320.029 295.989 304.042 291.159C297.691 289.321 291.087 287.153 285.278 283.915C256.697 267.983 237.708 238.178 212.885 217.808C208.51 219.815 203.605 222.68 199.367 225.058L119.089 269.3C111.31 273.534 103.501 277.715 95.6637 281.841C90.2178 284.697 83.9884 288.016 78.3639 290.337C74.2197 286.88 69.176 281.649 65.3318 277.754C58.8071 271.187 52.376 264.528 46.0403 257.78L0 208.853C0.254106 192.641 0.413029 176.427 0.477042 160.213C0.537716 152.439 1.02422 144.228 0.757312 136.512C19.0661 127.494 38.9072 116.468 57.1336 106.858L178.404 43.2318L220.215 21.8836C228.022 17.921 240.56 11.3299 248.479 8.32051C260.171 3.92838 272.442 1.26838 284.905 0.425146ZM359.124 84.5395C375.345 83.5872 391.526 85.0743 406.876 90.6677C426.453 97.8025 446.119 114.144 454.95 133.244C465.345 155.733 465.532 180.753 456.99 203.853C445.003 236.271 418.846 261.173 387.769 275.416C361.239 287.573 327.282 290.156 299.747 279.878C278.055 271.785 259.794 255.837 250.165 234.629C246.382 226.297 241.821 210.955 243.176 201.923C243.454 200.066 244.406 198.312 245.035 196.554C245.447 195.401 245.789 193.841 245.183 192.702C244.701 191.794 243.435 191.204 242.486 190.958C239.992 190.311 218.137 202.903 213.859 205.232C170.902 228.744 128.199 254.058 85.1541 277.061C84.104 270.51 84.2103 260.422 84.1891 253.643L84.1758 222.237C87.3862 220.906 94.4002 216.803 97.8143 214.929L124.055 200.567L258.948 126.885L300.763 104.372C322.614 92.7589 333.51 86.6372 359.124 84.5395ZM249.633 23.4116L249.945 23.3955C252.191 24.3824 275.192 49.8883 279.083 53.5561C283.377 57.6053 296.377 72.3005 299.545 77.3371C298.918 78.0131 298.256 78.6559 297.563 79.2627C293.878 82.4612 270.747 95.9633 267.852 95.7534C264.284 92.7256 260.054 88.4036 256.694 85.0733C250.794 79.2157 244.93 73.3256 239.096 67.4034C234.359 62.6541 229.697 57.8285 225.116 52.9286C223.36 51.0484 216.969 44.8509 217.413 42.3443C220.273 37.4666 243.168 26.639 249.633 23.4116Z"/></svg>
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
  padding: var(--ds-space-lg);
  transition:
    transform 160ms var(--ds-ease-out),
    border-color 160ms var(--ds-ease-out),
    box-shadow 160ms var(--ds-ease-out);
}

/* Hover only on real pointers — touch tap shouldn't lift the card */
@media (hover: hover) and (pointer: fine) {
  .match-card:hover {
    transform: translateY(-1px);
  }
}

.match-card:active {
  transform: scale(0.98);
  transition-duration: 100ms;
}

@media (prefers-reduced-motion: reduce) {
  .match-card,
  .match-card:active {
    transform: none;
    transition: none;
  }
}

/* Team tag label instead of colored dot */
.match-card__team-tag {
  display: inline-block;
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: var(--ds-radius-sm);
  letter-spacing: 0.02em;
  margin-right: 4px;
}

.match-card__team-tag--gronn {
  background: var(--ds-team-gronn-bg);
  color: var(--ds-team-gronn);
}

.match-card__team-tag--rod {
  background: var(--ds-team-rod-bg);
  color: var(--ds-team-rod);
}

.match-card__team-tag--hvit {
  background: var(--ds-team-hvit-bg);
  color: var(--ds-team-hvit);
  border: 1px solid var(--ds-team-hvit-border);
}

.match-card__venue-tag {
  display: inline-block;
  font-size: 0.6875rem;
  font-weight: 500;
  padding: 1px 5px;
  border-radius: var(--ds-radius-sm);
  letter-spacing: 0.02em;
  margin-right: 4px;
  background: var(--ds-color-bg-subtle);
  color: var(--ds-color-text-tertiary);
}

.match-card__score {
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-bold);
  color: var(--ds-color-text-primary);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
  line-height: 1.2;
  padding: 0 2px;
}

/* ---- Status pill (top-right of match card) ---- */
.match-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.6875rem;
  font-weight: var(--ds-weight-semibold);
  letter-spacing: -0.005em;
  line-height: 1;
  padding: 3px 8px;
  border-radius: var(--ds-radius-full);
  white-space: nowrap;
}

.match-status--ok {
  padding: 0;
  background: transparent;
  color: var(--ds-color-success);
}

.match-status--ok svg {
  width: 14px;
  height: 14px;
}

.match-status--warn {
  background: var(--ds-color-warm-bg);
  color: var(--ds-color-warm-text);
}

.match-status--today {
  background: var(--ds-color-accent);
  color: var(--ds-color-accent-text);
}
</style>
