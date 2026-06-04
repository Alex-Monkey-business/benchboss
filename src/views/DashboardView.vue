<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useAuth } from '../stores/auth'
import { useSeasons } from '../composables/useSeasons'
import { useMatches } from '../composables/useMatches'
import { useExpenses } from '../composables/useExpenses'
import { useCoaches } from '../composables/useCoaches'
import MatchCard from '../components/MatchCard.vue'
import MatchCardSkeleton from '../components/MatchCardSkeleton.vue'
import TeamFilter from '../components/TeamFilter.vue'
import { useStaggerOnce } from '../composables/useStaggerOnce'
import { relativeDateLabel, isToday, shortRelativeDate } from '../lib/dateLabels'
import { teamColorsForMatch } from '../lib/matchMeta'
import { useRouter } from 'vue-router'

const router = useRouter()

const playStagger = useStaggerOnce('dashboard-matches')

const { coach } = useAuth()
const { activeSeason, fetchSeasons } = useSeasons()
const { matches, fetchMatches, getCoachesForMatch } = useMatches()
const { expenses, fetchExpenses, getExpenseForMatch } = useExpenses()
const { coaches, fetchCoaches } = useCoaches()

const teamFilter = ref('alle')
const venueFilter = ref('alle')
const timeFilter = ref('upcoming')
// Skeleton only on the very first load. Data persists in module-level refs
// across navigation, so subsequent visits render instantly.
const loading = ref(matches.value.length === 0)

onMounted(async () => {
  await Promise.all([fetchSeasons(), fetchCoaches()])
  if (activeSeason.value) {
    await fetchMatches(activeSeason.value.id)
    await fetchExpenses(matches.value.map(m => m.id))
  }
  loading.value = false
})

watch(activeSeason, async (s) => {
  if (s) {
    await fetchMatches(s.id)
    await fetchExpenses(matches.value.map(m => m.id))
  }
})

// Smart suggestion banner — picks the single most useful prompt
// based on current state. Returns null if nothing's actionable.
const smartPrompt = computed(() => {
  if (!coach.value || loading.value) return null
  const todayStr = new Date().toISOString().slice(0, 10)

  // Past HOME matches where I was the assigned coach but no expense logged.
  // (Away matches don't have utlegg.)
  const pendingMatches = matches.value
    .filter(m =>
      isHalsenTeam(m.home_team) &&
      m.match_date < todayStr &&
      !getExpenseForMatch(m.id) &&
      getCoachesForMatch(m.id).includes(coach.value.id)
    )
    .sort((a, b) => b.match_date.localeCompare(a.match_date))

  if (pendingMatches.length > 0) {
    const m = pendingMatches[0]
    const opponent = m.away_team
    const when = shortRelativeDate(m.match_date)
    const count = pendingMatches.length
    return {
      kind: 'pending-expense',
      title: count === 1
        ? `Du var trener mot ${opponent} ${when.toLowerCase()}`
        : `${count} kamper venter på utlegg`,
      body: count === 1
        ? 'Registrer Vipps-utlegget når du har et øyeblikk.'
        : `Den eldste er mot ${opponent}, ${when.toLowerCase()}.`,
      action: 'Registrer',
      matchId: m.id
    }
  }

  // Upcoming HOME match (within a week) without dommer assigned
  const refLess = matches.value
    .filter(m =>
      isHalsenTeam(m.home_team) &&
      m.match_date >= todayStr &&
      !m.referee &&
      getCoachesForMatch(m.id).includes(coach.value.id)
    )
    .sort((a, b) => a.match_date.localeCompare(b.match_date))
  const days7 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const refLessSoon = refLess.find(m => m.match_date <= days7)
  if (refLessSoon) {
    return {
      kind: 'no-ref',
      title: `Mangler dommer ${shortRelativeDate(refLessSoon.match_date).toLowerCase()}`,
      body: `${refLessSoon.away_team} hjemme — ordne dommer før kampstart.`,
      action: 'Sett opp',
      matchId: refLessSoon.id
    }
  }

  // Today's match where I'm assigned (any home/away)
  const todaysMine = matches.value.find(m =>
    m.match_date === todayStr &&
    getCoachesForMatch(m.id).includes(coach.value.id)
  )
  if (todaysMine) {
    const opponent = isHalsenTeam(todaysMine.home_team) ? todaysMine.away_team : todaysMine.home_team
    const time = (todaysMine.match_time || '').slice(0, 5)
    return {
      kind: 'today',
      title: `Du er trener i dag mot ${opponent}`,
      body: time && time !== '00:00' ? `Kampen starter ${time}.` : 'Husk dommer og utstyr.',
      action: 'Se kamp',
      matchId: todaysMine.id
    }
  }

  return null
})

function openPromptMatch(matchId) {
  router.push(`/kamp/${matchId}`)
}

function isHalsenTeam(teamName) {
  return (teamName || '').toLowerCase().includes('halsen')
}

