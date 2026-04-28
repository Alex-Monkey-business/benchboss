<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useAuth } from '../stores/auth'
import { useSeasons } from '../composables/useSeasons'
import { useMatches } from '../composables/useMatches'
import { useExpenses } from '../composables/useExpenses'
import { useCoaches } from '../composables/useCoaches'
import MatchCard from '../components/MatchCard.vue'
import TeamFilter from '../components/TeamFilter.vue'

const { coach } = useAuth()
const { activeSeason, fetchSeasons } = useSeasons()
const { matches, fetchMatches, getCoachesForMatch } = useMatches()
const { expenses, fetchExpenses, getExpenseForMatch } = useExpenses()
const { coaches, fetchCoaches } = useCoaches()

const teamFilter = ref('alle')
const venueFilter = ref('alle')
const loading = ref(true)
const showPastMatches = ref(false)

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

function isHalsenTeam(teamName) {
  return (teamName || '').toLowerCase().includes('halsen')
}

function getColorFromName(name) {
  const n = (name || '').toLowerCase()
  if (n.includes('grønn') || n.includes('gronn')) return 'gronn'
  if (n.includes('rød') || n.includes('rod')) return 'rod'
  if (n.includes('hvit')) return 'hvit'
  return ''
}

// Get all team colors for a match (can be 2 for internal Halsen matches)
function getTeamColors(match) {
  const colors = []
  if (isHalsenTeam(match.home_team)) {
    const c = getColorFromName(match.home_team)
    if (c) colors.push(c)
  }
  if (isHalsenTeam(match.away_team)) {
    const c = getColorFromName(match.away_team)
    if (c && !colors.includes(c)) colors.push(c)
  }
  return colors
}

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

const venueFilteredMatches = computed(() => {
  if (venueFilter.value === 'hjemme') return halsenMatches.value.filter(m => isHomeMatch(m))
  if (venueFilter.value === 'borte') return halsenMatches.value.filter(m => isAwayMatch(m))
  return halsenMatches.value
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
  if (teamFilter.value === 'alle') return halsenMatches.value
  return halsenMatches.value.filter(m => getTeamColors(m).includes(teamFilter.value))
})

const venueCounts = computed(() => {
  const all = teamFilteredMatches.value
  return {
    alle: all.length,
    hjemme: all.filter(m => isHomeMatch(m)).length,
    borte: all.filter(m => isAwayMatch(m)).length
  }
})

const today = computed(() => new Date().toISOString().split('T')[0])

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
      const d = new Date(match.match_date + 'T12:00:00')
      groups.push({
        date: match.match_date,
        label: d.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' }),
        matches: []
      })
    }
    groups[groups.length - 1].matches.push(match)
  }
  return groups
}

const upcomingGroups = computed(() => groupByDate(upcomingMatches.value))
const pastGroups = computed(() => groupByDate(pastMatches.value))

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

    <div class="px-lg mb-md ds-anim-fade-up ds-anim-delay-2">
      <div class="filter-label">Hvor</div>
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
    </div>

    <div class="px-lg mb-lg ds-anim-fade-up ds-anim-delay-2">
      <div class="filter-label">Lag</div>
      <TeamFilter v-model="teamFilter" :counts="counts" />
    </div>

    <div v-if="loading" class="px-lg" style="text-align: center; padding: 48px 0;">
      <svg class="ds-anim-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--ds-color-accent)" stroke-width="2" stroke-linecap="round">
        <path d="M21 12a9 9 0 11-6.219-8.56"/>
      </svg>
    </div>

    <div v-else-if="filteredMatches.length === 0" class="px-lg ds-anim-fade-up ds-anim-delay-3">
      <div class="ds-empty">
        <img src="/illustrations/calendar.png" alt="" class="empty-illustration" />
        <h3 class="ds-empty__title">Ingen kamper enda</h3>
        <p class="ds-empty__description">Last opp kampprogram fra Mer-fanen</p>
      </div>
    </div>

    <div v-else>
      <!-- Kommende kamper -->
      <div v-if="upcomingGroups.length > 0">
        <div class="section-header ds-anim-fade-up ds-anim-delay-3">
          <h2 class="section-header__title">Kommende kamper</h2>
          <span class="ds-badge ds-badge--subtle">{{ upcomingMatches.length }}</span>
        </div>
        <div v-for="group in upcomingGroups" :key="group.date" class="mb-md">
          <div class="px-lg" style="padding-top: 4px; padding-bottom: 4px;">
            <span style="font-size: 0.8125rem; font-weight: 600; color: var(--ds-color-text-tertiary); text-transform: capitalize; letter-spacing: 0.02em;">
              {{ group.label }}
            </span>
          </div>
          <div class="px-lg ds-stack--sm ds-anim-stagger-list">
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

      <!-- Tidligere kamper (sammenleggbar) -->
      <div v-if="pastGroups.length > 0">
        <button
          type="button"
          class="section-header section-header--collapsible"
          :class="{ 'ds-anim-fade-up ds-anim-delay-3': upcomingGroups.length === 0 }"
          :aria-expanded="showPastMatches"
          @click="showPastMatches = !showPastMatches"
        >
          <h2 class="section-header__title">Tidligere kamper</h2>
          <span class="ds-badge ds-badge--subtle">{{ pastMatches.length }}</span>
          <span class="section-header__toggle">
            <span class="section-header__toggle-text">{{ showPastMatches ? 'Skjul' : 'Vis' }}</span>
            <svg
              :class="['section-header__chevron', { 'section-header__chevron--open': showPastMatches }]"
              viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </span>
        </button>
        <div v-if="showPastMatches">
          <div v-for="group in pastGroups" :key="group.date" class="mb-md">
            <div class="px-lg" style="padding-top: 4px; padding-bottom: 4px;">
              <span style="font-size: 0.8125rem; font-weight: 600; color: var(--ds-color-text-tertiary); text-transform: capitalize; letter-spacing: 0.02em;">
                {{ group.label }}
              </span>
            </div>
            <div class="px-lg ds-stack--sm ds-anim-stagger-list">
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
    </div>
  </div>
</template>

<style scoped>
.filter-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--ds-color-text-tertiary);
  margin-bottom: 8px;
}

.section-header--collapsible {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: 0;
  cursor: pointer;
  font: inherit;
  color: inherit;
  text-align: left;
  -webkit-tap-highlight-color: transparent;
}

.section-header--collapsible:hover .section-header__toggle,
.section-header--collapsible:focus-visible .section-header__toggle {
  background: var(--ds-color-accent);
  color: white;
  border-color: var(--ds-color-accent);
}

.section-header__toggle {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid var(--ds-color-border);
  border-radius: 999px;
  background: var(--ds-color-bg-elevated);
  color: var(--ds-color-text-secondary);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  transition: all 0.15s ease;
}

.section-header__toggle-text {
  line-height: 1;
}

.section-header__chevron {
  width: 14px;
  height: 14px;
  transition: transform 0.2s ease;
}

.section-header__chevron--open {
  transform: rotate(180deg);
}
</style>
