<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '../stores/auth'
import { useCups } from '../composables/useCups'
import { useCupMatches } from '../composables/useCupMatches'
import { useCupMatchGoals } from '../composables/useCupMatchGoals'
import { useCupSquad } from '../composables/useCupSquad'
import { usePlayers } from '../composables/usePlayers'
import { useToast } from '../composables/useToast'
import { cupTeam } from '../lib/cupTeams'
import Sheet from '../components/Sheet.vue'

const route = useRoute()
const router = useRouter()
const { isParent } = useAuth()
const { activeCup, fetchCups } = useCups()
const { cupMatches, fetchCupMatches, getCupMatch, updateCupMatch } = useCupMatches()
const { goals, fetchForMatch, addGoal, removeGoal } = useCupMatchGoals()
const { fetchCupSquad, playerIdsForTeam } = useCupSquad()
const { players, fetchPlayers, getPlayerById } = usePlayers()
const { show: showToast } = useToast()

const canEdit = computed(() => !isParent.value)
const loading = ref(true)
const match = ref(null)
const matchId = route.params.id

const homeScoreInput = ref('')
const awayScoreInput = ref('')
const reportInput = ref('')
const isEditingReport = ref(false)
const showScorerSheet = ref(false)
const lastTappedPlayerId = ref('')

onMounted(async () => {
  await Promise.all([fetchCups(), fetchPlayers()])
  if (activeCup.value) {
    if (!cupMatches.value.length) await fetchCupMatches(activeCup.value.id)
    await fetchCupSquad(activeCup.value.id)
  }
  match.value = getCupMatch(matchId)
  if (match.value) {
    await fetchForMatch(matchId)
    homeScoreInput.value = match.value.home_score ?? ''
    awayScoreInput.value = match.value.away_score ?? ''
    reportInput.value = match.value.report || ''
    isEditingReport.value = !match.value.report
  }
  loading.value = false
})

const teamName = computed(() => cupTeam(match.value?.our_team)?.name || 'Halsen')
const timeLabel = computed(() => (match.value?.match_time ? match.value.match_time.slice(0, 5) : ''))
const dateLabel = computed(() => {
  if (!match.value?.match_date) return ''
  return new Date(match.value.match_date + 'T00:00:00')
    .toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' })
})

const hasResult = computed(() =>
  match.value?.home_score !== null && match.value?.home_score !== undefined &&
  match.value?.away_score !== null && match.value?.away_score !== undefined)

function isValidScore(v) {
  if (v === '' || v === null || v === undefined) return false
  const n = Number(v)
  return Number.isInteger(n) && n >= 0 && n <= 99
}
const isResultValid = computed(() => isValidScore(homeScoreInput.value) && isValidScore(awayScoreInput.value))
const isResultChanged = computed(() => {
  const h = homeScoreInput.value === '' ? null : Number(homeScoreInput.value)
  const a = awayScoreInput.value === '' ? null : Number(awayScoreInput.value)
  return h !== (match.value?.home_score ?? null) || a !== (match.value?.away_score ?? null)
})

async function saveResult() {
  if (!isResultValid.value || !isResultChanged.value) return
  const home = Number(homeScoreInput.value)
  const away = Number(awayScoreInput.value)
  await updateCupMatch(matchId, { home_score: home, away_score: away })
  match.value.home_score = home
  match.value.away_score = away
  showToast(`Resultat lagret: ${home}–${away}`, 'success')
}
async function clearResult() {
  await updateCupMatch(matchId, { home_score: null, away_score: null })
  match.value.home_score = null
  match.value.away_score = null
  homeScoreInput.value = ''
  awayScoreInput.value = ''
  showToast('Resultat fjernet', 'success')
}

// ── Målscorere ──
const matchGoals = computed(() =>
  goals.value.filter(g => g.cup_match_id === matchId).slice().sort((a, b) => a.position - b.position))

