<script setup>
import Ikon from '../components/Ikon.vue'
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
import HjemKort from '../components/today/HjemKort.vue'
import ReminderList from '../components/today/ReminderList.vue'
import TerminlisteCard from '../components/today/TerminlisteCard.vue'
import { useTerminlisteVarsel } from '../composables/useTerminlisteVarsel'
import NextMatchCard from '../components/today/NextMatchCard.vue'
import OtherTeamsList from '../components/today/OtherTeamsList.vue'
import WeekList from '../components/today/WeekList.vue'
import OnboardingCards from '../components/today/OnboardingCards.vue'
import { useOnboarding } from '../composables/useOnboarding'
import { useSeasonTeams } from '../composables/useSeasonTeams'
import MatchCardSkeleton from '../components/MatchCardSkeleton.vue'
import { dagLink } from '../lib/trainingLinks'
import { daysUntil, WEEKDAY_LABELS, isoWeekday, weekdayDateLabel } from '../lib/dateLabels'
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

// Én hovedsak: det nærmeste av neste trening og neste kamp. Er noe i dag,
// står dagens kort der i stedet. Resten ligger under «Denne uka».
const hovedsak = computed(() => {
  if (hasToday.value) return null
  const k = []
  if (nextTraining.value) k.push({ kind: 'training', date: nextTraining.value.date })
  if (heroMatch.value) k.push({ kind: 'match', date: heroMatch.value.date })
  return k.sort((a, b) => a.date.localeCompare(b.date))[0] || null
})

// Det som står som kort, skal ikke stå som rad også.
const weekItems = computed(() => {
  const h = hovedsak.value
  if (!h) return weekAhead.value
  const til = h.kind === 'match' ? heroMatch.value.to : dagLink(nextTraining.value.session.id)
  return weekAhead.value.filter(i => i.to !== til || i.kind === 'training-week')
})

// Hjem er et blikk, ikke planen: lengden og antallet. Øvelsene står på Trening.
function varighet(min) {
  if (!min) return ''
  const t = Math.floor(min / 60), m = min % 60
  return !t ? `${m} min` : m ? `${t} t ${m} min` : `${t} t`
}
function treningLinje(session, oppmote) {
  const deler = []
  const tid = varighet(session.duration_min)
  if (tid) deler.push(tid)
  const n = (session.drills || []).filter(d => d?.text).length
  if (oppmote != null) deler.push(`${oppmote} her`)
  else if (n) deler.push(`${n} ${n === 1 ? 'øvelse' : 'øvelser'}`)
  return deler
}
// «Trening tirsdag». Lenger fram enn en uke står datoen også.
const nesteTreningTittel = computed(() => {
  const d = nextTraining.value?.date
  if (!d) return 'Trening'
  const dager = daysUntil(d)
  if (dager === 1) return 'Trening i morgen'
  if (dager > 6) return `Trening ${weekdayDateLabel(d).toLowerCase()}`
  return `Trening ${WEEKDAY_LABELS[isoWeekday(new Date(d + 'T12:00:00')) - 1].toLowerCase()}`
})

// Står kampen alt under «Å ordne» (dommer mangler), skal den ikke stå som
// «Andre lag» også. Påminnelsen er den man handler på.
const otherTeamsItems = computed(() => {
  const opptatt = new Set(reminders.value.map(r => r.to || `/kamp/${r.matchId}`))
  return otherTeamsNext.value.filter(i => !opptatt.has(i.to))
})

