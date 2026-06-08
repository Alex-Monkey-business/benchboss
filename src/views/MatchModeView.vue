<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMatches } from '../composables/useMatches'
import { usePlayers } from '../composables/usePlayers'
import { useMatchMode } from '../composables/useMatchMode'
import { useMatchGoals } from '../composables/useMatchGoals'
import { useToast } from '../composables/useToast'
import { teamColorsForMatch, isHomeMatch, TEAM_LABELS } from '../lib/matchMeta'
import Sheet from '../components/Sheet.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'

const route = useRoute()
const router = useRouter()
const { getMatch, updateMatch, fetchMatchPlayers, fetchMatchAbsences } = useMatches()
const { goals: allGoals, fetchMatchGoals, addGoal, removeGoal } = useMatchGoals()
const { players, fetchPlayers } = usePlayers()
const {
  session, currentClock, isRunning,
  startClockTick, stopClockTick,
  fetchSession, fetchStints,
  startMatch, pauseClock, resumeClock, substitute, swapKeeper, finishMatch, resetMatch,
  isOnField, roleOf, playerAtPosition, playingTimeByPlayer
} = useMatchMode()
const { show: showToast } = useToast()

const matchId = route.params.id
const match = ref(null)
const matchPlayerIds = ref([])
const matchAbsenceIds = ref([])
const loading = ref(true)

// 7er-formasjon 2-3-1. y måles fra topp; vi angriper oppover (spiss øverst).
const FORMATION = [
  { id: 'f1', role: 'field',  x: 50, y: 16 },
  { id: 'm1', role: 'field',  x: 20, y: 42 },
  { id: 'm2', role: 'field',  x: 50, y: 40 },
  { id: 'm3', role: 'field',  x: 80, y: 42 },
  { id: 'd1', role: 'field',  x: 30, y: 68 },
  { id: 'd2', role: 'field',  x: 70, y: 68 },
  { id: 'gk', role: 'keeper', x: 50, y: 89 }
]

// Setup
const assignments = ref({})   // slotId -> playerId
const pickerSlot = ref(null)  // slot som redigeres

// Live
const armedBenchId = ref(null)
const actionPlayer = ref(null)
const showFinish = ref(false)
const showReset = ref(false)
const showScorer = ref(false)

let wakeLock = null

onMounted(async () => {
  await fetchPlayers()
  match.value = await getMatch(matchId)
  if (match.value) {
    matchPlayerIds.value = await fetchMatchPlayers(matchId)
    matchAbsenceIds.value = await fetchMatchAbsences(matchId)
    await Promise.all([fetchSession(matchId), fetchStints(matchId), fetchMatchGoals(matchId)])
  }
  loading.value = false
  startClockTick()
  requestWakeLock()
  document.addEventListener('visibilitychange', onVisibility)
})
onUnmounted(() => {
  stopClockTick()
  releaseWakeLock()
  document.removeEventListener('visibilitychange', onVisibility)
})

async function requestWakeLock() {
  try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen') } catch { /* ok */ }
}
function releaseWakeLock() {
  try { wakeLock?.release?.() } catch { /* noop */ }
  wakeLock = null
}
function onVisibility() {
  if (document.visibilityState === 'visible' && !wakeLock) requestWakeLock()
}

// Feil mot databasen (typisk: migrasjon ikke kjørt) — én tydelig melding.
function reportError(e) {
  const msg = (e?.message || '').toLowerCase()
  if (msg.includes('match_sessions') || msg.includes('match_stints') || msg.includes('does not exist') || msg.includes('schema cache')) {
    showToast('Databasen mangler match mode-tabellene — kjør SQL-migrasjonen først', 'error')
  } else {
    showToast('Noe gikk galt — prøv igjen', 'error')
  }
}

// ── Pool ───────────────────────────────────────────────────────────────────────
const matchColors = computed(() => teamColorsForMatch(match.value))
// Poolen = (laget − frafall) + lånespillere. Spillere uten fast lag kommer
// KUN med hvis de er lagt til som lånespiller. Frafall ekskluderes helt.
const squad = computed(() => {
  const guest = new Set(matchPlayerIds.value)
  const out = new Set(matchAbsenceIds.value)
  return players.value
    .filter(p => guest.has(p.id) || (p.primary_team && matchColors.value.includes(p.primary_team)))
    .filter(p => !out.has(p.id))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'no'))
})

const phase = computed(() => {
  const s = session.value?.status
  if (s === 'running' || s === 'paused') return 'live'
  if (s === 'finished') return 'done'
  return 'setup'
})

