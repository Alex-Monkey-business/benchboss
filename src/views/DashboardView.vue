<script setup>
import { useKlubbmerke } from '../composables/useKlubbmerke'
import Spot from '../components/Spot.vue'
import { ref, computed, onMounted, watch } from 'vue'
import { useAuth } from '../stores/auth'
import { useSeasons } from '../composables/useSeasons'
import { useMatches } from '../composables/useMatches'
import { useExpenses } from '../composables/useExpenses'
import { useCoaches } from '../composables/useCoaches'
import { useMatchMode } from '../composables/useMatchMode'
import MatchCard from '../components/MatchCard.vue'
import MatchCardSkeleton from '../components/MatchCardSkeleton.vue'
import TeamFilter from '../components/TeamFilter.vue'
import SeasonPicker from '../components/SeasonPicker.vue'
import NyKampSheet from '../components/NyKampSheet.vue'
import { useStaggerOnce } from '../composables/useStaggerOnce'
import { relativeDateLabel, isToday, localISODate } from '../lib/dateLabels'
import { teamColorsForMatch, isOurs, isOurMatch as isOurMatchMeta, teamSlugs } from '../lib/matchMeta'


const playStagger = useStaggerOnce('dashboard-matches')

const { coach, isCoach, isPlatformAdmin } = useAuth()
// Treningskamper og vinterserie står ikke i FIKS: de legges inn her, der
// trenerne ser kampene sine.
const kanLeggeTil = computed(() => isCoach.value || isPlatformAdmin.value)
const visNyKamp = ref(false)
const { viewingSeason, ensureSeasons } = useSeasons()
const { matches, ensureMatches, getCoachesForMatch } = useMatches()
const { expenses, getExpenseForMatch } = useExpenses()
const { coaches, fetchCoaches } = useCoaches()
const { fetchSessionStatuses, statusByMatch } = useMatchMode()

const teamFilter = ref('alle')
const venueFilter = ref('alle')
const timeFilter = ref('upcoming')
// Står «Kommende» tom mens «Tidligere» har kamper, åpner vi der. Bare ved
// første lasting, og aldri over en fane treneren har valgt selv.
let fanenValgt = false
function velgFane(f) { fanenValgt = true; timeFilter.value = f }
// Skeleton only on the very first load. Data persists in module-level refs
// across navigation, so subsequent visits render instantly.
const loading = ref(matches.value.length === 0)

onMounted(async () => {
  // Parallelt og uten å vente: lista trenger den ikke, men kampsida tegner
  // riktig fase i første bilde når statusen ligger klar.
  if (viewingSeason.value?.id) fetchSessionStatuses(viewingSeason.value.id)
  // Sesongen fra sist går i samme bølge som sesonglista: kampene (med
  // trenere, tropp og utlegg) kommer i én rundtur, og bare hvis sesongen
  // viser seg å være en annen, hentes de på nytt. Ferskt i 30 s.
  const kjent = viewingSeason.value?.id || null
  await Promise.all([ensureSeasons(), fetchCoaches(), kjent ? ensureMatches(kjent) : null])
  if (viewingSeason.value && viewingSeason.value.id !== kjent) {
    fetchSessionStatuses(viewingSeason.value.id)
    await ensureMatches(viewingSeason.value.id)
  }
  loading.value = false
  if (!fanenValgt && upcomingMatches.value.length === 0 && pastMatches.value.length > 0) {
    timeFilter.value = 'past'
  }
})

watch(viewingSeason, (s) => {
  if (s) { ensureMatches(s.id); fetchSessionStatuses(s.id) }
})

// Get all team colors for a match (can be 2 for internal matches)
const getTeamColors = (match) => teamColorsForMatch(match)

function isHomeMatch(match) {
  return isOurs(match.home_team)
}

function isAwayMatch(match) {
  return isOurs(match.away_team)
}

function isOurMatch(match) {
  return isOurMatchMeta(match)
}

// Only our matches — filter out irrelevant matches from the Excel import
const ourMatches = computed(() => matches.value.filter(m => isOurMatch(m)))

