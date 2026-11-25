<script setup>
import Spot from '../components/Spot.vue'
import { computed, onMounted, ref } from 'vue'
import { useAuth } from '../stores/auth'
import { useCups } from '../composables/useCups'
import { useCupMatches } from '../composables/useCupMatches'
import { cupTeam } from '../lib/cupTeams'
import { relativeDateLabel } from '../lib/dateLabels'
import { useCupFilter } from '../composables/useCupFilter'
import { useCupTeams } from '../composables/useCupTeams'
import CupTeamFilter from '../components/CupTeamFilter.vue'
import CupTabs from '../components/CupTabs.vue'
import BackLink from '../components/BackLink.vue'
import { useCupFirst } from '../composables/useCupFirst'

const { isParent } = useAuth()
const { activeCup, fetchCups } = useCups()
const { cupMatches, loading, status, fetchCupMatches } = useCupMatches()
const { teamFilter, setFilter } = useCupFilter()
const { cupTeams } = useCupTeams()
const { cupFirst } = useCupFirst()
// Kampene for cupen fra sist ligger i lageret. Da står programmet i første
// bilde. Før byttet det til «Henter kamper …» så snart hentingen startet, og
// kom tilbake etter to runder (cupene, så kampene).
const iCupen = computed(() => cupMatches.value.filter(m => !activeCup.value || m.cup_id === activeCup.value.id))
const ready = ref(iCupen.value.length > 0)

onMounted(async () => {
  // Cupen fra sist går i samme runde som cup-lista; bare et cup-bytte gir en
  // runde til.
  const kjent = activeCup.value?.id || null
  await Promise.all([fetchCups(), kjent ? fetchCupMatches(kjent) : null])
  if (activeCup.value && activeCup.value.id !== kjent) await fetchCupMatches(activeCup.value.id)
  ready.value = true
})

function teamName(slug) {
  return cupTeams.value.find(t => t.slug === slug)?.name || cupTeam(slug)?.name || slug
}

function dayLabel(dateStr) {
  if (!dateStr) return 'Dato kommer'
  // Samme datoform som gruppene i Kamper.
  return relativeDateLabel(dateStr)
}

function harResultat(m) {
  return m.home_score != null && m.away_score != null
}

function timeLabel(t) {
  return t ? t.slice(0, 5) : ''
}

const filteredMatches = computed(() =>
  teamFilter.value === 'all' ? iCupen.value : iCupen.value.filter(m => m.our_team === teamFilter.value)
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
    <div v-if="!isParent && !cupFirst" class="px-lg" style="padding-top: var(--ds-space-md);">
      <BackLink to="/admin" label="Admin" />
    </div>
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

      <div v-else-if="status === 'error' && !iCupen.length" class="ds-empty">
        <h3 class="ds-empty__title">Kunne ikke laste kampene</h3>
        <p class="ds-empty__description">Sjekk nettforbindelsen og prøv igjen.</p>
      </div>

      <div v-else-if="iCupen.length && filteredMatches.length === 0" class="ds-empty">
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
        <Spot name="cup" class="ds-empty__illo" />
        <h3 class="ds-empty__title">{{ activeCup ? 'Ingen kamper ennå' : 'Ingen cup lagt inn' }}</h3>
        <router-link v-if="!isParent" to="/admin/turneringer" class="ds-btn ds-btn--primary">
          {{ activeCup ? 'Legg til kamper' : 'Legg inn cup' }}
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
              class="ds-card ds-card--interactive cup-mcard"
            >
              <!-- Samme oppsett som kampkortene i Kamper: to linjer, venstrestilt. -->
              <span class="cup-mcard__lag">
                <span class="cup-mcard__rad">
                  <span class="cup-mcard__navn cup-mcard__navn--vart">{{ teamName(m.our_team) }}</span>
                  <span v-if="harResultat(m)" class="cup-mcard__mal">{{ m.home_score }}</span>
                </span>
                <span class="cup-mcard__rad">
                  <span class="cup-mcard__navn">{{ m.opponent || '–' }}</span>
                  <span v-if="harResultat(m)" class="cup-mcard__mal">{{ m.away_score }}</span>
                </span>
              </span>
              <span v-if="!harResultat(m)" class="cup-mcard__tid" :class="{ 'cup-mcard__tid--tba': !timeLabel(m.match_time) }">{{ timeLabel(m.match_time) || '–' }}</span>
              <span v-if="m.pitch || m.round" class="cup-mcard__meta">{{ [m.pitch, m.round].filter(Boolean).join(' · ') }}</span>
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
  color: var(--ds-color-text-secondary);
  margin: var(--ds-space-lg) var(--ds-space-2xs) var(--ds-space-sm);
}
.list { display: flex; flex-direction: column; gap: var(--ds-space-sm); }

.cup-mcard {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  column-gap: var(--ds-space-md);
  padding: var(--ds-space-md);
  text-decoration: none;
  color: inherit;
  transition: transform 160ms var(--ds-ease-out), border-color 160ms var(--ds-ease-out), box-shadow 160ms var(--ds-ease-out);
}
@media (hover: hover) and (pointer: fine) {
  .cup-mcard:hover { transform: translateY(-1px); }
}
.cup-mcard:active { transform: scale(0.98); transition-duration: 100ms; }
.cup-mcard__lag { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--ds-space-xs); }
.cup-mcard__rad { display: flex; align-items: baseline; justify-content: space-between; gap: var(--ds-space-md); }
.cup-mcard__navn {
  min-width: 0;
  font-size: var(--ds-text-sm);
  line-height: 1.35;
  color: var(--ds-color-text-primary);
  overflow-wrap: break-word;
}
.cup-mcard__navn--vart { font-weight: var(--ds-weight-semibold); }
.cup-mcard__mal {
  flex: none;
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-base);
  font-weight: var(--ds-weight-bold);
  font-variant-numeric: tabular-nums;
  color: var(--ds-color-text-primary);
}
.cup-mcard__tid {
  flex: none;
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-semibold);
  font-variant-numeric: tabular-nums;
  color: var(--ds-color-text-secondary);
}
.cup-mcard__tid--tba { color: var(--ds-color-text-tertiary); }
.cup-mcard__meta {
  flex-basis: 100%;
  margin-top: var(--ds-space-sm);
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-tertiary);
}
</style>