// Get all team colors for a match (can be 2 for internal Halsen matches)
const getTeamColors = (match) => teamColorsForMatch(match)

function isHomeMatch(match) {
  return isHalsenTeam(match.home_team)
}

function isAwayMatch(match) {
  return isHalsenTeam(match.away_team)
}

function isHalsenMatch(match) {
  return isHomeMatch(match) || isAwayMatch(match)
}

// Only Halsen matches — filter out irrelevant matches from the Excel import
const halsenMatches = computed(() => matches.value.filter(m => isHalsenMatch(m)))

const filteredMatches = computed(() => {
  let result = [...halsenMatches.value]

  // Venue filter
  if (venueFilter.value === 'hjemme') {
    result = result.filter(m => isHomeMatch(m))
  } else if (venueFilter.value === 'borte') {
    result = result.filter(m => isAwayMatch(m))
  }

  // Team filter — match if ANY of the Halsen teams in the match has this color
  if (teamFilter.value !== 'alle') {
    result = result.filter(m => getTeamColors(m).includes(teamFilter.value))
  }

  result.sort((a, b) => a.match_date.localeCompare(b.match_date) || (a.match_time || '').localeCompare(b.match_time || ''))
  return result
})

const today = computed(() => new Date().toISOString().split('T')[0])

function isInCurrentTimeFilter(match) {
  if (timeFilter.value === 'past') return match.match_date < today.value
  return match.match_date >= today.value
}

const timeScopedHalsenMatches = computed(() =>
  halsenMatches.value.filter(isInCurrentTimeFilter)
)

const venueFilteredMatches = computed(() => {
  const list = timeScopedHalsenMatches.value
  if (venueFilter.value === 'hjemme') return list.filter(m => isHomeMatch(m))
  if (venueFilter.value === 'borte') return list.filter(m => isAwayMatch(m))
  return list
})

const counts = computed(() => {
  const list = venueFilteredMatches.value
  const c = { alle: list.length, gronn: 0, rod: 0, hvit: 0 }
  list.forEach(m => {
    const colors = getTeamColors(m)
    colors.forEach(color => {
      if (c[color] !== undefined) c[color]++
    })
  })
  return c
})

const teamFilteredMatches = computed(() => {
  const list = timeScopedHalsenMatches.value
  if (teamFilter.value === 'alle') return list
  return list.filter(m => getTeamColors(m).includes(teamFilter.value))
})

const venueCounts = computed(() => {
  const all = teamFilteredMatches.value
  return {
    alle: all.length,
    hjemme: all.filter(m => isHomeMatch(m)).length,
    borte: all.filter(m => isAwayMatch(m)).length
  }
})

const upcomingMatches = computed(() => filteredMatches.value.filter(m => m.match_date >= today.value))
const pastMatches = computed(() =>
  [...filteredMatches.value.filter(m => m.match_date < today.value)].reverse()
)

// Group matches by date
function groupByDate(matchList) {
  const groups = []
  let currentDate = ''
  for (const match of matchList) {
    if (match.match_date !== currentDate) {
      currentDate = match.match_date
      groups.push({
        date: match.match_date,
        label: relativeDateLabel(match.match_date),
        matches: []
      })
    }
    groups[groups.length - 1].matches.push(match)
  }
  return groups
}

const upcomingGroups = computed(() => groupByDate(upcomingMatches.value))
const pastGroups = computed(() => groupByDate(pastMatches.value))

const displayedGroups = computed(() =>
  timeFilter.value === 'past' ? pastGroups.value : upcomingGroups.value
)
const displayedCount = computed(() =>
  timeFilter.value === 'past' ? pastMatches.value.length : upcomingMatches.value.length
)

function getCoachName(coachId) {
  return coaches.value.find(c => c.id === coachId)?.name || ''
}

function getCoachNamesForMatch(matchId) {
  const ids = getCoachesForMatch(matchId)
  return ids.map(id => getCoachName(id)).filter(Boolean).join(', ')
}
</script>

