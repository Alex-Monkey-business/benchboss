<script setup>
import { useKlubbmerke } from '../composables/useKlubbmerke'
import Spot from '../components/Spot.vue'
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useToday } from '../composables/useToday'
import { useMatches } from '../composables/useMatches'
import { useCoaches } from '../composables/useCoaches'
import { useCups } from '../composables/useCups'
import { useCupFirst } from '../composables/useCupFirst'
import { useAuth } from '../stores/auth'
import TodayMatchCard from '../components/today/TodayMatchCard.vue'
import CupEntryCard from '../components/today/CupEntryCard.vue'
import TodayTrainingCard from '../components/today/TodayTrainingCard.vue'
import ReminderList from '../components/today/ReminderList.vue'
import TerminlisteCard from '../components/today/TerminlisteCard.vue'
import { useTerminlisteVarsel } from '../composables/useTerminlisteVarsel'
import NextTrainingCard from '../components/today/NextTrainingCard.vue'
import NextMatchCard from '../components/today/NextMatchCard.vue'
import OtherTeamsList from '../components/today/OtherTeamsList.vue'
import WeekList from '../components/today/WeekList.vue'
import OnboardingCards from '../components/today/OnboardingCards.vue'
import { useOnboarding } from '../composables/useOnboarding'
import { useSeasonTeams } from '../composables/useSeasonTeams'
import MatchCardSkeleton from '../components/MatchCardSkeleton.vue'
import { dagLink } from '../lib/trainingLinks'
import { hentDagensOppmote, dagensOppmoteLagret } from '../composables/useTreningsOkt'

const {
  loading, refresh, followDay, today, greeting,
  todayMatches, todayCupMatches, todayTraining,
  prepFor, reminders, nextTraining, nextMatch, otherTeamsNext, weekAhead
} = useToday()

const { getCoachesForMatch } = useMatches()
const { coaches } = useCoaches()

// Cup-inngangen: eget kort mens en cup er i gang (ingen fane i bunnmenyen).
const { activeCup, cups, cupInProgress: showCupEntry } = useCups()
// Kortet er en hero. Fem måneder før cupen er to heroer ingen hero — da står
// den som rad nederst til den er nær. Fjorten dager: da begynner troppen og
// kjøringa å bli noe man faktisk ordner.
const CUP_NAER_DAGER = 14
const cupNear = computed(() => {
  const start = activeCup.value?.start_date
  if (!start) return true
  const idag = new Date(); idag.setHours(12, 0, 0, 0)
  const dager = (new Date(start + 'T12:00:00') - idag) / 86400000
  return dager <= CUP_NAER_DAGER
})
// Uten serie er cup ikke et avbrekk — det er alt laget har. Da skal en tom
// skjerm peke på den ene jobben som gir den innhold, ikke gratulere med fri.
const { cupFirst } = useCupFirst()
// Før gjettet reconcileWithCoaches seg fram på navn når trener-id-en var
// ukjent, og bommet stille — man fikk et annet lags kamper og alt så riktig ut.
// Nå står det her i stedet.
const { identityIncomplete, isCoach, coach } = useAuth()

// Dagens trening for trenere: rett til opptellingen eller kjøreplanen, med
// oppmøtet i linja. null = ikke telt opp ennå.
const dagensOppmote = ref(undefined)
watch(() => todayTraining.value?.id, async id => {
  if (!id || !isCoach.value) { dagensOppmote.value = undefined; return }
  // Det telefonen vet fra i dag står med en gang; hentingen fersker det.
  const lagret = dagensOppmoteLagret()
  if (lagret) dagensOppmote.value = id in lagret ? lagret[id] : null
  const alle = await hentDagensOppmote()
  dagensOppmote.value = id in alle ? alle[id] : null
}, { immediate: true })

// Et tomt kull skal fylles her, ikke lete etter Admin. Kortene forsvinner
// ett og ett; er alt på plass, finnes de ikke.
const { active: onboardingActive } = useOnboarding()

const router = useRouter()

