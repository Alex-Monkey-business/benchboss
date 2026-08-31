<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAuth } from '../stores/auth'
import { useCups } from '../composables/useCups'
import { useCupMatches } from '../composables/useCupMatches'
import { cupTeam } from '../lib/cupTeams'
import { useCupFilter } from '../composables/useCupFilter'
import { useCupTeams } from '../composables/useCupTeams'
import CupTeamFilter from '../components/CupTeamFilter.vue'
import CupTabs from '../components/CupTabs.vue'

const { isParent } = useAuth()
const { activeCup, fetchCups } = useCups()
const { cupMatches, loading, status, fetchCupMatches } = useCupMatches()
const { teamFilter, setFilter } = useCupFilter()
const { cupTeams } = useCupTeams()
const ready = ref(false)

onMounted(async () => {
  await fetchCups()
  if (activeCup.value) await fetchCupMatches(activeCup.value.id)
  ready.value = true
})

function teamName(slug) {
  return cupTeams.value.find(t => t.slug === slug)?.name || cupTeam(slug)?.name || slug
}

function dayLabel(dateStr) {
  if (!dateStr) return 'Dato kommer'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' })
}

function timeLabel(t) {
  return t ? t.slice(0, 5) : ''
}

const filteredMatches = computed(() =>
  teamFilter.value === 'all' ? cupMatches.value : cupMatches.value.filter(m => m.our_team === teamFilter.value)
)

// Grupper kamper per dag (sortert)
const groups = computed(() => {
  const map = new Map()
  for (const m of filteredMatches.value) {
    const key = m.match_date || 'zzz'
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(m)
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, matches]) => ({ date, label: dayLabel(date === 'zzz' ? null : date), matches }))
})
</script>

<template>
  <div class="desktop-container">
    <div class="page-header">
      <h1 class="page-header__title">Kampprogram</h1>
      <p class="page-header__subtitle">{{ activeCup?.name || 'Cup' }}</p>
    </div>

    <div class="px-lg">
      <CupTabs />
      <CupTeamFilter />
      <div v-if="loading && !ready" class="ds-empty">
        <p class="ds-empty__title">Henter kamper …</p>
      </div>

      <div v-else-if="status === 'error'" class="ds-empty">
        <h3 class="ds-empty__title">Kunne ikke laste kampene</h3>
        <p class="ds-empty__description">Sjekk nettforbindelsen og prøv igjen.</p>
      </div>

      <div v-else-if="cupMatches.length && filteredMatches.length === 0" class="ds-empty">
        <h3 class="ds-empty__title">Ingen kamper for dette laget</h3>
        <button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" @click="setFilter('all')">
          Vis alle kamper
        </button>
      </div>

      <!-- Ingen CTA her med vilje: cup-kamper legges inn direkte i basen, det
           finnes ingen skjerm å sende noen til. En knapp ville løyet. -->
      <!-- Uten en cup i det hele tatt er dette flata treneren lander på fra
           Cup-fanen. Da må den peke videre: en tom skjerm uten utvei er
           nøyaktig den døde knappen vi allerede har brukt en dag på. -->
      <div v-else-if="filteredMatches.length === 0" class="ds-empty">
        <img src="/illustrations/bench-boss-feature-icons/512/cup-tournament-transparent.png" alt="" class="ds-empty__illo" />
        <h3 class="ds-empty__title">{{ activeCup ? 'Ingen kamper ennå' : 'Ingen turnering lagt inn' }}</h3>
        <p class="ds-empty__description">
          {{ activeCup
            ? 'Kampprogrammet for turneringen er ikke lagt inn.'
            : 'Legg inn turneringen, så kan du fordele troppen og føre kampene.' }}
        </p>
        <router-link v-if="!isParent" to="/admin/turneringer" class="ds-btn ds-btn--primary">
          {{ activeCup ? 'Legg til kamper' : 'Legg inn turnering' }}
        </router-link>
      </div>

      <template v-else>
        <div v-for="group in groups" :key="group.date" class="daygroup">
          <div class="day-label">{{ group.label }}</div>
          <div class="list">
            <router-link
              v-for="m in group.matches"
              :key="m.id"
              :to="{ name: 'cup-match', params: { id: m.id } }"
              class="ds-card ds-card--interactive match-card cup-mcard"
            >
              <div class="match-card__teams">
                <span class="match-card__team">{{ teamName(m.our_team) }}</span>
                <span v-if="m.home_score != null && m.away_score != null" class="match-card__score">{{ m.home_score }} – {{ m.away_score }}</span>
                <span v-else-if="timeLabel(m.match_time)" class="match-card__time">{{ timeLabel(m.match_time) }}</span>
                <span v-else class="match-card__vs">vs</span>
                <span class="match-card__team">{{ m.opponent || 'TBD' }}</span>
              </div>
              <div class="match-card__meta">
                <span v-if="m.pitch" class="match-card__meta-item">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  {{ m.pitch }}
                </span>
                <span v-if="m.round" class="match-card__meta-item">{{ m.round }}</span>
              </div>
            </router-link>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.daygroup { margin-bottom: var(--ds-space-lg); }
.day-label {
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  text-transform: capitalize;
  color: var(--ds-color-text-secondary);
  margin: var(--ds-space-lg) 2px var(--ds-space-sm);
}
.list { display: flex; flex-direction: column; gap: var(--ds-space-sm); }

/* Bruker seriens globale .match-card-oppsett; her bare lenke-oppførsel */
.cup-mcard {
  display: block;
  text-decoration: none;
  padding: var(--ds-space-lg);
  transition: transform 160ms var(--ds-ease-out), border-color 160ms var(--ds-ease-out), box-shadow 160ms var(--ds-ease-out);
}
@media (hover: hover) and (pointer: fine) {
  .cup-mcard:hover { transform: translateY(-1px); }
}
.cup-mcard:active { transform: scale(0.98); transition-duration: 100ms; }
/* siste kamp-meta uten bunnmargin (match-card__teams har 14px) */
.cup-mcard .match-card__teams { margin-bottom: 10px; }
</style>