<template>
  <div class="desktop-container">
    <div class="page-header">
      <h1 class="page-header__title ds-anim-fade-up">{{ activeSeason?.name || 'Kampoversikt' }}</h1>
    </div>

    <div class="time-tabs ds-anim-fade-up ds-anim-delay-1" role="tablist">
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

    <!-- Smart prompt banner -->
    <Transition name="ds-slide-up">
      <button v-if="smartPrompt" class="smart-prompt px-lg" @click="openPromptMatch(smartPrompt.matchId)">
        <span class="smart-prompt__dot" aria-hidden="true"></span>
        <span class="smart-prompt__body">
          <span class="smart-prompt__title">{{ smartPrompt.title }}</span>
          <span class="smart-prompt__sub">{{ smartPrompt.body }}</span>
        </span>
        <span class="smart-prompt__action">
          {{ smartPrompt.action }}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </span>
      </button>
    </Transition>

    <div class="px-lg mb-lg ds-anim-fade-up ds-anim-delay-2">
      <div class="filter-row">
        <div class="ds-pills">
          <button
            v-for="f in [{ key: 'alle', label: 'Alle' }, { key: 'hjemme', label: 'Hjemme' }, { key: 'borte', label: 'Borte' }]"
            :key="f.key"
            :class="['ds-pill', { 'ds-pill--active': venueFilter === f.key }]"
            @click="venueFilter = f.key"
          >
            {{ f.label }}
            <span class="ds-pill__count">{{ venueCounts[f.key] }}</span>
          </button>
        </div>
        <span class="filter-row__divider" aria-hidden="true"></span>
        <TeamFilter v-model="teamFilter" :counts="counts" />
      </div>
    </div>

    <div v-if="loading" class="px-lg">
      <MatchCardSkeleton :count="4" />
    </div>

    <div v-else-if="filteredMatches.length === 0" class="px-lg ds-anim-fade-up ds-anim-delay-3">
      <div class="ds-empty">
        <img src="/illustrations/calendar.png" alt="" class="empty-illustration" />
        <h3 class="ds-empty__title">Ingen kamper enda</h3>
        <p class="ds-empty__description">Last opp kampprogram fra Mer-fanen</p>
      </div>
    </div>

    <div v-else>
      <div v-if="displayedCount === 0" class="px-lg">
        <div class="ds-empty">
          <h3 class="ds-empty__title">
            {{ timeFilter === 'past' ? 'Ingen tidligere kamper' : 'Ingen kommende kamper' }}
          </h3>
          <p class="ds-empty__description">
            {{ timeFilter === 'past' ? 'Spilte kamper vil dukke opp her etter hvert.' : 'Alle kommende kamper er ferdige eller filtrert vekk.' }}
          </p>
        </div>
      </div>

      <div v-for="group in displayedGroups" :key="group.date" class="mb-md">
        <div class="day-header" :class="{ 'day-header--today': isToday(group.date) }">
          <span v-if="isToday(group.date)" class="day-header__dot" aria-hidden="true"></span>
          <span class="day-header__label">{{ group.label }}</span>
        </div>
        <div class="px-lg ds-stack--sm" :class="{ 'ds-anim-stagger-list': playStagger }">
          <MatchCard
            v-for="match in group.matches"
            :key="match.id"
            :match="match"
            :expense="getExpenseForMatch(match.id)"
            :paid-by-name="getCoachName(getExpenseForMatch(match.id)?.paid_by)"
            :coach-names="getCoachNamesForMatch(match.id)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Smart prompt banner — warm accent, full-row tappable */
.smart-prompt {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
  width: calc(100% - var(--ds-space-lg) * 2);
  margin: 0 var(--ds-space-lg) var(--ds-space-md);
  padding: 14px var(--ds-space-md);
  border: 1px solid rgba(185, 96, 63, 0.22);
  border-radius: var(--ds-radius-lg);
  background: var(--ds-color-warm-bg);
  text-align: left;
  cursor: pointer;
  font-family: var(--ds-font-body);
  transition:
    transform var(--ds-duration-fast) var(--ds-ease-out),
    border-color var(--ds-duration-fast) var(--ds-ease-out);
  -webkit-tap-highlight-color: transparent;
}

.smart-prompt:active {
  transform: scale(0.99);
}

@media (hover: hover) and (pointer: fine) {
  .smart-prompt:hover {
    border-color: rgba(185, 96, 63, 0.4);
  }
}

.smart-prompt__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ds-color-warm);
  box-shadow: 0 0 0 4px rgba(185, 96, 63, 0.16);
  flex-shrink: 0;
}

.smart-prompt__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.smart-prompt__title {
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
  letter-spacing: -0.005em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.smart-prompt__sub {
  font-size: var(--ds-text-xs);
  color: var(--ds-color-warm-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.smart-prompt__action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-warm-text);
  flex-shrink: 0;
}

.smart-prompt__action svg {
  width: 14px;
  height: 14px;
}

.day-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px var(--ds-space-lg) 4px;
}

.day-header__label {
  font-size: 0.8125rem;
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-tertiary);
  letter-spacing: -0.005em;
}

.day-header--today .day-header__label {
  color: var(--ds-color-warm-text);
  font-weight: var(--ds-weight-semibold);
}

.day-header__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ds-color-warm);
  box-shadow: 0 0 0 4px var(--ds-color-warm-bg);
  flex-shrink: 0;
}

.filter-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.filter-row__divider {
  width: 1px;
  height: 18px;
  background: var(--ds-color-border);
  margin: 0 4px;
  flex-shrink: 0;
}

@media (max-width: 480px) {
  .filter-row__divider {
    display: none;
  }
}

.time-tabs {
  display: flex;
  gap: 24px;
  padding: 0 var(--ds-space-lg);
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

.time-tabs__option:hover {
  color: var(--ds-color-text-primary);
}

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
