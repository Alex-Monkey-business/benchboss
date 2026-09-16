<script setup>
import { computed } from 'vue'
import { useFeatures } from '../composables/useFeatures'
import { isPast } from '../lib/dateLabels'
import { isOurs, isPlayed, hasResult } from '../lib/matchMeta'

// Kampen som én rad rundt en midtakse: hjemmelag til venstre, tid eller
// resultat i midten, bortelag til høyre. Hvor vi spiller sier plassen, ikke
// et ord. Klubbmerkene ble for trange på 360 px — de bor på kampsida. Under raden står bare det som ikke kan leses ut av den: hvem som
// har kampen, og om noe mangler.

const { usesReferees } = useFeatures()

const props = defineProps({
  match: { type: Object, required: true },
  expense: { type: Object, default: null },
  coaches: { type: Array, default: () => [] }
})

function daysUntil(dateStr) {
  if (!dateStr) return 999
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const d = new Date(dateStr + 'T12:00:00'); d.setHours(0, 0, 0, 0)
  return Math.round((d - now) / (24 * 60 * 60 * 1000))
}

const isHome = computed(() => isOurs(props.match.home_team))
const played = computed(() => isPlayed(props.match))

const status = computed(() => {
  const m = props.match
  const days = daysUntil(m.match_date)
  const soon = days >= 0 && days <= 7
  const past = isPast(m.match_date)
  if (played.value && !hasResult(m)) return { label: 'Resultat mangler', tone: 'muted' }
  if (usesReferees.value && isHome.value && !played.value && soon && !m.referee) return { label: 'Dommer mangler', tone: 'warn' }
  if (usesReferees.value && isHome.value && past && !props.expense) return { label: 'Utlegg mangler', tone: 'muted' }
  return null
})

const time = computed(() => {
  const t = (props.match.match_time || '').slice(0, 5)
  return t && t !== '00:00' ? t : ''
})

const showFoot = computed(() => !!status.value || props.coaches.length > 0)
</script>

<template>
  <router-link :to="`/kamp/${match.id}`" class="mrow">
    <span class="mrow__side mrow__side--home">
      <span class="mrow__name">{{ match.home_team }}</span>
    </span>
    <span class="mrow__mid">
      <span v-if="hasResult(match)" class="mrow__score">{{ match.home_score }} – {{ match.away_score }}</span>
      <span v-else-if="time" class="mrow__time">{{ time }}</span>
      <span v-else class="mrow__time mrow__time--tba">–</span>
    </span>
    <span class="mrow__side mrow__side--away">
      <span class="mrow__name">{{ match.away_team }}</span>
    </span>

    <span v-if="showFoot" class="mrow__foot">
      <span v-if="status" class="mrow__state" :class="`mrow__state--${status.tone}`">{{ status.label }}</span>
      <span v-else></span>
      <span v-if="coaches.length" class="mrow__faces">
        <span v-for="c in coaches" :key="c.id" class="mrow__face" :title="c.name">
          <img v-if="c.image" :src="c.image" alt="" />
          <span v-else>{{ c.name.charAt(0) }}</span>
        </span>
      </span>
    </span>
  </router-link>
</template>

<style scoped>
.mrow {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  column-gap: 14px;
  padding: 18px 14px;
  background: var(--ds-color-bg-subtle);
  border-radius: var(--ds-radius-lg);
  text-decoration: none;
  color: inherit;
  -webkit-tap-highlight-color: transparent;
}

.mrow:active { background: var(--ds-color-bg-hover); }

.mrow__side {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.mrow__side--home { justify-content: flex-end; text-align: right; }
.mrow__side--away { justify-content: flex-start; text-align: left; }

.mrow__name {
  min-width: 0;
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-primary);
  line-height: 1.25;
  /* Lange navn brytes mellom ordene, ikke inni dem. */
  overflow-wrap: break-word;
}

.mrow__mid {
  min-width: 52px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.mrow__time {
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-secondary);
}

.mrow__time--tba { color: var(--ds-color-text-tertiary); }

.mrow__score {
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-md);
  font-weight: var(--ds-weight-bold);
  letter-spacing: -0.01em;
  color: var(--ds-color-text-primary);
}

/* Bunnlinja: tilstand til venstre, hvem som har kampen til høyre. */
.mrow__foot {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
  min-height: 20px;
}

.mrow__state {
  font-size: var(--ds-text-xs);
  line-height: 1.3;
}
.mrow__state--muted { color: var(--ds-color-text-tertiary); }
.mrow__state--warn {
  color: var(--ds-color-warm-text);
  font-weight: var(--ds-weight-semibold);
}

.mrow__faces { display: inline-flex; padding-left: 6px; }

.mrow__face {
  width: 22px;
  height: 22px;
  margin-left: -6px;
  border-radius: 50%;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--ds-color-bg-sunken);
  box-shadow: 0 0 0 2px var(--ds-color-bg-subtle);
  font-size: 11px;
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-secondary);
}

.mrow__face img { width: 100%; height: 100%; object-fit: cover; }
</style>
