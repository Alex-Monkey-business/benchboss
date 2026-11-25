<script setup>
import Ikon from '../Ikon.vue'
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { teamColorsForMatch, teamLabel, isHomeMatch } from '../../lib/matchMeta'
import { usePlayers } from '../../composables/usePlayers'
import { STATUS } from '../../lib/query'

const props = defineProps({
  match: { type: Object, required: true },
  prep: { type: Object, default: null },
  coachNames: { type: String, default: '' }
})

const router = useRouter()
const emit = defineEmits(['legg-inn-spillere'])
const { players, status: spillerStatus } = usePlayers()

const teamColors = computed(() => teamColorsForMatch(props.match))

// Samme regel som Neste kamp: ett lag med egen lagfarge → lagets flate.
const lagFlate = computed(() => {
  const c = teamColors.value
  return c.length === 1 && (c[0] === 'gronn' || c[0] === 'rod') ? c[0] : null
})
const home = computed(() => isHomeMatch(props.match))
const opponent = computed(() => home.value ? props.match.away_team : props.match.home_team)

const kickoff = computed(() => {
  const t = (props.match.match_time || '').slice(0, 5)
  return t && t !== '00:00' ? t : ''
})

// Resultat sett fra vårt perspektiv (hjemme/borte avgjør hvilken score er vår).
const ourScore = computed(() => home.value ? props.match.home_score : props.match.away_score)
const theirScore = computed(() => home.value ? props.match.away_score : props.match.home_score)
const hasResult = computed(() => ourScore.value != null && theirScore.value != null)

const inProgress = computed(() => props.prep?.status === 'running' || props.prep?.status === 'paused')
// Spilt = kampmodus avsluttet, ELLER resultat ført manuelt (uten kampmodus) så
// lenge kampen ikke er i gang nå.
const done = computed(() => props.prep?.status === 'finished' || (hasResult.value && !inProgress.value))
// Bare kampmodus gir et spilletid-sammendrag å vise.
const hasSummary = computed(() => props.prep?.status === 'finished')

const outcome = computed(() => {
  if (!done.value || !hasResult.value) return null
  if (ourScore.value > theirScore.value) return 'win'
  if (ourScore.value < theirScore.value) return 'loss'
  return 'draw'
})

const kicker = computed(() => done.value ? 'Spilt' : 'Kampdag')
// Kampmodus med tom tropp er en blindvei. Et nytt kull med kamp i dag får
// «Legg inn spillerne» i stedet — først når spillerlista er lest, så et kull
// med spillere aldri blinker med feil knapp mens den hentes.
const tomTropp = computed(() =>
  !done.value && !inProgress.value &&
  spillerStatus.value === STATUS.OK &&
  teamColors.value.length > 0 &&
  !players.value.some(p => teamColors.value.includes(p.primary_team))
)

const ctaLabel = computed(() => {
  if (tomTropp.value) return 'Legg inn spillerne'
  if (done.value) return hasSummary.value ? 'Se sammendrag' : 'Se kampen'
  return inProgress.value ? 'Fortsett kampen' : 'Åpne kampmodus'
})

// Sjekkliste: dommer kun på hjemmekamp (prep.referee er null borte).
const checklist = computed(() => {
  if (!props.prep) return []
  const items = []
  if (props.prep.referee !== null) {
    items.push({ key: 'referee', label: 'Dommer satt', done: props.prep.referee })
  }
  items.push({ key: 'lineup', label: 'Lag satt opp', done: props.prep.lineup })
  return items
})

function openDetail() {
  router.push(`/kamp/${props.match.id}`)
}

function openLive() {
  router.push(`/kamp/${props.match.id}/live`)
}

// Uten kampmodus finnes ikke noe live-sammendrag — send da til kampdetaljene.
function onCta() {
  if (tomTropp.value) { emit('legg-inn-spillere'); return }
  if (done.value && !hasSummary.value) openDetail()
  else openLive()
}
</script>

