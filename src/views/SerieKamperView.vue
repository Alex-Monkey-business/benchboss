<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useSeasons } from '../composables/useSeasons'
import { useMatches } from '../composables/useMatches'
import { useCoaches } from '../composables/useCoaches'
import { useTrainingPeriods } from '../composables/useTrainingPeriods'
import { useTrainingSessions } from '../composables/useTrainingSessions'
import { useCups } from '../composables/useCups'
import { relativeDateLabel, isToday, localISODate } from '../lib/dateLabels'
import { teamColorsForMatch as teamColors, isHomeMatch, isHalsenMatch, teamLabel } from '../lib/matchMeta'
import { resolveUpcomingPeriod, buildWeekAhead } from '../lib/weekAhead'
import TeamFilter from '../components/TeamFilter.vue'
import { useTeamFilter } from '../composables/useTeamFilter'
import MatchCardSkeleton from '../components/MatchCardSkeleton.vue'
import SeasonPicker from '../components/SeasonPicker.vue'
import WeekList from '../components/today/WeekList.vue'

const { viewingSeason, status: seasonStatus, fetchSeasons } = useSeasons()
const { matches, status: matchStatus, fetchMatches, getCoachesForMatch } = useMatches()
const { coaches, fetchCoaches } = useCoaches()
const { periods, fetchPeriods } = useTrainingPeriods()
const { sessions, fetchSessions } = useTrainingSessions()
const { activeCup, fetchCups } = useCups()

const { teamFilter } = useTeamFilter()
const timeFilter = ref('upcoming')
const loading = ref(matches.value.length === 0)

// Sesongen er inngangen til alt annet her — feiler den, er det ingen kamper
// å vise, og «ingen kommende kamper» ville vært en løgn.
const loadFailed = computed(() =>
  seasonStatus.value === 'error' ||
  matchStatus.value === 'error' ||
  (seasonStatus.value === 'ok' && !viewingSeason.value)
)

onMounted(async () => {
  await Promise.all([fetchSeasons(), fetchCoaches(), fetchPeriods(), fetchCups()])
  const jobs = []
  if (viewingSeason.value) jobs.push(fetchMatches(viewingSeason.value.id))
  const period = resolveUpcomingPeriod(periods.value)
  if (period) jobs.push(fetchSessions(period.id))
  await Promise.all(jobs)
  loading.value = false
})

watch(viewingSeason, async (s) => {
  if (s) await fetchMatches(s.id)
})

// Ukeplanen — samme liste som trenerne ser på Hjem, men uten lenker
// (trenings- og kampdetaljer er trenerflater).
const weekAhead = computed(() => buildWeekAhead({
  period: resolveUpcomingPeriod(periods.value),
  sessions: sessions.value,
  matches: matches.value,
  cup: activeCup.value,
  includeToday: true
}))

function hasResult(m) {
  return m.home_score != null && m.away_score != null
}

function timeLabel(m) {
  const t = (m.match_time || '').slice(0, 5)
  return t && t !== '00:00' ? t : ''
}

function coachNamesForMatch(matchId) {
  return getCoachesForMatch(matchId)
    .map(id => coaches.value.find(c => c.id === id)?.name || '')
    .filter(Boolean)
    .join(', ')
}

// Kun Halsen-kamper (filtrer bort irrelevante rader fra Excel-importen).
const halsenMatches = computed(() => matches.value.filter(isHalsenMatch))

const today = computed(() => localISODate())

const counts = computed(() => {
  const list = halsenMatches.value.filter(m =>
    timeFilter.value === 'past' ? m.match_date < today.value : m.match_date >= today.value
  )
  const c = { alle: list.length, gronn: 0, rod: 0, hvit: 0 }
  list.forEach(m => teamColors(m).forEach(color => { if (c[color] !== undefined) c[color]++ }))
  return c
})

const filteredMatches = computed(() => {
  let list = [...halsenMatches.value]
  if (teamFilter.value !== 'alle') {
    list = list.filter(m => teamColors(m).includes(teamFilter.value))
  }
  list.sort((a, b) => a.match_date.localeCompare(b.match_date) || (a.match_time || '').localeCompare(b.match_time || ''))
  return list
})

const upcomingMatches = computed(() => filteredMatches.value.filter(m => m.match_date >= today.value))
const pastMatches = computed(() => [...filteredMatches.value.filter(m => m.match_date < today.value)].reverse())

const displayedMatches = computed(() => timeFilter.value === 'past' ? pastMatches.value : upcomingMatches.value)

function groupByDate(list) {
  const groups = []
  let current = ''
  for (const m of list) {
    if (m.match_date !== current) {
      current = m.match_date
      groups.push({ date: m.match_date, label: relativeDateLabel(m.match_date), matches: [] })
    }
    groups[groups.length - 1].matches.push(m)
  }
  return groups
}

const displayedGroups = computed(() => groupByDate(displayedMatches.value))
</script>

