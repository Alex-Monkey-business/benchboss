<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useSeasons } from '../composables/useSeasons'
import { useMatches } from '../composables/useMatches'
import { useExpenses } from '../composables/useExpenses'
import { useCoaches } from '../composables/useCoaches'
import MatchCard from '../components/MatchCard.vue'
import TeamFilter from '../components/TeamFilter.vue'

const { activeSeason, fetchSeasons } = useSeasons()
const { matches, fetchMatches } = useMatches()
const { expenses, fetchExpenses, getExpenseForMatch } = useExpenses()
const { coaches, fetchCoaches } = useCoaches()

const teamFilter = ref('alle')
const loading = ref(true)

onMounted(async () => {
  await Promise.all([fetchSeasons(), fetchCoaches()])
  if (activeSeason.value) {
    await fetchMatches(activeSeason.value.id)
    await fetchExpenses(matches.value.map(m => m.id))
  }
  loading.value = false
})

function isHalsen(name) {
  return (name || '').toLowerCase().includes('halsen')
}

function colorFromName(name) {
  const n = (name || '').toLowerCase()
  if (n.includes('grønn') || n.includes('gronn')) return 'gronn'
  if (n.includes('rød') || n.includes('rod')) return 'rod'
  if (n.includes('hvit')) return 'hvit'
  return null
}

function getTeamColors(match) {
  const colors = []
  if (isHalsen(match.home_team)) {
    const c = colorFromName(match.home_team)
    if (c) colors.push(c)
  }
  if (isHalsen(match.away_team)) {
    const c = colorFromName(match.away_team)
    if (c && !colors.includes(c)) colors.push(c)
  }
  return colors
}

const halsenMatches = computed(() =>
  matches.value.filter(m => isHalsen(m.home_team) || isHalsen(m.away_team))
)

const filteredMatches = computed(() => {
  let result = [...halsenMatches.value]
  if (teamFilter.value !== 'alle') {
    result = result.filter(m => getTeamColors(m).includes(teamFilter.value))
  }
  result.sort((a, b) => a.match_date.localeCompare(b.match_date) || (a.match_time || '').localeCompare(b.match_time || ''))
  return result
})

const counts = computed(() => {
  const c = { alle: halsenMatches.value.length, gronn: 0, rod: 0, hvit: 0 }
  halsenMatches.value.forEach(m => {
    getTeamColors(m).forEach(color => {
      if (c[color] !== undefined) c[color]++
    })
  })
  return c
})

// Group matches by date
const groupedMatches = computed(() => {
  const groups = []
  let currentDate = ''
  for (const match of filteredMatches.value) {
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
})

function getCoachName(coachId) {
  return coaches.value.find(c => c.id === coachId)?.name || ''
}
</script>

<template>
  <div class="desktop-container">
    <div class="page-header">
      <h1 class="page-header__title">Kamper</h1>
      <p class="page-header__subtitle">{{ activeSeason?.name }}</p>
    </div>

    <div class="px-lg mb-md">
      <TeamFilter v-model="teamFilter" :counts="counts" />
    </div>

    <div v-if="loading" class="px-lg" style="text-align: center; padding: 48px 0;">
      <svg class="ds-anim-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--ds-color-accent)" stroke-width="2" stroke-linecap="round">
        <path d="M21 12a9 9 0 11-6.219-8.56"/>
      </svg>
    </div>

    <div v-else-if="filteredMatches.length === 0" class="px-lg">
      <div class="ds-empty">
        <img src="/illustrations/empty-box.png" alt="" class="empty-illustration" />
        <h3 class="ds-empty__title">Ingen kamper</h3>
        <p class="ds-empty__description">Last opp kampprogram fra "Mer"-fanen</p>
      </div>
    </div>

    <div v-else>
      <div v-for="group in groupedMatches" :key="group.date" class="mb-md">
        <div class="px-lg" style="padding-top: 4px; padding-bottom: 4px;">
          <span style="font-size: 0.8125rem; font-weight: 600; color: var(--ds-color-text-tertiary); text-transform: capitalize; letter-spacing: 0.02em;">
            {{ group.label }}
          </span>
        </div>
        <div class="px-lg ds-stack--sm">
          <MatchCard
            v-for="match in group.matches"
            :key="match.id"
            :match="match"
            :expense="getExpenseForMatch(match.id)"
            :paid-by-name="getCoachName(getExpenseForMatch(match.id)?.paid_by)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
