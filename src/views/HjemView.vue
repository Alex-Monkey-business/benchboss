<script setup>
import { ref, computed, onMounted } from 'vue'
import { useToday } from '../composables/useToday'
import { useMatches } from '../composables/useMatches'
import { useCoaches } from '../composables/useCoaches'
import TodayMatchCard from '../components/today/TodayMatchCard.vue'
import TodayCupCard from '../components/today/TodayCupCard.vue'
import TodayTrainingCard from '../components/today/TodayTrainingCard.vue'
import ReminderList from '../components/today/ReminderList.vue'
import NextTrainingCard from '../components/today/NextTrainingCard.vue'
import NextMatchCard from '../components/today/NextMatchCard.vue'
import MatchCardSkeleton from '../components/MatchCardSkeleton.vue'

const {
  loading, refresh, greeting,
  todayMatches, todayCupMatches, todayTraining,
  prepFor, reminders, nextTraining, nextMatch, weekAhead
} = useToday()

const { getCoachesForMatch } = useMatches()
const { coaches } = useCoaches()

const ready = ref(false)

onMounted(async () => {
  await refresh()
  ready.value = true
})

const dateLine = computed(() => {
  const s = new Date().toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
})

const hasToday = computed(() =>
  todayMatches.value.length > 0 || todayCupMatches.value.length > 0 || !!todayTraining.value
)

const matchToday = computed(() => todayMatches.value.length > 0 || todayCupMatches.value.length > 0)

// Det som kommer: uka dekker det meste. Neste-kortene er fallback for
// hendelser UTENFOR uka, og vises bare når ukelista er tom.
const upNext = computed(() => {
  if (weekAhead.value.length) return []
  const items = []
  if (!hasToday.value && nextTraining.value) items.push({ kind: 'training', date: nextTraining.value.date })
  if (!matchToday.value && nextMatch.value) items.push({ kind: 'match', date: nextMatch.value.date })
  return items.sort((a, b) => a.date.localeCompare(b.date))
})

const showEmpty = computed(() =>
  ready.value && !loading.value && !hasToday.value && weekAhead.value.length === 0 && upNext.value.length === 0 && reminders.value.length === 0
)

// «Ons 6. aug» — kort daglabel til ukelista.
function weekDayLabel(iso) {
  const s = new Date(iso + 'T12:00:00').toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short' })
  return (s.charAt(0).toUpperCase() + s.slice(1)).replace(/\./g, '')
}

function coachNamesForMatch(matchId) {
  return getCoachesForMatch(matchId)
    .map(id => coaches.value.find(c => c.id === id)?.name)
    .filter(Boolean)
    .join(', ')
}
</script>

<template>
  <div class="desktop-container">
    <header class="hjem-hero px-lg ds-anim-fade-up">
      <h1 class="hjem-hero__greeting">{{ greeting }}</h1>
      <p class="hjem-hero__date">{{ dateLine }}</p>
    </header>

    <div v-if="loading" class="px-lg">
      <MatchCardSkeleton :count="2" />
    </div>

    <div v-else class="px-lg hjem-stack">
      <!-- Dagens hovedhendelser: kamp slår trening, men begge vises ved kollisjon -->
      <TodayMatchCard
        v-for="match in todayMatches"
        :key="match.id"
        :match="match"
        :prep="prepFor(match.id)"
        :coach-names="coachNamesForMatch(match.id)"
        class="ds-anim-fade-up ds-anim-delay-1"
      />

      <TodayCupCard
        v-for="match in todayCupMatches"
        :key="match.id"
        :match="match"
        class="ds-anim-fade-up ds-anim-delay-1"
      />

      <TodayTrainingCard
        v-if="todayTraining"
        :period="todayTraining.period"
        :session="todayTraining.session"
        class="ds-anim-fade-up ds-anim-delay-2"
      />

      <!-- Det som kommer: nærmeste hendelse øverst -->
      <template v-for="item in upNext" :key="item.kind">
        <NextTrainingCard
          v-if="item.kind === 'training'"
          :period="nextTraining.period"
          :session="nextTraining.session"
          :date="nextTraining.date"
          class="ds-anim-fade-up ds-anim-delay-1"
        />
        <NextMatchCard
          v-else
          :event="nextMatch"
          class="ds-anim-fade-up ds-anim-delay-2"
        />
      </template>

      <!-- Resten av uka — bare dager med innhold, ingen fyll -->
      <section v-if="weekAhead.length" class="ds-anim-fade-up ds-anim-delay-2">
        <h2 class="hjem-section-kicker">Denne uka</h2>
        <div class="week-list">
          <router-link v-for="(item, i) in weekAhead" :key="i" :to="item.to" class="week-row">
            <span class="week-row__day">{{ weekDayLabel(item.date) }}</span>
            <span class="week-row__body">
              <span class="week-row__title">
                {{ item.kind === 'training' ? 'Trening' : item.kind === 'cup' ? `Cup mot ${item.opponent}` : `Kamp mot ${item.opponent}` }}
              </span>
              <span v-if="item.kind === 'training' && item.focus" class="week-row__sub">{{ item.focus }}</span>
              <span v-else-if="item.kind !== 'training'" class="week-row__sub">
                {{ item.kind === 'match' ? (item.isHome ? 'Hjemme' : 'Borte') : '' }}{{ item.time ? (item.kind === 'match' ? ' · ' : '') + item.time : '' }}
              </span>
            </span>
            <svg class="week-row__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </router-link>
        </div>
      </section>

      <section v-if="reminders.length" class="ds-anim-fade-up ds-anim-delay-3">
        <h2 class="hjem-section-kicker">Å ordne</h2>
        <ReminderList :reminders="reminders" />
      </section>

      <div v-if="showEmpty" class="ds-empty ds-anim-fade-up ds-anim-delay-1">
        <img src="/illustrations/bench-boss-feature-icons/512/dashboard-home-transparent.png" alt="" class="ds-empty__illo" />
        <h3 class="ds-empty__title">Ingenting på planen</h3>
        <p class="ds-empty__description">Ingen kamper eller treninger fremover — nyt friheten.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hjem-hero {
  padding-top: var(--ds-space-xl);
  padding-bottom: var(--ds-space-lg);
}

.hjem-hero__greeting {
  margin: 0;
  font-family: var(--ds-font-heading);
  font-size: 2rem;
  font-weight: var(--ds-weight-bold);
  letter-spacing: -0.02em;
  line-height: 1.15;
  color: var(--ds-color-text-primary);
}

.hjem-hero__date {
  margin: 6px 0 0;
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-tertiary);
}

.hjem-stack {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-md);
  padding-bottom: var(--ds-space-2xl);
}

.hjem-section-kicker {
  margin: var(--ds-space-sm) 0 var(--ds-space-sm);
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
}

/* ---- Denne uka ---- */
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

.week-row:active { transform: scale(0.99); }

@media (hover: hover) and (pointer: fine) {
  .week-row:hover { border-color: var(--ds-color-border-strong); }
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