<template>
  <div class="desktop-container">
    <div class="page-header">
      <SeasonPicker variant="title" />
    </div>

    <div class="px-lg">
      <section v-if="weekAhead.length" class="serie-week">
        <h2 class="serie-week__kicker">Denne uka</h2>
        <WeekList :items="weekAhead" :interactive="false" />
      </section>

      <div class="time-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          :aria-selected="timeFilter === 'upcoming'"
          :class="['time-tabs__option', { 'time-tabs__option--active': timeFilter === 'upcoming' }]"
          @click="timeFilter = 'upcoming'"
        >
          Kommende
          <span class="time-tabs__count">{{ upcomingMatches.length }}</span>
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="timeFilter === 'past'"
          :class="['time-tabs__option', { 'time-tabs__option--active': timeFilter === 'past' }]"
          @click="timeFilter = 'past'"
        >
          Tidligere
          <span class="time-tabs__count">{{ pastMatches.length }}</span>
        </button>
      </div>

      <div class="mb-md">
        <TeamFilter v-model="teamFilter" :counts="counts" />
      </div>

      <MatchCardSkeleton v-if="loading" :count="4" />

      <!-- Uten denne blir siden helt blank når sesonger eller kamper feiler:
           fetchMatches kalles aldri fordi viewingSeason står igjen som null. -->
      <div v-else-if="loadFailed" class="ds-empty">
        <h3 class="ds-empty__title">Kunne ikke laste kampene</h3>
        <p class="ds-empty__description">Sjekk nettforbindelsen og prøv igjen.</p>
      </div>

      <div v-else-if="displayedMatches.length === 0" class="ds-empty">
        <img src="/illustrations/bench-boss-feature-icons/512/matches-transparent.png" alt="" class="ds-empty__illo" />
        <h3 class="ds-empty__title">
          {{ timeFilter === 'past' ? 'Ingen tidligere kamper' : 'Ingen kommende kamper' }}
        </h3>
        <p class="ds-empty__description">
          {{ timeFilter === 'past' ? 'Spilte kamper dukker opp her etter hvert.' : 'Ingen kommende kamper i denne sesongen.' }}
        </p>
      </div>

      <template v-else>
        <div v-for="group in displayedGroups" :key="group.date" class="daygroup">
          <div class="day-label" :class="{ 'day-label--today': isToday(group.date) }">{{ group.label }}</div>
          <div class="list">
            <div v-for="m in group.matches" :key="m.id" class="ds-card match-card serie-mcard">
              <div class="match-card__top">
                <span class="match-card__datetime">
                  <span
                    v-for="color in teamColors(m)"
                    :key="color"
                    class="match-card__team-tag"
                    :class="`match-card__team-tag--${color}`"
                  >{{ teamLabel(color) }}</span>
                  <span class="match-card__venue-tag">{{ isHomeMatch(m) ? 'Hjemme' : 'Borte' }}</span>
                </span>
              </div>
              <div class="match-card__teams">
                <span class="match-card__team">{{ m.home_team }}</span>
                <span v-if="hasResult(m)" class="match-card__score">{{ m.home_score }} – {{ m.away_score }}</span>
                <span v-else-if="timeLabel(m)" class="match-card__time">{{ timeLabel(m) }}</span>
                <span v-else class="match-card__vs">vs</span>
                <span class="match-card__team">{{ m.away_team }}</span>
              </div>
              <div v-if="coachNamesForMatch(m.id)" class="match-card__meta">
                <span class="match-card__meta-item">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 10-16 0"/></svg>
                  {{ coachNamesForMatch(m.id) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.serie-week { margin-bottom: var(--ds-space-lg); }

.serie-week__kicker {
  margin: 0 0 var(--ds-space-sm);
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
}

.daygroup { margin-bottom: var(--ds-space-lg); }
.day-label {
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  text-transform: capitalize;
  color: var(--ds-color-text-secondary);
  margin: var(--ds-space-lg) 2px var(--ds-space-sm);
}
.day-label--today { color: var(--ds-color-warm-text); }
.list { display: flex; flex-direction: column; gap: var(--ds-space-sm); }

/* Read-only kort — ingen lenke, ingen hover-løft */
.serie-mcard { padding: var(--ds-space-lg); }
.serie-mcard .match-card__teams { margin-bottom: 10px; }
.serie-mcard .match-card__meta:empty { display: none; }

/* Lag-tag + hvor-tag + resultat (kopiert fra MatchCard, scoped der) */
.match-card__team-tag {
  display: inline-block;
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: var(--ds-radius-sm);
  letter-spacing: 0.02em;
  margin-right: 4px;
}
.match-card__team-tag--gronn { background: var(--ds-team-gronn-bg); color: var(--ds-team-gronn); }
.match-card__team-tag--rod { background: var(--ds-team-rod-bg); color: var(--ds-team-rod); }
.match-card__team-tag--hvit {
  background: var(--ds-team-hvit-bg);
  color: var(--ds-team-hvit);
  border: 1px solid var(--ds-team-hvit-border);
}
.match-card__venue-tag {
  display: inline-block;
  font-size: 0.6875rem;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: var(--ds-radius-sm);
  letter-spacing: 0.02em;
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

.time-tabs {
  display: flex;
  gap: 24px;
  border-bottom: 1px solid var(--ds-color-border-light);
  margin-bottom: var(--ds-space-md);
}
.time-tabs__option {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--ds-color-text-tertiary);
  font-family: var(--ds-font-body);
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
  -webkit-tap-highlight-color: transparent;
  margin-bottom: -1px;
}
.time-tabs__option:hover { color: var(--ds-color-text-primary); }
.time-tabs__option--active {
  color: var(--ds-color-text-primary);
  border-bottom-color: var(--ds-color-accent);
}
.time-tabs__count {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--ds-color-text-tertiary);
  background: var(--ds-color-bg-subtle);
  padding: 1px 7px;
  border-radius: var(--ds-radius-full);
  font-variant-numeric: tabular-nums;
  min-width: 20px;
  text-align: center;
}
.time-tabs__option--active .time-tabs__count {
  background: var(--ds-color-accent-light);
  color: var(--ds-color-accent);
}
</style>
