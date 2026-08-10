<script setup>
import { ref, computed, onMounted } from 'vue'
import { useToday } from '../composables/useToday'
import { useMatches } from '../composables/useMatches'
import { useCoaches } from '../composables/useCoaches'
import { useCups } from '../composables/useCups'
import TodayMatchCard from '../components/today/TodayMatchCard.vue'
import CupEntryCard from '../components/today/CupEntryCard.vue'
import SeasonKickoffCard from '../components/today/SeasonKickoffCard.vue'
import TodayTrainingCard from '../components/today/TodayTrainingCard.vue'
import ReminderList from '../components/today/ReminderList.vue'
import NextTrainingCard from '../components/today/NextTrainingCard.vue'
import NextMatchCard from '../components/today/NextMatchCard.vue'
import OtherTeamsList from '../components/today/OtherTeamsList.vue'
import WeekList from '../components/today/WeekList.vue'
import MatchCardSkeleton from '../components/MatchCardSkeleton.vue'

const {
  loading, refresh, greeting,
  todayMatches, todayCupMatches, todayTraining,
  prepFor, reminders, nextTraining, nextMatch, otherTeamsNext, weekAhead, seasonKickoff
} = useToday()

const { getCoachesForMatch } = useMatches()
const { coaches } = useCoaches()

// Cup-inngangen: eget kort mens en cup er i gang (ingen fane i bunnmenyen).
const { activeCup, cupInProgress: showCupEntry } = useCups()

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
const cupMatchesToday = computed(() => (showCupEntry.value ? todayCupMatches.value.length : 0))

// Det som kommer: uka dekker det meste, så neste-kortene er for hendelser
// UTENFOR uka. Vi sjekker per hendelse om ukelista allerede har den — ikke
// om lista er tom, ellers forsvinner neste kamp så snart uka har én trening.
const weekTargets = computed(() => new Set(weekAhead.value.map(i => i.to)))

const upNext = computed(() => {
  const items = []
  const t = nextTraining.value
  if (!hasToday.value && t && !weekTargets.value.has(`/trening/${t.period.id}/okt/${t.session.id}`)) {
    items.push({ kind: 'training', date: t.date })
  }
  if (!matchToday.value && nextMatch.value && !weekTargets.value.has(nextMatch.value.to)) {
    items.push({ kind: 'match', date: nextMatch.value.date })
  }
  return items.sort((a, b) => a.date.localeCompare(b.date))
})

const showEmpty = computed(() =>
  ready.value && !loading.value && !hasToday.value && weekAhead.value.length === 0 && upNext.value.length === 0 && reminders.value.length === 0 && !showCupEntry.value && !seasonKickoff.value
)

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

      <TodayTrainingCard
        v-if="todayTraining"
        :period="todayTraining.period"
        :session="todayTraining.session"
        class="ds-anim-fade-up ds-anim-delay-2"
      />

      <CupEntryCard
        v-if="showCupEntry"
        :cup="activeCup"
        :today-count="cupMatchesToday"
        class="ds-anim-fade-up ds-anim-delay-2"
      />

      <!-- Sesongen snur: står rett over neste kamp i opptakten til første kamp -->
      <SeasonKickoffCard
        v-if="seasonKickoff"
        :kickoff="seasonKickoff"
        class="ds-anim-fade-up ds-anim-delay-1"
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

      <!-- Klubben ellers: de andre lagenes neste kamp, dempet -->
      <section v-if="otherTeamsNext.length" class="ds-anim-fade-up ds-anim-delay-2">
        <h2 class="hjem-section-kicker">Andre lag</h2>
        <OtherTeamsList :items="otherTeamsNext" />
      </section>

      <!-- Resten av uka — bare dager med innhold, ingen fyll -->
      <section v-if="weekAhead.length" class="ds-anim-fade-up ds-anim-delay-2">
        <h2 class="hjem-section-kicker">Denne uka</h2>
        <WeekList :items="weekAhead" />
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

/* «Denne uka»-radene bor i components/today/WeekList.vue */
</style>