const filteredMatches = computed(() => {
  let result = [...ourMatches.value]

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

const today = computed(() => localISODate())

// Spilt er spilt: en kamp med resultat, eller som er avsluttet i kampmodus,
// står under «Tidligere» med en gang — ikke først i morgen.
function erTidligere(match) {
  if (match.match_date < today.value) return true
  if (match.match_date > today.value) return false
  return (match.home_score != null && match.away_score != null) || statusByMatch.value[match.id] === 'finished'
}

function isInCurrentTimeFilter(match) {
  return timeFilter.value === 'past' ? erTidligere(match) : !erTidligere(match)
}

const timeScopedHalsenMatches = computed(() =>
  ourMatches.value.filter(isInCurrentTimeFilter)
)

const venueFilteredMatches = computed(() => {
  const list = timeScopedHalsenMatches.value
  if (venueFilter.value === 'hjemme') return list.filter(m => isHomeMatch(m))
  if (venueFilter.value === 'borte') return list.filter(m => isAwayMatch(m))
  return list
})

const counts = computed(() => {
  const list = venueFilteredMatches.value
  const c = { alle: list.length, ...Object.fromEntries(teamSlugs().map(k => [k, 0])) }
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

// Filtrene finnes bare når lista er lang nok til å trenge dem. To filterrader
// over to kamper var det tyngste på sida, og de filtrerte ingenting.
const showFilters = computed(() => timeScopedHalsenMatches.value.length >= 6)
watch(showFilters, (v) => {
  if (!v) { teamFilter.value = 'alle'; venueFilter.value = 'alle' }
})

const upcomingMatches = computed(() => filteredMatches.value.filter(m => !erTidligere(m)))
const pastMatches = computed(() =>
  [...filteredMatches.value.filter(erTidligere)].reverse()
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

// Kampsida skal åpne ferdig: merkene til de neste motstanderne hentes nå.
const { forvarm } = useKlubbmerke()
watch(upcomingMatches, l => forvarm(l.slice(0, 3).flatMap(m => [m.home_team, m.away_team])), { immediate: true })
const pastGroups = computed(() => groupByDate(pastMatches.value))

const displayedGroups = computed(() =>
  timeFilter.value === 'past' ? pastGroups.value : upcomingGroups.value
)
const displayedCount = computed(() =>
  timeFilter.value === 'past' ? pastMatches.value.length : upcomingMatches.value.length
)

function getCoachesForMatchList(matchId) {
  return getCoachesForMatch(matchId).map(id => coaches.value.find(c => c.id === id)).filter(Boolean)
}
</script>

<template>
  <div class="desktop-container">
    <div class="page-header kamper-header ds-anim-fade-up">
      <SeasonPicker variant="title" />
      <button
        v-if="kanLeggeTil && viewingSeason"
        type="button"
        class="ds-btn ds-btn--secondary kamper-header__ny"
        aria-label="Ny kamp"
        @click="visNyKamp = true"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        <span class="kamper-header__ny-tekst">Kamp</span>
      </button>
    </div>

    <div class="time-tabs ds-anim-fade-up ds-anim-delay-1" role="tablist">
      <button
        type="button"
        role="tab"
        :aria-selected="timeFilter === 'upcoming'"
        :class="['time-tabs__option', { 'time-tabs__option--active': timeFilter === 'upcoming' }]"
        @click="velgFane('upcoming')"
      >
        Kommende
        <span class="time-tabs__count">{{ upcomingMatches.length }}</span>
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="timeFilter === 'past'"
        :class="['time-tabs__option', { 'time-tabs__option--active': timeFilter === 'past' }]"
        @click="velgFane('past')"
      >
        Tidligere
        <span class="time-tabs__count">{{ pastMatches.length }}</span>
      </button>
    </div>

    <div v-if="showFilters" class="px-lg mb-md ds-anim-fade-up ds-anim-delay-2">
      <div class="filter-row">
        <div class="ds-pills">
          <button
            type="button"
            :class="['ds-pill', { 'ds-pill--active': venueFilter === 'alle' && teamFilter === 'alle' }]"
            @click="venueFilter = 'alle'; teamFilter = 'alle'"
          >
            Alle
            <span class="ds-pill__count">{{ venueCounts.alle }}</span>
          </button>
          <button
            v-for="f in [{ key: 'hjemme', label: 'Hjemme' }, { key: 'borte', label: 'Borte' }]"
            :key="f.key"
            type="button"
            :class="['ds-pill', { 'ds-pill--active': venueFilter === f.key }]"
            @click="venueFilter = venueFilter === f.key ? 'alle' : f.key"
          >
            {{ f.label }}
            <span class="ds-pill__count">{{ venueCounts[f.key] }}</span>
          </button>
        </div>
        <span class="filter-row__divider" aria-hidden="true"></span>
        <TeamFilter v-model="teamFilter" :counts="counts" uten-alle />
      </div>
    </div>

    <div v-if="loading" class="px-lg">
      <MatchCardSkeleton :count="4" variant="row" />
    </div>

    <div v-else-if="filteredMatches.length === 0" class="px-lg ds-anim-fade-up ds-anim-delay-3">
      <div class="ds-empty">
        <Spot name="match" class="ds-empty__illo" />
        <h3 class="ds-empty__title">Ingen kamper ennå</h3>
        <button
          v-if="kanLeggeTil && viewingSeason"
          type="button"
          class="ds-btn ds-btn--primary ds-empty__action"
          @click="visNyKamp = true"
        >Legg inn kamp</button>
      </div>
    </div>

    <div v-else class="px-lg">
      <div v-if="displayedCount === 0">
        <div class="ds-empty">
          <Spot name="match" class="ds-empty__illo" />
          <h3 class="ds-empty__title">
            {{ timeFilter === 'past' ? 'Ingen tidligere kamper' : 'Ingen kommende kamper' }}
          </h3>
        </div>
      </div>

      <section v-for="group in displayedGroups" :key="group.date" class="daygroup">
        <h2 class="day-header" :class="{ 'day-header--today': isToday(group.date) }">{{ group.label }}</h2>
        <div class="mlist" :class="{ 'ds-anim-stagger-list': playStagger }">
          <MatchCard
            v-for="match in group.matches"
            :key="match.id"
            :match="match"
            :expense="getExpenseForMatch(match.id)"
            :coaches="getCoachesForMatchList(match.id)"
          />
        </div>
      </section>
    </div>
    <NyKampSheet :show="visNyKamp" :season-id="viewingSeason?.id || null" @close="visNyKamp = false" />
  </div>
</template>

<style scoped>
.kamper-header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--ds-space-md); }
.kamper-header > :first-child { min-width: 0; flex: 1; }
.kamper-header__ny {
  flex-shrink: 0; min-height: 44px; padding: 0 var(--ds-space-lg); gap: 6px;
  border-radius: var(--ds-radius-full);
}
.kamper-header__ny svg { width: 16px; height: 16px; }
/* Smale skjermer: bare plusset, så «Høst 2026» får stå på én linje. */
@media (max-width: 359px) {
  .kamper-header__ny { width: 44px; padding: 0; justify-content: center; }
  .kamper-header__ny-tekst { display: none; }
  .kamper-header__ny svg { width: 18px; height: 18px; }
}

/* Hver kamp lever for seg selv i sin egen myke gruppe. Dagen er en liten
   tittel over, ikke en boks rundt. */
.daygroup { margin-bottom: var(--ds-space-md); }

.day-header {
  margin: 0;
  /* Samme innmarg som teksten i kortet under, så dagen og lagene står på linje. */
  padding: 4px var(--ds-space-md) 8px;
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-tertiary);
  letter-spacing: 0;
  text-transform: none;
}

.day-header--today { color: var(--ds-color-warm-text); }

.mlist { display: flex; flex-direction: column; gap: 10px; }

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
  .filter-row__divider { display: none; }
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
  align-items: baseline;
  gap: 6px;
  min-height: 44px;
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

/* Tallet er tall, ikke en brikke. */
.time-tabs__count {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--ds-color-text-tertiary);
  font-variant-numeric: tabular-nums;
}
</style>