const aggregatedScorers = computed(() => {
  const groups = new Map()
  for (const g of matchGoals.value) {
    if (!groups.has(g.player_id)) {
      groups.set(g.player_id, { player_id: g.player_id, player: getPlayerById(g.player_id), count: 0, goalIds: [], firstPosition: g.position })
    }
    const e = groups.get(g.player_id)
    e.count++
    e.goalIds.push(g.id)
  }
  return [...groups.values()].sort((a, b) => a.firstPosition - b.firstPosition)
})

// Scorer-velger: lagets tropp (faller tilbake til alle spillere hvis troppen ikke er satt).
const pickerPlayers = computed(() => {
  const ids = playerIdsForTeam(match.value?.our_team)
  const base = ids.length ? players.value.filter(p => ids.includes(p.id)) : players.value
  return [...base].sort((a, b) => a.name.localeCompare(b.name, 'no'))
})
const squadIsEmpty = computed(() => playerIdsForTeam(match.value?.our_team).length === 0)

function goalCountForPlayer(pid) {
  return matchGoals.value.filter(g => g.player_id === pid).length
}
async function tapPlayer(pid) {
  lastTappedPlayerId.value = pid
  await addGoal(matchId, pid)
}
const lastTappedEntry = computed(() =>
  lastTappedPlayerId.value ? aggregatedScorers.value.find(s => s.player_id === lastTappedPlayerId.value) : null)
async function removeLastGoal() {
  const e = lastTappedEntry.value
  if (!e || !e.goalIds.length) return
  await removeGoal(e.goalIds[e.goalIds.length - 1])
}

// ── Referat ──
const isReportChanged = computed(() => match.value && reportInput.value !== (match.value.report || ''))
async function saveReport() {
  if (!isReportChanged.value) return
  await updateCupMatch(matchId, { report: reportInput.value })
  match.value.report = reportInput.value
  if (reportInput.value.trim()) isEditingReport.value = false
  showToast('Referat lagret', 'success')
}
</script>