// Kampdagkortet ber om spillerne når laget ikke har noen. Da åpnes samme ark
// som oppstartskortet; uten oppstartskort (sjeldent) er Tropp veien.
const onboardingRef = ref(null)
function leggInnSpillere() {
  if (onboardingRef.value?.apneSpillere) onboardingRef.value.apneSpillere()
  else router.push('/serie/tropp')
}

// Uten serie, og uten en turnering lagt inn: da har Hjem ingen kamper å vise,
// og kortet er veien ut. Under onboardingen viker det — der er det spillerne
// som mangler, og to konkurrerende «gjør dette først» er ingen.
const ingenCup = computed(() =>
  cupFirst.value && cups.value.length === 0 && !onboardingActive.value
)

const ready = ref(false)

// Appen står åpen over natta på telefonen: «i dag» flytter seg ved midnatt,
// og Hjem hentes på nytt når appen kommer fram igjen.
followDay()

const { endringer: terminlisteEndringer, sjekkNarLedig } = useTerminlisteVarsel()

onMounted(async () => {
  await refresh()
  ready.value = true
  // Etter tegningen, aldri før: en treg fotball.no skal ikke kunne holde
  // igjen hjemskjermen.
  sjekkNarLedig()
})

const dateLine = computed(() => {
  const s = new Date(today.value + 'T12:00:00').toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
})

const hasToday = computed(() =>
  todayMatches.value.length > 0 || todayCupMatches.value.length > 0 || !!todayTraining.value
)

// Har skjelettet stått, skal innholdet ta over plassen i samme bilde. Med
// innfasing på toppen startet kortene usynlige, og skjermen sto tom et
// øyeblikk mellom skjelettet og innholdet.
const varSkjelett = ref(loading.value)
watch(loading, v => { if (v) varSkjelett.value = true })

const matchToday = computed(() => todayMatches.value.length > 0 || todayCupMatches.value.length > 0)

// Snarvei til lagene utenom sesong. Lagene er satt opp på nytt (A, B, C), og
// uten kamper på planen finnes ingen annen vei til dem fra Hjem. Kommer neste
// kamp, overtar kampkortet og snarveien går.
const { seasonTeams } = useSeasonTeams()
const visLagene = computed(() =>
  isCoach.value && !onboardingActive.value && !matchToday.value && !nextMatch.value && seasonTeams.value.length > 0)
const lagNavn = computed(() => seasonTeams.value.map(t => t.name).join(' · '))
const cupMatchesToday = computed(() => (showCupEntry.value ? todayCupMatches.value.length : 0))

// Neste kamp er hovedsaken, og den får alltid kortet sitt — med hva som
// mangler i det. Den lå før bare som en rad i ukelista når den var innenfor
// uka, altså nesten alltid, og da forsvant både illustrasjonen og
// mangel-varselet ned i en liste.
const heroMatch = computed(() => (!matchToday.value && nextMatch.value) ? nextMatch.value : null)

// Dagens og neste kamp er de du trykker på herfra; merkene hentes i forkant.
const { forvarm } = useKlubbmerke()
watch([todayMatches, nextMatch], ([idag, neste]) =>
  forvarm([...(idag || []).flatMap(m => [m.home_team, m.away_team]), neste?.opponent]), { immediate: true })

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
  if (!hasToday.value && t && !weekTargets.value.has(dagLink(t.session.id))) {
    items.push({ kind: 'training', date: t.date })
  }
  if (heroMatch.value) items.push({ kind: 'match', date: heroMatch.value.date })
  return items.sort((a, b) => a.date.localeCompare(b.date))
})

