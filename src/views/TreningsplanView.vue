<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useTrainingPeriods } from '../composables/useTrainingPeriods'
import { useTrainingSessions, DEFAULT_WEEK_SESSIONS } from '../composables/useTrainingSessions'
import { localISODate, relativeDateLabel } from '../lib/dateLabels'
import Skeleton from '../components/Skeleton.vue'

const router = useRouter()
const { periods, fetchPeriods, createPeriod } = useTrainingPeriods()
const { createSession, fetchSessions } = useTrainingSessions()

// Appen velger farge selv — én mindre innstilling å ta stilling til.
// Måneden bestemmer den, så to perioder på rad aldri blir like.
const ACCENTS = ['warm', 'sage', 'cornflower', 'peach', 'sky', 'olive']

const deciding = ref(true) // mens vi avgjør hvilken periode vi lander på
const lastPeriod = ref(null)
const creating = ref(false)

// AKTIV periode = dekker dagens dato, eller er åpen i enden og alt startet.
// Ingenting annet. Før falt denne tilbake til «nyeste periode» når ingen var
// aktiv — og da så Trening-fanen ut som om det fantes en gjeldende plan, selv
// om den gikk ut for ni dager siden.
function pickActivePeriod() {
  const ps = periods.value
  if (!ps.length) return null
  const today = localISODate()
  const inRange = ps.find(p => p.start_date && p.end_date && p.start_date <= today && today <= p.end_date)
  if (inRange) return inRange
  const openEnded = ps
    .filter(p => p.start_date && !p.end_date && p.start_date <= today)
    .sort((a, b) => b.start_date.localeCompare(a.start_date))[0]
  if (openEnded) return openEnded
  // Har du alt laget neste periode, er DEN planen — selv om den ikke har
  // startet. Å vise «ingen aktiv periode» da ville bedt deg gjøre om igjen
  // noe du nettopp gjorde.
  return ps
    .filter(p => p.start_date && p.start_date > today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))[0] || null
}

function pickLastPeriod() {
  const ps = periods.value
  if (!ps.length) return null
  const withStart = ps.filter(p => p.start_date).sort((a, b) => b.start_date.localeCompare(a.start_date))
  return withStart[0] || ps[ps.length - 1]
}

const endedLabel = p => (p?.end_date ? relativeDateLabel(p.end_date).toLowerCase() : '')

// ── Perioden er en måned ────────────────────────────────────────────────────
//
// Ingen tittel å finne på, ingen datovelgere, ingen farge. Måneden gir alt
// tre. Alt kan endres inne i perioden etterpå — det er nettopp derfor
// opprettelsen kan være ett trykk.
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const nextPeriodPlan = computed(() => {
  const now = new Date()
  let year = now.getFullYear()
  let month = now.getMonth()

  // Er det under en uke igjen av måneden, er det neste måned du planlegger.
  const lastDayThisMonth = new Date(year, month + 1, 0).getDate()
  if (lastDayThisMonth - now.getDate() < 7) {
    month += 1
    if (month > 11) { month = 0; year += 1 }
  }

  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)

  // Start dagen etter forrige periode hvis den slutter inne i denne måneden,
  // så to perioder aldri overlapper.
  let start = first
  const prevEnd = lastPeriod.value?.end_date
  if (prevEnd) {
    const d = new Date(prevEnd + 'T12:00:00')
    const dayAfter = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
    if (dayAfter > first && dayAfter <= last) start = dayAfter
  }

  const navn = first.toLocaleDateString('nb-NO', { month: 'long' })
  return {
    title: navn.charAt(0).toUpperCase() + navn.slice(1),
    start_date: iso(start),
    end_date: iso(last),
    accent: ACCENTS[month % ACCENTS.length],
    spenn: `${start.getDate()}.–${last.getDate()}. ${navn}`
  }
})