<template>
  <div v-if="loading" class="desktop-container">
    <p class="cmd-readmuted" style="padding:30px 16px;text-align:center;">Henter kamp …</p>
  </div>

  <div v-else-if="!match" class="desktop-container">
    <div class="px-lg" style="padding-top: var(--ds-space-md);">
      <button class="back-btn" @click="router.back()">← Tilbake</button>
    </div>
    <p class="cmd-readmuted" style="padding:30px 16px;text-align:center;">Fant ikke kampen.</p>
  </div>

  <div v-else class="desktop-container">
    <div class="px-lg" style="padding-top: var(--ds-space-md);">
      <button class="back-btn" @click="router.back()">← Tilbake</button>
    </div>

    <!-- Header -->
    <div class="px-lg mt-lg">
      <div class="ds-card cmd-card">
        <div class="cmd-meta">
          {{ dateLabel }}<template v-if="timeLabel"> · {{ timeLabel }}</template><template v-if="match.pitch"> · {{ match.pitch }}</template>
        </div>
        <div class="cmd-teams">
          <span class="cmd-team">{{ teamName }}</span>
          <span v-if="hasResult" class="cmd-score">{{ match.home_score }}<span class="cmd-dash">–</span>{{ match.away_score }}</span>
          <span v-else class="cmd-vs">mot</span>
          <span class="cmd-team cmd-team--opp">{{ match.opponent || 'TBD' }}</span>
        </div>
        <div v-if="match.round" class="cmd-round">{{ match.round }}</div>
      </div>
    </div>

    <div class="px-lg mt-lg cmd-sections">
      <!-- Resultat -->
      <section class="cmd-section">
        <div class="cmd-label">Resultat</div>
        <template v-if="canEdit">
          <div class="result-form">
            <input v-model="homeScoreInput" type="number" min="0" max="99" inputmode="numeric" class="ds-input result-input" :aria-label="`Mål ${teamName}`" @keydown.enter="saveResult" />
            <span class="result-dash">–</span>
            <input v-model="awayScoreInput" type="number" min="0" max="99" inputmode="numeric" class="ds-input result-input" :aria-label="`Mål ${match.opponent}`" @keydown.enter="saveResult" />
            <button type="button" class="ds-btn ds-btn--primary ds-btn--sm" :disabled="!isResultValid || !isResultChanged" @click="saveResult">Lagre</button>
          </div>
          <button v-if="hasResult" type="button" class="ds-btn ds-btn--ghost ds-btn--sm" style="margin-top:8px;" @click="clearResult">Fjern resultat</button>
        </template>
        <template v-else>
          <p v-if="hasResult" class="cmd-readscore">{{ teamName }} {{ match.home_score }}–{{ match.away_score }} {{ match.opponent }}</p>
          <p v-else class="cmd-readmuted">Ikke spilt ennå</p>
        </template>
      </section>

      <!-- Målscorere -->
      <section class="cmd-section">
        <div class="cmd-label">Målscorere</div>
        <div v-if="aggregatedScorers.length === 0" class="cmd-readmuted">Ingen scorere registrert{{ canEdit ? ' ennå' : '' }}.</div>
        <div v-else class="cmd-pills">
          <span v-for="s in aggregatedScorers" :key="s.player_id" class="referee-pill cmd-scorer">
            {{ s.player?.name || 'Ukjent' }}<span v-if="s.count > 1" class="cmd-scorer__count"> ×{{ s.count }}</span>
          </span>
        </div>
        <button v-if="canEdit" type="button" class="ds-btn ds-btn--secondary ds-btn--sm" style="margin-top:10px;" @click="showScorerSheet = true">+ Legg til scorer</button>
      </section>

      <!-- Referat -->
      <section class="cmd-section">
        <div class="cmd-label">
          Kampreferat
          <button v-if="canEdit && !isEditingReport && match.report" type="button" class="cmd-editlink" @click="isEditingReport = true">Rediger</button>
        </div>
        <template v-if="canEdit">
          <div v-if="!isEditingReport && match.report" class="cmd-report-read">{{ match.report }}</div>
          <template v-else>
            <textarea v-model="reportInput" class="ds-input cmd-textarea" rows="6" maxlength="1000" placeholder="Skriv kort om kampen — høydepunkter, læring …"></textarea>
            <div style="display:flex;justify-content:flex-end;margin-top:8px;">
              <button type="button" class="ds-btn ds-btn--primary ds-btn--sm" :disabled="!isReportChanged" @click="saveReport">{{ isReportChanged ? 'Lagre referat' : 'Lagret' }}</button>
            </div>
          </template>
        </template>
        <template v-else>
          <div v-if="match.report" class="cmd-report-read">{{ match.report }}</div>
          <div v-else class="cmd-readmuted">Ingen referat ennå.</div>
        </template>
      </section>
    </div>

    <!-- Scorer-sheet (kun trener) -->
    <Sheet :show="showScorerSheet" title="Mål" @close="showScorerSheet = false">
      <div class="scorer-form">
        <p class="cmd-readmuted" style="margin:0 0 12px;">Trykk på spiller for å registrere mål. Flere trykk = flere mål.</p>
        <div v-if="squadIsEmpty" class="cmd-readmuted" style="margin:0 0 12px;">
          Troppen for {{ teamName }} er ikke satt opp ennå (viser hele spillerlista). Sett opp under «Tropp».
        </div>
        <div class="cmd-picker">
          <button
            v-for="p in pickerPlayers"
            :key="p.id"
            type="button"
            class="referee-pill"
            :class="{ 'referee-pill--selected': goalCountForPlayer(p.id) > 0 }"
            @click="tapPlayer(p.id)"
          >
            {{ p.name }}<span v-if="goalCountForPlayer(p.id) > 0"> ×{{ goalCountForPlayer(p.id) }}</span>
          </button>
        </div>
        <div class="cmd-sheet-bottom">
          <button v-if="lastTappedEntry && lastTappedEntry.count > 0" type="button" class="ds-btn ds-btn--secondary" @click="removeLastGoal">
            − Fjern mål fra {{ lastTappedEntry.player?.name || 'spiller' }}
          </button>
          <button type="button" class="ds-btn ds-btn--primary" style="margin-left:auto;" @click="showScorerSheet = false">Ferdig</button>
        </div>
      </div>
    </Sheet>
  </div>
