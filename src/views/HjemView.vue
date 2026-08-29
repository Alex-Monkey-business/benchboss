<script setup>
import { ref, computed, onMounted } from 'vue'
import { useToday } from '../composables/useToday'
import { useMatches } from '../composables/useMatches'
import { useCoaches } from '../composables/useCoaches'
import { useCups } from '../composables/useCups'
import { useAuth } from '../stores/auth'
import { clubLogo } from '../lib/klubblogo'
import TodayMatchCard from '../components/today/TodayMatchCard.vue'
import CupEntryCard from '../components/today/CupEntryCard.vue'
import TodayTrainingCard from '../components/today/TodayTrainingCard.vue'
import ReminderList from '../components/today/ReminderList.vue'
import NextTrainingCard from '../components/today/NextTrainingCard.vue'
import NextMatchCard from '../components/today/NextMatchCard.vue'
import OtherTeamsList from '../components/today/OtherTeamsList.vue'
import WeekList from '../components/today/WeekList.vue'
import OnboardingCards from '../components/today/OnboardingCards.vue'
import { useOnboarding } from '../composables/useOnboarding'
import MatchCardSkeleton from '../components/MatchCardSkeleton.vue'
import { dagLink } from '../lib/trainingLinks'

const {
  loading, refresh, greeting,
  todayMatches, todayCupMatches, todayTraining,
  prepFor, reminders, nextTraining, nextMatch, otherTeamsNext, weekAhead
} = useToday()

const { getCoachesForMatch } = useMatches()
const { coaches } = useCoaches()

// Cup-inngangen: eget kort mens en cup er i gang (ingen fane i bunnmenyen).
const { activeCup, cupInProgress: showCupEntry } = useCups()
// Før gjettet reconcileWithCoaches seg fram på navn når trener-id-en var
// ukjent, og bommet stille — man fikk et annet lags kamper og alt så riktig ut.
// Nå står det her i stedet.
const { identityIncomplete, activeCohort } = useAuth()

// Klubbmerket, når klubben er koblet til fotball.no. Faller det bort, skal
// ingenting flytte seg — derfor skjules det, det fjernes ikke.
const klubbmerke = computed(() => clubLogo(activeCohort.value?.club_fiks_id))
const merkeSvikter = ref(false)

// Et tomt kull skal fylles her, ikke lete etter Admin. Kortene forsvinner
// ett og ett; er alt på plass, finnes de ikke.
const { active: onboardingActive } = useOnboarding()

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

// Neste kamp er hovedsaken, og den får alltid kortet sitt — med hva som
// mangler i det. Den lå før bare som en rad i ukelista når den var innenfor
// uka, altså nesten alltid, og da forsvant både illustrasjonen og
// mangel-varselet ned i en liste.
const heroMatch = computed(() => (!matchToday.value && nextMatch.value) ? nextMatch.value : null)

// Står kampen som kort, skal den ikke stå som rad også.
const weekItems = computed(() =>
  heroMatch.value ? weekAhead.value.filter(i => i.to !== heroMatch.value.to) : weekAhead.value
)

// Treningskortet er fortsatt for det uka IKKE dekker. En sammenslått
// treningsrad dekker flere treninger — da må alle målene med, ellers dukker
// «neste trening» opp igjen som eget kort for noe uka allerede viser.
const weekTargets = computed(() => new Set(weekItems.value.flatMap(i => i.targets || [i.to])))

const upNext = computed(() => {
  const items = []
  const t = nextTraining.value
  if (!hasToday.value && t && !weekTargets.value.has(dagLink(t.period.id, t.session.id))) {
    items.push({ kind: 'training', date: t.date })
  }
  if (heroMatch.value) items.push({ kind: 'match', date: heroMatch.value.date })
  return items.sort((a, b) => a.date.localeCompare(b.date))
})

const showEmpty = computed(() =>
  ready.value && !loading.value && !onboardingActive.value && !hasToday.value && weekItems.value.length === 0 && upNext.value.length === 0 && reminders.value.length === 0 && !showCupEntry.value
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
      <div class="hjem-hero__tekst">
        <h1 class="hjem-hero__greeting">{{ greeting }}</h1>
        <p class="hjem-hero__date">{{ dateLine }}</p>
      </div>
      <img
        v-if="klubbmerke"
        class="hjem-hero__merke"
        :class="{ 'hjem-hero__merke--borte': merkeSvikter }"
        :src="klubbmerke"
        :alt="activeCohort?.club_name || ''"
        width="44"
        height="44"
        loading="lazy"
        @error="merkeSvikter = true"
      />
    </header>

    <div v-if="identityIncomplete" class="px-lg">
      <p class="hjem-identity-warning">
        Kontoen din er ikke koblet til en trenerprofil. «Mine kamper» og utlegg
        blir feil til det er ordnet.
      </p>
    </div>

    <div v-if="loading" class="px-lg">
      <MatchCardSkeleton :count="2" />
    </div>

    <div v-else class="px-lg hjem-stack">
      <OnboardingCards v-if="onboardingActive" class="ds-anim-fade-up ds-anim-delay-1" />

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
          :prep="prepFor(nextMatch.id)"
          class="ds-anim-fade-up ds-anim-delay-2"
        />
      </template>

      <!-- Resten av uka — bare dager med innhold, ingen fyll -->
      <section v-if="weekItems.length" class="ds-anim-fade-up ds-anim-delay-2">
        <h2 class="hjem-section-kicker">Denne uka</h2>
        <WeekList :items="weekItems" />
      </section>

      <!-- Under onboarding er «Å ordne» støy: det eneste å ordne er å komme i gang. -->
      <section v-if="reminders.length && !onboardingActive" class="ds-anim-fade-up ds-anim-delay-3">
        <h2 class="hjem-section-kicker">Å ordne</h2>
        <ReminderList :reminders="reminders" />
      </section>

      <!-- Klubben ellers, sist: dette er lag du IKKE trener. Seksjonen lå
           øverst og ledet hele skjermen på dager uten kamp — stikk i strid
           med at den skal ligge der «uten å ta fokus». -->
      <section v-if="otherTeamsNext.length && !onboardingActive" class="ds-anim-fade-up ds-anim-delay-3">
        <h2 class="hjem-section-kicker">Andre lag</h2>
        <OtherTeamsList :items="otherTeamsNext" />
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
  display: flex;
  align-items: center;
  gap: var(--ds-space-md);
  padding-top: var(--ds-space-xl);
  padding-bottom: var(--ds-space-lg);
}

.hjem-hero__tekst {
  flex: 1;
  min-width: 0;
}

/* Merket skal aldri dytte hilsenen. Fast rute, innholdet skaleres inn. */
.hjem-hero__merke {
  flex: none;
  width: 44px;
  height: 44px;
  object-fit: contain;
}

.hjem-hero__merke--borte {
  visibility: hidden;
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

.hjem-identity-warning {
  margin: 0 0 var(--ds-space-lg);
  padding: var(--ds-space-md);
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-primary);
  background: var(--ds-color-surface);
  border: 1px solid var(--ds-color-border-strong);
  border-radius: var(--ds-radius-md);
}
</style>