const showEmpty = computed(() =>
  ready.value && !loading.value && !onboardingActive.value && !hasToday.value && !hovedsak.value && weekItems.value.length === 0 && reminders.value.length === 0 && !showCupEntry.value
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

      <!-- Trenere går rett til opptellingen, eller kjøreplanen når den er lagret. -->
      <HjemKort
        v-if="todayTraining"
        :to="isCoach ? `/trening/okt/${todayTraining.id}` : dagLink(todayTraining.id)"
        tittel="Trening i dag"
        :linje="treningLinje(todayTraining, isCoach ? dagensOppmote : undefined)"
        class="today-training ds-anim-fade-up ds-anim-delay-1"
      />

      <!-- Det neste som skjer: ett kort. -->
      <HjemKort
        v-if="hovedsak?.kind === 'training'"
        :to="dagLink(nextTraining.session.id)"
        :tittel="nesteTreningTittel"
        :linje="treningLinje(nextTraining.session)"
        class="next-training ds-anim-fade-up ds-anim-delay-1"
      />
      <NextMatchCard
        v-else-if="hovedsak?.kind === 'match'"
        :event="nextMatch"
        :prep="prepFor(nextMatch.id)"
        class="ds-anim-fade-up ds-anim-delay-1"
      />

      <HjemKort
        v-if="showEmpty"
        bilde="ingen"
        tittel="Ingenting på planen"
        class="ds-anim-fade-up ds-anim-delay-1"
      />

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

      <!-- Del inn er det trenerne gjør oftest: den eneste fylte knappen på Hjem. -->
      <RouterLink v-if="isCoach && !onboardingActive" to="/del-inn" class="hjem-delinn ds-anim-fade-up ds-anim-delay-2">
        <Ikon navn="personer" class="hjem-delinn__ikon" aria-hidden="true" />
        <span class="hjem-delinn__tittel">Del inn</span>
        <Ikon navn="videre" class="hjem-delinn__pil" aria-hidden="true" />
      </RouterLink>

      <!-- Alt annet er rolige rader. De med innhold under åpner seg på trykk. -->
      <div v-if="!onboardingActive || weekItems.length" class="hjem-rader ds-anim-fade-up ds-anim-delay-3">
        <!-- Lagene. Bare utenom sesong, bare for trenere. -->
        <RouterLink v-if="visLagene" to="/serie/tropp" class="hjem-rad">
          <Ikon navn="drakt" class="hjem-rad__ikon" aria-hidden="true" />
          <span class="hjem-rad__tittel">Lagene</span>
          <Ikon navn="pil-hoyre" class="hjem-rad__pil" aria-hidden="true" />
        </RouterLink>

        <!-- Under onboarding er «Å ordne» støy: det eneste å ordne er å komme i gang. -->
        <details v-if="reminders.length && !onboardingActive" class="hjem-fold">
          <summary class="hjem-rad">
            <span class="hjem-rad__tall hjem-rad__tall--varsel">{{ reminders.length }}</span>
            <span class="hjem-rad__tittel">Å ordne</span>
            <Ikon navn="pil-hoyre" class="hjem-rad__pil" aria-hidden="true" />
          </summary>
          <ReminderList :reminders="reminders" class="hjem-fold__innhold" />
        </details>

        <!-- Resten av uka — bare dager med innhold, ingen fyll -->
        <details v-if="weekItems.length" class="hjem-fold">
          <summary class="hjem-rad">
            <span class="hjem-rad__tall">{{ weekItems.length }}</span>
            <span class="hjem-rad__tittel">Denne uka</span>
            <Ikon navn="pil-hoyre" class="hjem-rad__pil" aria-hidden="true" />
          </summary>
          <WeekList :items="weekItems" class="hjem-fold__innhold" />
        </details>

        <!-- Klubben ellers, sist: dette er lag du IKKE trener. -->
        <details v-if="otherTeamsItems.length && !onboardingActive" class="hjem-fold">
          <summary class="hjem-rad">
            <span class="hjem-rad__tall">{{ otherTeamsItems.length }}</span>
            <span class="hjem-rad__tittel">Andre lag</span>
            <Ikon navn="pil-hoyre" class="hjem-rad__pil" aria-hidden="true" />
          </summary>
          <OtherTeamsList :items="otherTeamsItems" class="hjem-fold__innhold" />
        </details>
      </div>

      <!-- Cupen langt fram: en rad man finner, ikke et kort som leder. -->
      <CupEntryCard v-if="showCupEntry && !cupNear && !onboardingActive" :cup="activeCup" compact class="ds-anim-fade-up ds-anim-delay-3" />
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
  gap: var(--ds-space-xs);
  min-width: 0;
}

.hjem-cupkort__tittel {
  font-weight: 700;
}

.hjem-cupkort__lead {
  color: var(--ds-color-text-secondary);
  font-size: var(--ds-text-sm);
}

/* Del inn er det trenerne gjør oftest, og den eneste fylte aksenten på Hjem.
   Pila i kortet over er dempet av samme grunn. */
.hjem-delinn {
  display: flex;
  align-items: center;
  gap: var(--ds-space-md);
  min-height: 64px;
  padding: 0 var(--ds-space-20);
  border-radius: var(--ds-radius-lg);
  background: var(--ds-color-accent);
  color: var(--ds-color-accent-text);
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
  transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
}
.hjem-delinn:active { transform: scale(0.97); }
.hjem-delinn__ikon, .hjem-delinn__pil { flex: none; width: 24px; height: 24px; }
.hjem-delinn__pil { width: 20px; height: 20px; }
.hjem-delinn__tittel { flex: 1; font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold); }

/* Radene: én høyde, én form. Strek mellom, ingen bokser. */
.hjem-rader { display: flex; flex-direction: column; }
.hjem-rader > * + * { border-top: 1px solid var(--ds-color-border); }
.hjem-rad {
  display: flex;
  align-items: center;
  gap: var(--ds-space-md);
  min-height: 60px;
  font-size: var(--ds-text-md);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-primary);
  text-decoration: none;
  cursor: pointer;
  list-style: none;
  -webkit-tap-highlight-color: transparent;
}
.hjem-rad::-webkit-details-marker { display: none; }
.hjem-rad__ikon { flex: none; width: 24px; height: 24px; }
.hjem-rad__tittel { flex: 1; min-width: 0; }
.hjem-rad__pil {
  flex: none; width: 20px; height: 20px;
  color: var(--ds-color-text-tertiary);
  transition: transform 200ms cubic-bezier(0.23, 1, 0.32, 1);
}
.hjem-fold[open] > .hjem-rad .hjem-rad__pil { transform: rotate(90deg); }
.hjem-rad__tall {
  flex: none;
  min-width: 24px; height: 24px; padding: 0 var(--ds-space-sm); box-sizing: border-box;
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-subtle);
  color: var(--ds-color-text-secondary);
  display: flex; align-items: center; justify-content: center;
  font-size: var(--ds-text-sm); font-weight: var(--ds-weight-bold);
  font-variant-numeric: tabular-nums;
}
.hjem-rad__tall--varsel { background: var(--ds-color-warm-bg); color: var(--ds-color-warm-text); }
.hjem-fold__innhold { padding-bottom: var(--ds-space-md); }

.hjem-hero {
  padding-top: var(--ds-space-2xl);
  padding-bottom: var(--ds-space-xl);
}

.hjem-hero__greeting {
  margin: 0;
  font-family: var(--ds-font-heading);
  font-size: 2.125rem;
  font-weight: var(--ds-weight-bold);
  letter-spacing: -0.025em;
  line-height: 1.1;
  color: var(--ds-color-text-primary);
}

/* Mye luft mellom de tre delene: kortet, Del inn, radene. */
.hjem-stack {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-20);
  padding-bottom: var(--ds-space-2xl);
}

@media (prefers-reduced-motion: reduce) {
  .hjem-delinn, .hjem-rad__pil { transition: none; }
  .hjem-delinn:active { transform: none; }
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