</template>

<style scoped>
.cmd-card { padding: var(--ds-space-lg); }
.cmd-meta {
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-tertiary);
  text-transform: capitalize;
  margin-bottom: var(--ds-space-sm);
}
.cmd-teams { display: flex; align-items: center; justify-content: center; gap: var(--ds-space-md); }
.cmd-team {
  font-family: var(--ds-font-heading);
  font-size: var(--ds-text-lg);
  font-weight: var(--ds-weight-bold);
  letter-spacing: var(--ds-tracking-tight);
  color: var(--ds-color-text-primary);
}
.cmd-team--opp { color: var(--ds-color-text-secondary); font-weight: var(--ds-weight-semibold); }
.cmd-vs { color: var(--ds-color-text-tertiary); font-size: var(--ds-text-sm); }
.cmd-score {
  display: inline-flex; align-items: baseline; gap: 6px;
  font-size: 1.75rem; font-weight: 700; font-variant-numeric: tabular-nums;
  color: var(--ds-color-text-primary); line-height: 1;
}
.cmd-dash { color: var(--ds-color-text-tertiary); font-weight: 500; font-size: 1.25rem; }
.cmd-round { text-align: center; font-size: var(--ds-text-xs); color: var(--ds-color-text-tertiary); margin-top: var(--ds-space-sm); }

.cmd-sections { display: flex; flex-direction: column; gap: var(--ds-space-xl); }
.cmd-section { }
.cmd-label {
  display: flex; align-items: center; justify-content: space-between;
  font-size: var(--ds-text-xs); font-weight: var(--ds-weight-semibold);
  text-transform: uppercase; letter-spacing: 0.04em;
  color: var(--ds-color-text-secondary);
  margin-bottom: var(--ds-space-sm);
}
.cmd-editlink {
  appearance: none; border: none; background: transparent;
  font-family: var(--ds-font-body); font-size: var(--ds-text-xs); font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-warm); cursor: pointer; text-transform: none; letter-spacing: 0;
}
.cmd-readscore { font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-primary); margin: 0; }
.cmd-readmuted { color: var(--ds-color-text-tertiary); font-size: var(--ds-text-sm); margin: 0; }

/* Resultat-skjema – identisk med seriekamper (skjuler tallfelt-pilene) */
.result-form { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
.result-input {
  width: 64px; text-align: center;
  font-variant-numeric: tabular-nums;
  font-weight: 600; font-size: 1rem;
  -moz-appearance: textfield;
}
.result-input::-webkit-outer-spin-button,
.result-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.result-dash { font-size: 1.125rem; font-weight: 700; color: var(--ds-color-text-tertiary); }

.cmd-pills { display: flex; flex-wrap: wrap; gap: 8px; }
.cmd-scorer__count { font-weight: var(--ds-weight-bold); }

.cmd-textarea { width: 100%; min-height: 120px; resize: vertical; line-height: 1.5; }
.cmd-report-read {
  white-space: pre-wrap;
  background: var(--ds-color-bg-subtle);
  border: var(--ds-border-width) solid var(--ds-color-border-light);
  border-radius: var(--ds-radius-md);
  padding: var(--ds-space-md);
  color: var(--ds-color-text-primary);
  font-size: var(--ds-text-sm);
  line-height: 1.55;
}

.scorer-form { padding-top: var(--ds-space-sm); }
.cmd-picker { display: flex; flex-wrap: wrap; gap: 8px; }
.cmd-sheet-bottom { display: flex; gap: 8px; margin-top: var(--ds-space-lg); }
</style>