function fmt(sec) {
  const s = Math.max(0, Math.floor(sec || 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
function timeFor(id) { return playingTimeByPlayer.value[id]?.totalSec || 0 }
function playerById(id) { return players.value.find(p => p.id === id) || null }
function firstName(name) { return (name || '').split(' ')[0] }
function initial(name) { return (firstName(name)[0] || '?').toUpperCase() }

// ── Setup (banen) ────────────────────────────────────────────────────────────
const assignedIds = computed(() => new Set(Object.values(assignments.value)))
const unassigned = computed(() => squad.value.filter(p => !assignedIds.value.has(p.id)))
function playerInSlot(slotId) { return playerById(assignments.value[slotId]) }
const lineupComplete = computed(() => FORMATION.every(s => assignments.value[s.id]))

function openPicker(slot) { pickerSlot.value = slot }
const pickerTitle = computed(() =>
  pickerSlot.value && playerInSlot(pickerSlot.value.id) ? 'Bytt spiller' : 'Velg spiller'
)

// Velg spiller til slot. Står spilleren allerede et annet sted, bytter de
// plass (ett trykk); ellers plasseres de (og en evt. spiller her går ut).
function pickForSlot(playerId) {
  const target = pickerSlot.value
  if (!target) return
  const current = assignments.value[target.id] || null
  const fromSlot = Object.keys(assignments.value).find(k => assignments.value[k] === playerId)
  if (fromSlot && fromSlot !== target.id) {
    if (current) assignments.value[fromSlot] = current
    else delete assignments.value[fromSlot]
  }
  assignments.value[target.id] = playerId
  pickerSlot.value = null
}

// Spillere som allerede står i en annen slot — for ett-trykks plassbytte.
const placedElsewhere = computed(() => {
  if (!pickerSlot.value) return []
  return Object.entries(assignments.value)
    .filter(([slotId]) => slotId !== pickerSlot.value.id)
    .map(([slotId, pid]) => ({ player: playerById(pid), slotId }))
    .filter(x => x.player)
    .sort((a, b) => a.player.name.localeCompare(b.player.name, 'no'))
})
function posLabel(slotId) {
  if (slotId === 'gk') return 'Keeper'
  if (slotId.startsWith('d')) return 'Forsvar'
  if (slotId.startsWith('m')) return 'Midtbane'
  if (slotId.startsWith('f')) return 'Angrep'
  return ''
}

function clearSlot(slotId) {
  delete assignments.value[slotId]
  pickerSlot.value = null
}

async function handleStart() {
  if (!lineupComplete.value) return
  const lineup = FORMATION.map(s => ({ playerId: assignments.value[s.id], role: s.role, position: s.id }))
  try {
    await startMatch(matchId, lineup)
    showToast('Kampen er i gang', 'success')
  } catch (e) { reportError(e) }
}

// ── Live ─────────────────────────────────────────────────────────────────────
const bench = computed(() =>
  squad.value
    .filter(p => !isOnField(p.id))
    .map(p => ({ ...p, sec: timeFor(p.id) }))
    .sort((a, b) => a.sec - b.sec || a.name.localeCompare(b.name, 'no'))
)
// Spillere på banen nå — scorer-velgeren prioriterer disse.
const onField = computed(() =>
  squad.value
    .filter(p => isOnField(p.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'no'))
)

function armBench(id) { armedBenchId.value = armedBenchId.value === id ? null : id }

async function tapPitchPlayer(playerId) {
  if (!playerId) return
  if (armedBenchId.value) {
    const inId = armedBenchId.value
    armedBenchId.value = null
    try {
      await substitute(matchId, { outPlayerId: playerId, inPlayerId: inId })
      showToast(`${firstName(playerById(inId)?.name)} inn for ${firstName(playerById(playerId)?.name)}`, 'success')
    } catch (e) { reportError(e) }
  } else {
    actionPlayer.value = playerById(playerId)
  }
}

async function subFromSheet(inId) {
  const out = actionPlayer.value
  if (!out) return
  actionPlayer.value = null
  try {
    await substitute(matchId, { outPlayerId: out.id, inPlayerId: inId })
    showToast(`${firstName(playerById(inId)?.name)} inn for ${firstName(out.name)}`, 'success')
  } catch (e) { reportError(e) }
}
async function makeKeeperFromSheet() {
  const p = actionPlayer.value
  if (!p) return
  actionPlayer.value = null
  try {
    await swapKeeper(matchId, p.id)
    showToast(`${firstName(p.name)} er keeper`, 'success')
  } catch (e) { reportError(e) }
}

async function togglePause() {
  try {
    if (isRunning.value) await pauseClock(matchId)
    else await resumeClock(matchId)
  } catch (e) { reportError(e) }
}
async function handleFinish() {
  showFinish.value = false
  try {
    await finishMatch(matchId)
    showToast('Kamp avsluttet', 'success')
  } catch (e) { reportError(e) }
}
async function handleReset() {
  showReset.value = false
  try {
    await resetMatch(matchId)
    // Blanke ark: fjern også resultat + scorere logget i match mode.
    await updateMatch(matchId, { home_score: null, away_score: null })
    if (match.value) { match.value.home_score = null; match.value.away_score = null }
    for (const g of matchGoals.value.slice()) await removeGoal(g.id)
    assignments.value = {}
    armedBenchId.value = null
    actionPlayer.value = null
    showToast('Nullstilt — klar for ny oppstilling', 'success')
  } catch (e) { reportError(e) }
}

// ── Resultat & scorere (live) ──────────────────────────────────────────────
const isHome = computed(() => isHomeMatch(match.value))
const halsenScore = computed(() => (isHome.value ? match.value?.home_score : match.value?.away_score) || 0)
const oppScore = computed(() => (isHome.value ? match.value?.away_score : match.value?.home_score) || 0)
const halsenName = computed(() => isHome.value ? match.value?.home_team : match.value?.away_team)
const oppName = computed(() => isHome.value ? match.value?.away_team : match.value?.home_team)

const matchGoals = computed(() =>
  allGoals.value
    .filter(g => g.match_id === matchId)
    .slice()
    .sort((a, b) => (a.clock_seconds ?? a.position * 1e9) - (b.clock_seconds ?? b.position * 1e9))
)
function goalMinute(g) {
  return g.clock_seconds != null ? Math.floor(g.clock_seconds / 60) : null
}

async function setScore(halsen, opp) {
  const updates = isHome.value
    ? { home_score: halsen, away_score: opp }
    : { away_score: halsen, home_score: opp }
  await updateMatch(matchId, updates)
  if (match.value) Object.assign(match.value, updates)
}
async function halsenGoalPlus() {
  await setScore(halsenScore.value + 1, oppScore.value)
  showScorer.value = true
}
async function halsenGoalMinus() {
  if (halsenScore.value <= 0) return
  await setScore(halsenScore.value - 1, oppScore.value)
  // Fjern sist LAGT TIL scorer (høyest position), kun hvis vi nå har flere
  // scorere enn mål — så et hoppet-over mål ikke feilaktig sletter en scorer.
  const mine = matchGoals.value
  if (mine.length > halsenScore.value) {
    const lastAdded = mine.reduce((a, b) => (b.position > a.position ? b : a))
    await removeGoal(lastAdded.id)
  }
}
async function oppGoalPlus() { await setScore(halsenScore.value, oppScore.value + 1) }
async function oppGoalMinus() { if (oppScore.value > 0) await setScore(halsenScore.value, oppScore.value - 1) }

async function pickScorer(playerId) {
  const min = Math.floor(currentClock.value / 60)
  await addGoal(matchId, { player_id: playerId, clock_seconds: currentClock.value })
  showScorer.value = false
  showToast(`Mål: ${firstName(playerById(playerId)?.name)} ${min}′`, 'success')
}

// Done — sammendrag
const summary = computed(() =>
  squad.value
    .map(p => ({ ...p, ...playingTimeByPlayer.value[p.id] }))
    .filter(p => (p.totalSec || 0) > 0)
    .sort((a, b) => (b.totalSec || 0) - (a.totalSec || 0))
)
</script>

<template>
  <div class="mm">
    <div class="mm__bar">
      <button class="mm__back" @click="router.back()" aria-label="Tilbake">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span class="mm__title" v-if="match">{{ match.home_team }} – {{ match.away_team }}</span>
      <button v-if="phase !== 'setup'" type="button" class="mm__reset" @click="showReset = true">Nullstill</button>
    </div>

    <div v-if="loading" class="mm__loading">Laster …</div>

    <div v-else-if="!match" class="mm__empty">Fant ikke kampen.</div>

    <!-- ── SETUP ────────────────────────────────────────────── -->
    <div v-else-if="phase === 'setup'" class="mm__wrap">
      <div class="mm__setup-head">
        <h1 class="mm__h1">Sett opp laget</h1>
      </div>

      <div class="pitch">
        <div class="pitch__turf" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span></div>
        <div class="pitch__lines" aria-hidden="true">
          <span class="pitch__circle"></span>
          <span class="pitch__halfway"></span>
          <span class="pitch__box pitch__box--top"></span>
          <span class="pitch__box pitch__box--bottom"></span>
        </div>
        <button
          v-for="slot in FORMATION"
          :key="slot.id"
          type="button"
          class="marker"
          :class="{ 'marker--gk': slot.role === 'keeper', 'marker--empty': !playerInSlot(slot.id) }"
          :data-team="playerInSlot(slot.id)?.primary_team || 'none'"
          :style="{ left: slot.x + '%', top: slot.y + '%' }"
          @click="openPicker(slot)"
        >
          <span class="marker__circle">
            <span v-if="playerInSlot(slot.id)">{{ initial(playerInSlot(slot.id).name) }}</span>
            <span v-else class="marker__plus">+</span>
          </span>
          <span class="marker__label" :class="{ 'marker__label--muted': !playerInSlot(slot.id) }">
            {{ playerInSlot(slot.id) ? firstName(playerInSlot(slot.id).name) : (slot.role === 'keeper' ? 'Keeper' : 'Velg') }}
          </span>
        </button>
      </div>

      <div v-if="unassigned.length" class="mm__poolnote">
        Ikke plassert: <span class="mm__poolnames">{{ unassigned.map(p => firstName(p.name)).join(', ') }}</span>
      </div>
      <div v-if="!squad.length" class="mm__empty">Ingen spillere i troppen for dette laget.</div>

      <button type="button" class="mm__start" :disabled="!lineupComplete" @click="handleStart">
        {{ lineupComplete ? 'Start kamp' : `Plasser ${FORMATION.length - Object.keys(assignments).length} til` }}
      </button>
    </div>

    <!-- ── LIVE ─────────────────────────────────────────────── -->
    <div v-else-if="phase === 'live'" class="mm__wrap">
      <div class="mm__clockrow">
        <div class="mm__clock" :class="{ 'mm__clock--paused': !isRunning }">{{ fmt(currentClock) }}</div>
        <div class="mm__controls">
          <button type="button" class="mm__ctrl" @click="togglePause">{{ isRunning ? 'Pause' : 'Fortsett' }}</button>
          <button type="button" class="mm__ctrl mm__ctrl--end" @click="showFinish = true">Avslutt</button>
        </div>
      </div>

      <div class="mm__score">
        <div class="mm__score-side">
          <span class="mm__score-team">{{ halsenName }}</span>
          <div class="mm__score-ctrl">
            <button type="button" class="mm__score-btn" :disabled="halsenScore === 0" @click="halsenGoalMinus">−</button>
            <span class="mm__score-num">{{ halsenScore }}</span>
            <button type="button" class="mm__score-btn mm__score-btn--plus" @click="halsenGoalPlus">+</button>
          </div>
        </div>
        <span class="mm__score-dash">–</span>
        <div class="mm__score-side">
          <span class="mm__score-team">{{ oppName }}</span>
          <div class="mm__score-ctrl">
            <button type="button" class="mm__score-btn" :disabled="oppScore === 0" @click="oppGoalMinus">−</button>
            <span class="mm__score-num">{{ oppScore }}</span>
            <button type="button" class="mm__score-btn mm__score-btn--plus" @click="oppGoalPlus">+</button>
          </div>
        </div>
      </div>
      <div v-if="matchGoals.length" class="mm__scorers">
        <span v-for="g in matchGoals" :key="g.id" class="mm__scorer">
          <span v-if="goalMinute(g) != null" class="mm__scorer-min">{{ goalMinute(g) }}′</span>
          {{ firstName(playerById(g.player_id)?.name) || 'Ukjent' }}
        </span>
      </div>

      <div class="pitch">
        <div class="pitch__turf" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span></div>
        <div class="pitch__lines" aria-hidden="true">
          <span class="pitch__circle"></span>
          <span class="pitch__halfway"></span>
          <span class="pitch__box pitch__box--top"></span>
          <span class="pitch__box pitch__box--bottom"></span>
        </div>
        <button
          v-for="slot in FORMATION"
          :key="slot.id"
          type="button"
          class="marker"
          :class="{
            'marker--gk': playerAtPosition(slot.id) && roleOf(playerAtPosition(slot.id)) === 'keeper',
            'marker--target': armedBenchId && playerAtPosition(slot.id),
            'marker--empty': !playerAtPosition(slot.id)
          }"
          :data-team="playerById(playerAtPosition(slot.id))?.primary_team || 'none'"
          :style="{ left: slot.x + '%', top: slot.y + '%' }"
          @click="tapPitchPlayer(playerAtPosition(slot.id))"
        >
          <span class="marker__circle">
            <span v-if="playerAtPosition(slot.id)">{{ initial(playerById(playerAtPosition(slot.id))?.name) }}</span>
            <span v-else class="marker__plus">·</span>
          </span>
          <span v-if="playerAtPosition(slot.id)" class="marker__label">
            {{ firstName(playerById(playerAtPosition(slot.id))?.name) }}
            <span class="marker__time">{{ fmt(timeFor(playerAtPosition(slot.id))) }}</span>
          </span>
        </button>
      </div>

      <div class="mm__section-label">Benk</div>
      <div class="mm__bench">
        <button
          v-for="p in bench"
          :key="p.id"
          type="button"
          class="mm__bchip"
          :class="{ 'mm__bchip--armed': armedBenchId === p.id }"
          @click="armBench(p.id)"
        >
          <span class="mm__bname">{{ firstName(p.name) }}</span>
          <span class="mm__btime">{{ fmt(p.sec) }}</span>
        </button>
        <div v-if="!bench.length" class="mm__empty mm__empty--inline">Ingen på benken</div>
      </div>
    </div>

    <!-- ── DONE ─────────────────────────────────────────────── -->
    <div v-else class="mm__wrap">
      <div class="mm__donehead">
        <h1 class="mm__h1">Spilletid</h1>
        <div class="mm__totalpill">{{ fmt(currentClock) }} totalt</div>
      </div>

      <div class="summary">
        <div v-for="(p, i) in summary" :key="p.id" class="srow" :data-team="p.primary_team || 'none'">
          <span class="srow__avatar">{{ initial(p.name) }}</span>
          <div class="srow__main">
            <div class="srow__top">
              <span class="srow__name">{{ firstName(p.name) }}</span>
              <span class="srow__time">
                {{ fmt(p.totalSec) }}
                <span v-if="p.keeperSec" class="srow__keep">K</span>
              </span>
            </div>
            <span class="srow__track">
              <span class="srow__bar" :style="{ width: (currentClock ? Math.round((p.totalSec / currentClock) * 100) : 0) + '%' }"></span>
            </span>
          </div>
        </div>
      </div>

      <div class="mm__doneactions">
        <button type="button" class="mm__btn mm__btn--ghost" @click="showReset = true">Start på nytt</button>
        <button type="button" class="mm__btn mm__btn--primary" @click="router.push(`/kamp/${matchId}`)">Til kampen</button>
      </div>
    </div>

    <!-- Setup: velg spiller til slot -->
    <Sheet :show="!!pickerSlot" :title="pickerTitle" @close="pickerSlot = null">
      <div class="mm__sheet">
        <button
          v-if="pickerSlot && playerInSlot(pickerSlot.id)"
          type="button"
          class="mm__remove-btn"
          @click="clearSlot(pickerSlot.id)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>
          Fjern {{ firstName(playerInSlot(pickerSlot.id).name) }}
        </button>

        <div v-if="unassigned.length" class="mm__scorer-group">
          <div class="mm__sheet-label">Ikke plassert</div>
          <div class="mm__bench">
            <button v-for="p in unassigned" :key="p.id" type="button" class="mm__bchip" @click="pickForSlot(p.id)">
              <span class="mm__bname">{{ firstName(p.name) }}</span>
              <span v-if="p.primary_team" class="mm__btag">{{ TEAM_LABELS[p.primary_team] }}</span>
            </button>
          </div>
        </div>

        <div v-if="placedElsewhere.length" class="mm__scorer-group">
          <div class="mm__sheet-label">Bytt plass</div>
          <div class="mm__bench">
            <button v-for="x in placedElsewhere" :key="x.player.id" type="button" class="mm__bchip" @click="pickForSlot(x.player.id)">
              <span class="mm__bname">{{ firstName(x.player.name) }}</span>
              <span class="mm__btag">{{ posLabel(x.slotId) }}</span>
            </button>
          </div>
        </div>

        <div v-if="!unassigned.length && !placedElsewhere.length" class="mm__empty mm__empty--inline">Ingen andre spillere</div>
      </div>
    </Sheet>

    <!-- Live: hvem scoret -->
    <Sheet :show="showScorer" title="Hvem scoret?" @close="showScorer = false">
      <div class="mm__sheet">
        <div v-if="onField.length" class="mm__scorer-group">
          <div class="mm__sheet-label">På banen</div>
          <div class="mm__bench">
            <button v-for="p in onField" :key="p.id" type="button" class="mm__bchip" @click="pickScorer(p.id)">
              <span class="mm__bname">{{ firstName(p.name) }}</span>
            </button>
          </div>
        </div>
        <div v-if="bench.length" class="mm__scorer-group">
          <div class="mm__sheet-label">Benk</div>
          <div class="mm__bench">
            <button v-for="p in bench" :key="p.id" type="button" class="mm__bchip" @click="pickScorer(p.id)">
              <span class="mm__bname">{{ firstName(p.name) }}</span>
            </button>
          </div>
        </div>
      </div>
    </Sheet>

    <!-- Live: banespiller-handling -->
    <Sheet :show="!!actionPlayer" :title="actionPlayer ? `Bytt ${firstName(actionPlayer.name)}` : ''" @close="actionPlayer = null">
      <div class="mm__sheet">
        <button
          v-if="actionPlayer && roleOf(actionPlayer.id) !== 'keeper'"
          type="button"
          class="mm__sheet-action"
          @click="makeKeeperFromSheet"
        >Sett som keeper</button>
        <div class="mm__sheet-label">Inn for {{ firstName(actionPlayer?.name) }}</div>
        <div class="mm__bench">
          <button v-for="p in bench" :key="p.id" type="button" class="mm__bchip" @click="subFromSheet(p.id)">
            <span class="mm__bname">{{ firstName(p.name) }}</span>
            <span class="mm__btime">{{ fmt(p.sec) }}</span>
          </button>
          <div v-if="!bench.length" class="mm__empty mm__empty--inline">Ingen på benken</div>
        </div>
      </div>
    </Sheet>

    <ConfirmDialog
      :show="showFinish"
      title="Avslutte kampen?"
      message="Klokka stopper og spilletiden låses. Du kan fortsatt se sammendraget."
      confirm-label="Avslutt"
      variant="warning"
      @confirm="handleFinish"
      @cancel="showFinish = false"
    />

    <ConfirmDialog
      :show="showReset"
      title="Nullstille kampen?"
      message="Klokke, oppstilling, resultat og spilletid for denne kampen slettes. Du starter med blanke ark."
      confirm-label="Nullstill"
      variant="warning"
      @confirm="handleReset"
      @cancel="showReset = false"
    />
  </div>
</template>

<style scoped>
.mm { min-height: 100vh; background: var(--ds-color-bg); padding-bottom: var(--ds-space-2xl); }
.mm__wrap { padding: var(--ds-space-lg); max-width: 560px; margin: 0 auto; }

.mm__bar {
  display: flex; align-items: center; gap: var(--ds-space-sm);
  padding: var(--ds-space-md) var(--ds-space-lg);
  position: sticky; top: 0; z-index: var(--ds-z-sticky);
  background: var(--ds-color-bg); border-bottom: 1px solid var(--ds-color-border-light);
}
.mm__back { display: grid; place-items: center; width: 34px; height: 34px; border: none; border-radius: var(--ds-radius-md); background: transparent; color: var(--ds-color-text-secondary); cursor: pointer; }
.mm__back svg { width: 20px; height: 20px; }
.mm__back:hover { background: var(--ds-color-bg-elevated); }
.mm__title { font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-primary); font-size: var(--ds-text-md); }
.mm__reset { margin-left: auto; border: none; background: transparent; color: var(--ds-color-text-tertiary); font-family: var(--ds-font-body); font-size: var(--ds-text-sm); font-weight: var(--ds-weight-medium); cursor: pointer; padding: 6px 8px; border-radius: var(--ds-radius-sm); }
.mm__reset:hover { color: var(--ds-color-error); background: var(--ds-color-bg-elevated); }

.mm__loading, .mm__empty { color: var(--ds-color-text-tertiary); padding: var(--ds-space-xl) var(--ds-space-lg); text-align: center; }
.mm__empty--inline { padding: var(--ds-space-md); }

.mm__h1 { font-family: var(--ds-font-heading); font-size: var(--ds-text-2xl); font-weight: var(--ds-weight-bold); color: var(--ds-color-text-primary); margin: 0; }
.mm__sub { color: var(--ds-color-text-tertiary); font-size: var(--ds-text-sm); margin: 4px 0 0; }
.mm__setup-head { margin-bottom: var(--ds-space-md); }

/* ── Banen ── */
.pitch {
  position: relative;
  width: 100%;
  aspect-ratio: 3 / 4;
  margin: var(--ds-space-md) 0;
  border-radius: var(--ds-radius-lg);
  background: #2e8b54;
  border: 1px solid rgba(0,0,0,.2);
  box-shadow: var(--ds-shadow-md), inset 0 0 60px rgba(0,0,0,.18);
  overflow: hidden;
}
:global([data-theme="dark"]) .pitch { background: #23613d; }

/* Klippestriper — solide bånd, ingen gradient */
.pitch__turf { position: absolute; inset: 0; display: flex; flex-direction: column; }
.pitch__turf span { flex: 1; }
.pitch__turf span:nth-child(even) { background: rgba(255,255,255,.05); }
.pitch__turf span:nth-child(odd)  { background: rgba(0,0,0,.05); }

.pitch__lines { position: absolute; inset: 0; }
.pitch__lines span { position: absolute; border: 2px solid rgba(255,255,255,.4); }
.pitch__halfway { left: 5%; right: 5%; top: 50%; height: 0; border-width: 0; border-top: 2px solid rgba(255,255,255,.4) !important; }
.pitch__circle { left: 50%; top: 50%; width: 28%; aspect-ratio: 1; border-radius: 50%; transform: translate(-50%, -50%); }
.pitch__box { left: 22%; right: 22%; height: 13%; }
.pitch__box--top { top: 0; border-top: none; }
.pitch__box--bottom { bottom: 0; border-bottom: none; }

/* Spiller-markører (drakt + navn under) — delt mellom setup og live */
.marker {
  position: absolute; transform: translate(-50%, -50%);
  display: flex; flex-direction: column; align-items: center; gap: 5px;
  width: 80px; padding: 0; border: none; background: transparent;
  cursor: pointer; -webkit-tap-highlight-color: transparent;
  --jersey-bg: var(--ds-color-accent); --jersey-fg: #fff;
}
.marker__circle {
  width: 48px; height: 48px; display: grid; place-items: center;
  border-radius: 50%; font-size: var(--ds-text-md); font-weight: var(--ds-weight-bold);
  background: var(--jersey-bg); color: var(--jersey-fg);
  border: 2.5px solid rgba(255,255,255,.9);
  box-shadow: 0 3px 8px rgba(0,0,0,.3);
  transition: transform .12s ease;
}
.marker:active .marker__circle { transform: scale(.9); }
.marker__plus { font-size: 24px; font-weight: 300; line-height: 1; }
.marker__label {
  display: flex; flex-direction: column; align-items: center; line-height: 1.1;
  font-size: 12.5px; font-weight: var(--ds-weight-bold); color: #fff;
  text-shadow: 0 1px 3px rgba(0,0,0,.55); max-width: 80px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.marker__label--muted { font-weight: var(--ds-weight-medium); color: rgba(255,255,255,.85); }
.marker__time {
  font-size: 11px; font-weight: var(--ds-weight-semibold); font-variant-numeric: tabular-nums;
  color: rgba(255,255,255,.95); text-shadow: 0 1px 3px rgba(0,0,0,.55);
}
.marker--empty .marker__circle {
  background: rgba(255,255,255,.16); border: 2px dashed rgba(255,255,255,.75);
  color: #fff; box-shadow: none;
}
.marker--gk .marker__circle { background: var(--ds-color-warning); color: #fff; }
.marker--target .marker__circle { border-color: var(--ds-color-accent); border-style: dashed; }

/* Lagfarge på draktene */
.marker[data-team="gronn"] { --jersey-bg: var(--ds-team-gronn); --jersey-fg: #fff; }
.marker[data-team="rod"]   { --jersey-bg: var(--ds-team-rod);   --jersey-fg: #fff; }
.marker[data-team="hvit"]  { --jersey-bg: #fff; --jersey-fg: #1a1a1a; }
.marker--gk[data-team="gronn"] .marker__circle,
.marker--gk[data-team="rod"] .marker__circle,
.marker--gk[data-team="hvit"] .marker__circle { background: var(--ds-color-warning); color: #fff; }

.mm__poolnote { font-size: var(--ds-text-sm); color: var(--ds-color-text-tertiary); margin-top: 4px; }
.mm__poolnames { color: var(--ds-color-text-secondary); }

/* ── Start-knapp ── */
.mm__start {
  display: block; width: 100%; margin-top: var(--ds-space-lg);
  padding: 16px; border: none; border-radius: var(--ds-radius-lg);
  background: var(--ds-color-accent); color: var(--ds-color-accent-text);
  font-family: var(--ds-font-body); font-size: var(--ds-text-lg); font-weight: var(--ds-weight-bold);
  cursor: pointer; -webkit-tap-highlight-color: transparent;
}
.mm__start:disabled { opacity: .45; cursor: default; }

/* ── Klokke / kontroller ── */
.mm__clockrow { display: flex; align-items: center; justify-content: space-between; gap: var(--ds-space-md); }
.mm__clock { font-family: var(--ds-font-heading); font-variant-numeric: tabular-nums; font-size: 3.25rem; font-weight: var(--ds-weight-bold); line-height: 1; color: var(--ds-color-text-primary); letter-spacing: -0.02em; }
.mm__clock--paused { color: var(--ds-color-text-tertiary); }
.mm__controls { display: flex; gap: var(--ds-space-sm); }
.mm__ctrl { padding: 12px 16px; border: 1.5px solid var(--ds-color-border); border-radius: var(--ds-radius-md); background: var(--ds-color-bg-elevated); font-family: var(--ds-font-body); font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-primary); cursor: pointer; -webkit-tap-highlight-color: transparent; }
.mm__ctrl--end { border-color: var(--ds-color-error); color: var(--ds-color-error); }
.mm__paused-hint { color: var(--ds-color-warning); font-size: var(--ds-text-sm); font-weight: var(--ds-weight-medium); margin-top: 6px; }

/* Mål-stripe */
.mm__score {
  display: flex; align-items: flex-start; justify-content: center; gap: var(--ds-space-lg);
  margin-top: var(--ds-space-md);
  padding: var(--ds-space-md);
  background: var(--ds-color-bg-elevated);
  border: 1px solid var(--ds-color-border-light);
  border-radius: var(--ds-radius-lg);
}
.mm__score-side { display: flex; flex-direction: column; align-items: center; gap: 6px; flex: 1; min-width: 0; }
.mm__score-team {
  font-size: var(--ds-text-xs); font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-tertiary);
  max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.mm__score-ctrl { display: flex; align-items: center; gap: 10px; }
.mm__score-num { font-family: var(--ds-font-heading); font-size: 2rem; font-weight: var(--ds-weight-bold); font-variant-numeric: tabular-nums; color: var(--ds-color-text-primary); min-width: 24px; text-align: center; }
.mm__score-dash { align-self: center; padding-top: 22px; color: var(--ds-color-text-tertiary); font-size: 1.25rem; }
.mm__score-btn {
  display: grid; place-items: center; width: 34px; height: 34px; padding: 0;
  border: 1.5px solid var(--ds-color-border); border-radius: 50%;
  background: var(--ds-color-bg); color: var(--ds-color-text-secondary);
  font-size: 20px; line-height: 1; cursor: pointer; -webkit-tap-highlight-color: transparent;
}
.mm__score-btn:disabled { opacity: .35; cursor: default; }
.mm__score-btn--plus { border-color: var(--ds-color-accent); background: var(--ds-color-accent); color: var(--ds-color-accent-text); }

.mm__scorers { display: flex; flex-wrap: wrap; gap: var(--ds-space-sm); margin-top: var(--ds-space-sm); }
.mm__scorer { font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary); }
.mm__scorer-min { font-variant-numeric: tabular-nums; font-weight: var(--ds-weight-bold); color: var(--ds-color-text-tertiary); margin-right: 2px; }
.mm__scorer-group + .mm__scorer-group { margin-top: var(--ds-space-md); }

.mm__section-label { margin: var(--ds-space-md) 0 var(--ds-space-sm); font-size: var(--ds-text-sm); font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-tertiary); text-transform: uppercase; letter-spacing: .04em; }
.mm__armed-hint { text-transform: none; letter-spacing: 0; color: var(--ds-color-accent); font-weight: var(--ds-weight-medium); }

.mm__bench { display: flex; flex-wrap: wrap; gap: var(--ds-space-sm); }
.mm__bchip { display: inline-flex; align-items: center; gap: 8px; padding: 10px 14px; border: 1.5px solid var(--ds-color-border); border-radius: var(--ds-radius-full); background: var(--ds-color-bg-elevated); cursor: pointer; transition: all .15s ease; -webkit-tap-highlight-color: transparent; }
.mm__bchip--armed { border-color: var(--ds-color-accent); background: var(--ds-color-accent); color: var(--ds-color-accent-text); }
.mm__bname { font-size: var(--ds-text-md); font-weight: var(--ds-weight-medium); }
.mm__btime { font-variant-numeric: tabular-nums; font-size: var(--ds-text-sm); opacity: .65; }
.mm__btag { font-size: var(--ds-text-xs); opacity: .6; }

/* ── Done ── */
.mm__donehead { display: flex; align-items: center; justify-content: space-between; gap: var(--ds-space-md); }
.mm__totalpill { font-variant-numeric: tabular-nums; font-size: var(--ds-text-sm); font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-secondary); background: var(--ds-color-bg-subtle); padding: 6px 12px; border-radius: var(--ds-radius-full); }

.summary {
  margin-top: var(--ds-space-lg);
  background: var(--ds-color-bg-elevated);
  border: 1px solid var(--ds-color-border-light);
  border-radius: var(--ds-radius-lg);
  box-shadow: var(--ds-shadow-xs);
  overflow: hidden;
}
.srow { display: flex; align-items: center; gap: var(--ds-space-md); padding: 12px var(--ds-space-lg); }
.srow + .srow { border-top: 1px solid var(--ds-color-border-light); }
.srow__avatar {
  flex: none; width: 36px; height: 36px; display: grid; place-items: center;
  border-radius: 50%; font-size: var(--ds-text-sm); font-weight: var(--ds-weight-bold);
  background: var(--team-bg); color: var(--team-fg); border: 1px solid transparent;
}
.srow__main { flex: 1; min-width: 0; }
.srow__top { display: flex; align-items: baseline; justify-content: space-between; gap: var(--ds-space-sm); margin-bottom: 6px; }
.srow__name { font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-primary); }
.srow__time { font-variant-numeric: tabular-nums; font-weight: var(--ds-weight-bold); color: var(--ds-color-text-primary); display: inline-flex; align-items: center; gap: 6px; }
.srow__keep { font-size: 10px; font-weight: var(--ds-weight-bold); color: #fff; background: var(--ds-color-warning); padding: 1px 6px; border-radius: var(--ds-radius-full); }
.srow__track { display: block; height: 7px; background: var(--ds-color-bg-subtle); border-radius: var(--ds-radius-full); overflow: hidden; }
.srow__bar { display: block; height: 100%; background: var(--team-fg); border-radius: var(--ds-radius-full); transition: width .4s var(--ds-ease-out, ease); }

/* Lagfarger på avatar + bar */
.srow { --team-bg: var(--ds-color-bg-subtle); --team-fg: var(--ds-color-accent); }
.srow[data-team="gronn"] { --team-bg: var(--ds-team-gronn-bg); --team-fg: var(--ds-team-gronn); }
.srow[data-team="rod"]   { --team-bg: var(--ds-team-rod-bg);   --team-fg: var(--ds-team-rod); }
.srow[data-team="hvit"]  { --team-bg: var(--ds-team-hvit-bg);  --team-fg: var(--ds-color-text-secondary); }
.srow[data-team="hvit"] .srow__avatar { border-color: var(--ds-team-hvit-border, var(--ds-color-border)); }

.mm__doneactions { display: flex; gap: var(--ds-space-sm); margin-top: var(--ds-space-lg); }
.mm__btn { flex: 1; padding: 16px; border-radius: var(--ds-radius-lg); font-family: var(--ds-font-body); font-size: var(--ds-text-md); font-weight: var(--ds-weight-bold); cursor: pointer; -webkit-tap-highlight-color: transparent; }
.mm__btn--primary { border: none; background: var(--ds-color-accent); color: var(--ds-color-accent-text); }
.mm__btn--ghost { border: 1.5px solid var(--ds-color-border); background: var(--ds-color-bg-elevated); color: var(--ds-color-text-secondary); }

/* ── Sheet ── */
.mm__sheet { padding-top: var(--ds-space-sm); }
.mm__sheet-action { width: 100%; padding: 14px; margin-bottom: var(--ds-space-md); border: 1.5px solid var(--ds-color-warning); border-radius: var(--ds-radius-md); background: var(--ds-color-bg-elevated); color: var(--ds-color-warning); font-family: var(--ds-font-body); font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold); cursor: pointer; }
.mm__sheet-label { font-size: var(--ds-text-sm); color: var(--ds-color-text-tertiary); margin-bottom: var(--ds-space-sm); }
.mm__remove-btn {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  width: 100%; padding: 12px; margin-bottom: var(--ds-space-md);
  border: 1.5px solid var(--ds-color-error); border-radius: var(--ds-radius-md);
  background: transparent; color: var(--ds-color-error);
  font-family: var(--ds-font-body); font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold);
  cursor: pointer; -webkit-tap-highlight-color: transparent;
}
.mm__remove-btn svg { width: 16px; height: 16px; }
.mm__remove-btn:active { background: var(--ds-color-error-light, rgba(220,38,38,.08)); }
</style>