<template>
  <div class="ds-card today-match" :data-lag="lagFlate" role="link" tabindex="0" @click="openDetail" @keydown.enter="openDetail">
    <div class="today-match__top">
      <span class="today-match__tags">
        <span
          v-for="color in teamColors"
          :key="color"
          class="ds-tag"
          :class="`ds-tag--${color}`"
        >{{ teamLabel(color) }}</span>
        <span class="ds-tag ds-tag--quiet">{{ home ? 'Hjemme' : 'Borte' }}</span>
      </span>
      <span class="ds-eyebrow today-match__kicker" :class="{ 'today-match__kicker--done': done }">{{ kicker }}</span>
    </div>

    <div class="today-match__main">
      <template v-if="done && hasResult">
        <span class="today-match__score" :class="`today-match__score--${outcome}`">
          {{ ourScore }}<span class="today-match__score-dash">–</span>{{ theirScore }}
        </span>
        <span class="today-match__opponent">mot {{ opponent }}</span>
      </template>
      <template v-else>
        <span v-if="kickoff" class="today-match__time">{{ kickoff }}</span>
        <span class="today-match__opponent">mot {{ opponent }}</span>
      </template>
    </div>

    <span v-if="coachNames && !done" class="today-match__coaches">{{ coachNames }}</span>

    <ul v-if="checklist.length && !done" class="today-match__checklist">
      <li v-for="item in checklist" :key="item.key" class="check-item" :class="{ 'check-item--done': item.done, 'check-item--venter': item.done === undefined }">
        <Ikon navn="hake-sirkel" v-if="item.done" />
        <Ikon navn="sirkel" v-else />
        {{ item.label }}
      </li>
    </ul>

    <button
      type="button"
      class="ds-btn today-match__cta"
      :class="done ? 'ds-btn--ghost' : 'ds-btn--primary'"
      @click.stop="onCta"
    >
      {{ ctaLabel }}
    </button>
  </div>
</template>

<style scoped>
/* Lagflaten, som Neste kamp. Hvit står hvit med ramme. */
.today-match[data-lag] { border-color: transparent; }
.today-match[data-lag="gronn"] { background: var(--ds-team-gronn-bg); }
.today-match[data-lag="rod"]   { background: var(--ds-team-rod-bg); }
/* Lappene løftes til kortflaten, ellers forsvinner «Grønn» i den grønne flaten. */
.today-match[data-lag] .ds-tag { background: var(--ds-color-bg-elevated); }

.today-match {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
  padding: var(--ds-space-lg);
  cursor: pointer;
  transition:
    transform 160ms var(--ds-ease-out),
    border-color 160ms var(--ds-ease-out);
  -webkit-tap-highlight-color: transparent;
}

@media (hover: hover) and (pointer: fine) {
  .today-match:hover {
    transform: translateY(-1px);
  }
}

.today-match:active {
  transform: scale(0.99);
}

@media (prefers-reduced-motion: reduce) {
  .today-match,
  .today-match:active {
    transform: none;
    transition: none;
  }
}

.today-match__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-sm);
}

.today-match__tags {
  display: inline-flex;
  align-items: center;
  gap: var(--ds-space-sm);
}

.today-match__kicker {
  color: var(--ds-color-warm);
}

.today-match__kicker--done {
  color: var(--ds-color-text-tertiary);
}

.today-match__score {
  font-family: var(--ds-font-heading);
  font-size: 2.5rem;
  font-weight: var(--ds-weight-bold);
  line-height: 1;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  color: var(--ds-color-text-primary);
}

.today-match__score-dash {
  margin: 0 0.2em;
  color: var(--ds-color-text-tertiary);
}

.today-match__score--win { color: var(--ds-color-success); }
.today-match__score--loss { color: var(--ds-color-error); }

.today-match__main {
  display: flex;
  align-items: baseline;
  gap: var(--ds-space-sm);
  flex-wrap: wrap;
}

.today-match__time {
  font-family: var(--ds-font-heading);
  font-size: 2.5rem;
  font-weight: var(--ds-weight-bold);
  line-height: 1;
  color: var(--ds-color-text-primary);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}

.today-match__opponent {
  font-size: var(--ds-text-lg);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-primary);
}

.today-match__coaches {
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-tertiary);
}

.today-match__checklist {
  list-style: none;
  margin: var(--ds-space-xs) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
}

.check-item {
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
}

.check-item svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  color: var(--ds-color-text-tertiary);
}

.check-item--done {
  color: var(--ds-color-text-primary);
}

/* Ikke hentet ennå: raden står, så kortet ikke hopper, men den sier ikke
   at noe mangler. */
.check-item--venter {
  opacity: 0.45;
}

.check-item--done svg {
  color: var(--ds-color-success);
}

.today-match__cta {
  margin-top: var(--ds-space-sm);
  width: 100%;
}
</style>