// Står kampen alt under «Å ordne» (dommer mangler), skal den ikke stå som
// «Andre lag» også. Påminnelsen er den man handler på.
const otherTeamsItems = computed(() => {
  const opptatt = new Set(reminders.value.map(r => r.to || `/kamp/${r.matchId}`))
  return otherTeamsNext.value.filter(i => !opptatt.has(i.to))
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
      <h1 class="hjem-hero__greeting">{{ greeting }}</h1>
      <p class="hjem-hero__date">{{ dateLine }}</p>
    </header>

    <div v-if="identityIncomplete" class="px-lg">
      <p class="hjem-identity-warning">
        Kontoen din er ikke koblet til en trener. Be admin ordne det.
      </p>
    </div>

    <div v-if="loading" class="px-lg">
      <MatchCardSkeleton :count="2" />
    </div>

    <div v-else class="px-lg hjem-stack" :class="{ 'hjem-stack--rett-inn': varSkjelett }">
      <OnboardingCards v-if="onboardingActive" ref="onboardingRef" class="ds-anim-fade-up ds-anim-delay-1" />

      <!-- Kretsen har flyttet noe. Står øverst: det endrer når man møter opp. -->
      <TerminlisteCard
        v-if="terminlisteEndringer && !onboardingActive"
        :endringer="terminlisteEndringer"
        class="ds-anim-fade-up ds-anim-delay-1"
      />

      <!-- Dagens hovedhendelser: kamp slår trening, men begge vises ved kollisjon -->
      <TodayMatchCard
        v-for="match in todayMatches"
        :key="match.id"
        :match="match"
        :prep="prepFor(match.id)"
        :coach-names="coachNamesForMatch(match.id)"
        class="ds-anim-fade-up ds-anim-delay-1"
        @legg-inn-spillere="leggInnSpillere"
      />

      <TodayTrainingCard
        v-if="todayTraining"
        :session="todayTraining"
        :til="isCoach ? `/trening/okt/${todayTraining.id}` : null"
        :oppmote="isCoach ? dagensOppmote : undefined"
        class="ds-anim-fade-up ds-anim-delay-2"
      />

      <!-- Del inn. Bare for trenere. -->
      <RouterLink v-if="isCoach && !onboardingActive" to="/del-inn" class="hjem-delinn ds-anim-fade-up ds-anim-delay-2">
        <svg class="hjem-delinn__ikon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="7" cy="8" r="3" /><circle cx="17" cy="8" r="3" /><path d="M2 20c0-3 2.2-5 5-5s5 2 5 5" /><path d="M12 20c0-3 2.2-5 5-5s5 2 5 5" /></svg>
        <span class="hjem-delinn__tekst">
          <span class="hjem-delinn__tittel">Del inn</span>
        </span>
        <svg class="hjem-delinn__pil" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
      </RouterLink>

      <!-- Lagene. Bare utenom sesong, bare for trenere. -->
      <RouterLink v-if="visLagene" to="/serie/tropp" class="hjem-delinn hjem-delinn--rolig ds-anim-fade-up ds-anim-delay-2">
        <svg class="hjem-delinn__ikon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="12" y1="4" x2="12" y2="20" /><circle cx="12" cy="12" r="2.5" /></svg>
        <span class="hjem-delinn__tekst">
          <span class="hjem-delinn__tittel">Lagene</span>
          <span class="hjem-delinn__linje">{{ lagNavn }}</span>
        </span>
        <svg class="hjem-delinn__pil" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
      </RouterLink>

      <CupEntryCard
        v-if="showCupEntry && cupNear"
        :cup="activeCup"
        :today-count="cupMatchesToday"
        class="ds-anim-fade-up ds-anim-delay-2"
      />

      <!-- Uten serie er turneringen det eneste kampprogrammet som finnes, og
           til den er lagt inn har Hjem ingenting å vise fram. Kortet ligger her
           og ikke i den tomme tilstanden: kullet har treninger og påminnelser,
           så Hjem er aldri «tomt» — det er bare uten kamper. -->
      <RouterLink
        v-if="ingenCup"
        to="/admin/turneringer"
        class="ds-card ds-card--interactive hjem-cupkort ds-anim-fade-up ds-anim-delay-2"
      >
        <Spot name="cup" class="hjem-cupkort__illo" :size="64" />
        <span class="hjem-cupkort__tekst">
          <span class="hjem-cupkort__tittel">Legg inn cupen</span>
          <span class="hjem-cupkort__lead">Laget har ingen seriekamper.</span>
        </span>
      </RouterLink>

      <!-- Det som kommer: nærmeste hendelse øverst -->
      <template v-for="item in upNext" :key="item.kind">
        <NextTrainingCard
          v-if="item.kind === 'training'"
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
      <section v-if="otherTeamsItems.length && !onboardingActive" class="ds-anim-fade-up ds-anim-delay-3">
        <h2 class="hjem-section-kicker">Andre lag</h2>
        <OtherTeamsList :items="otherTeamsItems" />
      </section>

      <!-- Cupen langt fram: en rad man finner, ikke et kort som leder. -->
      <section v-if="showCupEntry && !cupNear && !onboardingActive" class="ds-anim-fade-up ds-anim-delay-3">
        <h2 class="hjem-section-kicker">Senere</h2>
        <CupEntryCard :cup="activeCup" compact />
      </section>

      <div v-if="showEmpty" class="ds-empty ds-anim-fade-up ds-anim-delay-1">
        <Spot name="empty" class="ds-empty__illo" />
        <h3 class="ds-empty__title">Ingenting på planen</h3>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hjem-cupkort {
  display: flex;
  align-items: center;
  gap: var(--ds-space-md);
  padding: var(--ds-space-lg);
  text-decoration: none;
  color: inherit;
}

.hjem-cupkort__illo {
  flex: none;
  --spot-size: 64px;
}

.hjem-cupkort__tekst {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.hjem-cupkort__tittel {
  font-weight: 700;
}

.hjem-cupkort__lead {
  color: var(--ds-color-text-secondary);
  font-size: var(--ds-text-sm);
}

/* Del inn brukes hver trening og skal være lett å treffe — men en hel
   aksentflate konkurrerte med knappen på neste kamp. Nå et løftet kort med
   en aksentflis: like stort trykkmål, én aksent på skjermen i stedet for to. */
.hjem-delinn {
  display: flex;
  align-items: center;
  gap: var(--ds-space-md);
  min-height: 80px;
  padding: var(--ds-space-md) var(--ds-space-lg) var(--ds-space-md) var(--ds-space-md);
  border-radius: var(--ds-radius-lg);
  background: var(--ds-color-bg-elevated);
  border: var(--ds-border-width) solid var(--ds-color-border);
  box-shadow: var(--ds-shadow-sm);
  color: var(--ds-color-text-primary);
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
  transition:
    transform var(--ds-duration-fast) var(--ds-ease-out),
    border-color var(--ds-duration-fast) var(--ds-ease-out),
    box-shadow var(--ds-duration-fast) var(--ds-ease-out);
}
.hjem-delinn:active { transform: scale(0.99); }
@media (hover: hover) and (pointer: fine) {
  .hjem-delinn:hover { border-color: var(--ds-color-border-strong); box-shadow: var(--ds-shadow-md); }
}
@media (prefers-reduced-motion: reduce) {
  .hjem-delinn { transition: none; }
  .hjem-delinn:active { transform: none; }
}
/* Flisa: selve ikonet, med polstring og fyll — ingen ekstra markup. */
.hjem-delinn__ikon {
  flex: none;
  box-sizing: border-box;
  width: 48px;
  height: 48px;
  padding: 12px;
  border-radius: 14px;
  background: var(--ds-color-accent);
  color: var(--ds-color-accent-text);
}
/* Snarveien til lagene: samme kort, nøytral flis. Én aksent på skjermen. */
.hjem-delinn--rolig .hjem-delinn__ikon { background: var(--ds-color-bg-subtle); color: var(--ds-color-text-primary); }
.hjem-delinn__pil { flex: none; width: 20px; height: 20px; color: var(--ds-color-text-tertiary); }
.hjem-delinn__tekst { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.hjem-delinn__tittel { font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold); line-height: 1.3; }
.hjem-delinn__linje { font-size: var(--ds-text-sm); color: var(--ds-color-text-tertiary); font-variant-numeric: tabular-nums; }

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

/* Rytme: tett innenfor en gruppe (kortene øverst, radene i en seksjon),
   luft før hver ny seksjon. Før var alt 16 + 8, og seksjonene klistret seg
   til kortet over. */
.hjem-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: var(--ds-space-2xl);
}

.hjem-stack > section:not(:first-child) {
  margin-top: 20px;
}

.hjem-section-kicker {
  margin: 0 0 12px;
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

.hjem-stack--rett-inn :deep(.ds-anim-fade-up),
.hjem-stack--rett-inn.ds-anim-fade-up,
.hjem-stack--rett-inn > .ds-anim-fade-up {
  animation: none;
}
</style>