// Ett trykk: lag månedsperioden, med eller uten forrige plans økter.
async function createMonth(reuse) {
  if (creating.value) return
  creating.value = true
  const plan = nextPeriodPlan.value
  const row = await createPeriod({
    title: plan.title,
    lead: null,
    accent: plan.accent,
    start_date: plan.start_date,
    end_date: plan.end_date
  })
  if (row) {
    const kilde = reuse && lastPeriod.value ? await fetchSessions(lastPeriod.value.id) : null
    if (kilde?.length) {
      for (const [i, s] of [...kilde].sort((a, b) => a.position - b.position).entries()) {
        await createSession(row.id, {
          title: s.title,
          weekday: s.weekday ?? null,
          accent: s.accent || 'warm',
          illustration: s.illustration || null,
          focus: s.focus || null,
          drills: s.drills || [],
          position: i
        })
      }
    } else {
      for (const [i, tpl] of DEFAULT_WEEK_SESSIONS.entries()) {
        await createSession(row.id, { ...tpl, drills: [], position: i })
      }
    }
  }
  creating.value = false
  if (row) router.replace(`/trening/${row.id}`)
}

onMounted(async () => {
  await fetchPeriods()
  const active = pickActivePeriod()
  if (active) {
    router.replace(`/trening/${active.id}`)
    return
  }
  lastPeriod.value = pickLastPeriod()
  deciding.value = false
})
</script>

<template>
  <div class="treningsplan">
    <!-- Avgjør hvilken periode vi lander på -->
    <div v-if="deciding" class="treningsplan__list">
      <Skeleton v-for="n in 3" :key="n" height="76px" radius="var(--ds-radius-lg)" />
    </div>

    <!-- Perioden er over: si det rett ut, og gjør neste steg til ett trykk.
         Ingen tittel å finne på, ingen datovelgere, ingen farge — perioden er
         en måned, og alt kan endres inne i den etterpå. -->
    <div v-else-if="lastPeriod" class="ds-empty">
      <img src="/illustrations/bench-boss-feature-icons/512/training-plan-transparent.png" alt="" class="ds-empty__illo" />
      <div class="ds-empty__title">Ingen aktiv treningsperiode</div>
      <div class="ds-empty__description">
        <template v-if="lastPeriod.end_date">«{{ lastPeriod.title }}» gikk ut {{ endedLabel(lastPeriod) }}.</template>
        <template v-else>«{{ lastPeriod.title }}» er siste periode du la inn.</template>
      </div>
      <div class="plan-actions">
        <button type="button" class="ds-btn ds-btn--primary" :disabled="creating" @click="createMonth(true)">
          {{ creating ? 'Lager …' : 'Bruk forrige plan' }}
        </button>
        <button type="button" class="ds-btn ds-btn--secondary" :disabled="creating" @click="createMonth(false)">
          Start tom
        </button>
      </div>
      <p class="plan-note">Blir «{{ nextPeriodPlan.title }}», {{ nextPeriodPlan.spenn }}</p>
      <router-link :to="`/trening/${lastPeriod.id}`" class="ds-empty__link">Åpne «{{ lastPeriod.title }}»</router-link>
    </div>

    <!-- Aldri laget en periode -->
    <div v-else class="ds-empty">
      <img src="/illustrations/bench-boss-feature-icons/512/training-plan-transparent.png" alt="" class="ds-empty__illo" />
      <div class="ds-empty__title">Ingen treningsplan ennå</div>
      <div class="ds-empty__description">Tirsdag, torsdag og lørdag legges inn klare — så fyller du på med øvelser.</div>
      <button type="button" class="ds-btn ds-btn--primary ds-empty__action" :disabled="creating" @click="createMonth(false)">
        {{ creating ? 'Lager …' : `Lag plan for ${nextPeriodPlan.title.toLowerCase()}` }}
      </button>
    </div>

  </div>
</template>

<style scoped>
.treningsplan {
  max-width: 680px;
  margin: 0 auto;
  padding: var(--ds-space-md) var(--ds-space-lg) var(--ds-space-2xl);
}

.treningsplan__list {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
}

/* To likestilte veier videre: fortsett forrige plan, eller start blankt. */
.plan-actions {
  display: flex; flex-wrap: wrap; justify-content: center;
  gap: var(--ds-space-sm); margin-bottom: var(--ds-space-sm);
}

/* Sier hva knappene faktisk lager, så måneden aldri blir en overraskelse. */
.plan-note {
  margin: 0 0 var(--ds-space-lg);
  font-size: var(--ds-text-xs); color: var(--ds-color-text-tertiary);
}
</style>
