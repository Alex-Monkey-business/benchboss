<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '../stores/auth'
import { useCups } from '../composables/useCups'
import { useCupMatches } from '../composables/useCupMatches'
import { useCupMatchGoals } from '../composables/useCupMatchGoals'
import { useCupSquad } from '../composables/useCupSquad'
import { useCupTeams } from '../composables/useCupTeams'
import { usePlayers } from '../composables/usePlayers'
import { useToast } from '../composables/useToast'
import { cupTeam } from '../lib/cupTeams'
import { trimAbbrevDots } from '../lib/dateLabels'
import { supabase, isSupabaseConfigured } from '../supabase'
import { useKlubbmerke } from '../composables/useKlubbmerke'
import Sheet from '../components/Sheet.vue'
import TeamCrest from '../components/TeamCrest.vue'
import BackLink from '../components/BackLink.vue'

const route = useRoute()
const router = useRouter()
const { isParent } = useAuth()
const { activeCup, fetchCups } = useCups()
const { cupMatches, fetchCupMatches, getCupMatch, updateCupMatch } = useCupMatches()
const { goals, fetchForMatch, addGoal, removeGoal } = useCupMatchGoals()
const { fetchCupSquad, playerIdsForTeam } = useCupSquad()
const { cupTeams } = useCupTeams()
const { players, fetchPlayers, getPlayerById } = usePlayers()
const { show: showToast } = useToast()
const { merkeFor } = useKlubbmerke()

const canEdit = computed(() => !isParent.value)
const matchId = route.params.id
// Kampen vi allerede har, tegnes med en gang. Bare uten den venter siden.
const match = ref(getCupMatch(matchId) || null)
const loading = ref(!match.value)

const homeScoreInput = ref(match.value?.home_score ?? '')
const awayScoreInput = ref(match.value?.away_score ?? '')
const reportInput = ref(match.value?.report || '')
const isEditingReport = ref(false)
// Samme regel som seriekampen: resultatet leses før det redigeres.
const editingResult = ref(false)
const showScorerSheet = ref(false)
const lastTappedPlayerId = ref('')

onMounted(async () => {
  await Promise.all([fetchCups(), fetchPlayers()])
  if (activeCup.value && !cupMatches.value.length) await fetchCupMatches(activeCup.value.id)
  const fersk = getCupMatch(matchId)
  if (fersk) match.value = fersk
  // En lenke kan peke på en kamp i en annen cup enn den aktive. Da hentes
  // kampen direkte på id, så siden ikke sier «Fant ikke kampen».
  if (!match.value && isSupabaseConfigured) {
    const { data } = await supabase.from('cup_matches').select('*').eq('id', matchId).maybeSingle()
    if (data) match.value = data
  }
  if (match.value) {
    const cupId = match.value.cup_id || activeCup.value?.id
    await Promise.all([fetchForMatch(matchId), cupId ? fetchCupSquad(cupId) : null])
    // Ikke skriv over noe treneren har begynt å skrive mens kampen ble hentet.
    if (!editingResult.value && !resultatRort.value) {
      homeScoreInput.value = match.value.home_score ?? ''
      awayScoreInput.value = match.value.away_score ?? ''
    }
    if (!isEditingReport.value) reportInput.value = match.value.report || ''
  }
  loading.value = false
})

// Sto «|| 'Halsen'». Det var den siste hardkodede klubben i cup-modulen: et
// hvilket som helst annet lags cup-kamp viste Halsen som sitt eget lag. Nå er
// det lagene som er meldt på cupen, så den gamle tabellen, så slug-en — og
// slug-en er alltid noe treneren selv har skrevet.
const teamName = computed(() => {
  const slug = match.value?.our_team
  if (!slug) return ''
  return cupTeams.value.find(t => t.slug === slug)?.name || cupTeam(slug)?.name || slug
})
const timeLabel = computed(() => (match.value?.match_time ? match.value.match_time.slice(0, 5) : ''))
const dateLabel = computed(() => {
  if (!match.value?.match_date) return ''
  return trimAbbrevDots(new Date(match.value.match_date + 'T12:00:00')
    .toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short' }))
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
const resultatRort = computed(() => String(homeScoreInput.value) !== String(match.value?.home_score ?? '') || String(awayScoreInput.value) !== String(match.value?.away_score ?? ''))
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
  <div v-if="loading" class="desktop-container"></div>

  <div v-else-if="!match" class="desktop-container">
    <div class="px-lg" style="padding-top: var(--ds-space-md);">
      <BackLink to="/cup" label="Cup" historikk />
    </div>
    <p class="cmd-readmuted" style="padding:30px 16px;text-align:center;">Fant ikke kampen.</p>
  </div>

  <div v-else class="desktop-container">
    <div class="px-lg" style="padding-top: var(--ds-space-md);">
      <BackLink to="/cup" label="Cup" historikk />
    </div>

    <!-- Samme hero som seriekampen: vårt lag, resultat eller tid, motstander. -->
    <header class="px-lg hero">
      <div class="hero__grid">
        <div class="hero__side">
          <TeamCrest :name="teamName || 'Vi'" :src="merkeFor(teamName)" :size="56" />
          <span class="hero__team">{{ teamName }}</span>
        </div>
        <div class="hero__mid">
          <span v-if="hasResult" class="hero__big">{{ match.home_score }} – {{ match.away_score }}</span>
          <span v-else-if="timeLabel" class="hero__big">{{ timeLabel }}</span>
          <span v-else class="hero__big hero__big--tba">–</span>
          <span class="hero__sub">{{ dateLabel }}</span>
        </div>
        <div class="hero__side">
          <TeamCrest :name="match.opponent || '–'" :src="merkeFor(match.opponent)" :size="56" />
          <span class="hero__team">{{ match.opponent || '–' }}</span>
        </div>
      </div>
      <p v-if="match.pitch || match.round" class="hero__place">
        {{ [match.pitch, match.round].filter(Boolean).join(' · ') }}
      </p>
    </header>

    <div class="px-lg mt-lg cmd-sections">
      <!-- Resultat -->
      <section class="cmd-section">
        <div class="cmd-head">
          <h2 class="cmd-label">Resultat</h2>
          <button v-if="canEdit && hasResult" type="button" class="ds-btn ds-btn--ghost ds-btn--sm cmd-headbtn" @click="editingResult = !editingResult">{{ editingResult ? 'Ferdig' : 'Endre' }}</button>
        </div>
        <template v-if="canEdit && (!hasResult || editingResult)">
          <div class="result-form">
            <input v-model="homeScoreInput" type="number" min="0" max="99" inputmode="numeric" class="ds-input result-input" :aria-label="`Mål ${teamName}`" @keydown.enter="saveResult" />
            <span class="result-dash">–</span>
            <input v-model="awayScoreInput" type="number" min="0" max="99" inputmode="numeric" class="ds-input result-input" :aria-label="`Mål ${match.opponent}`" @keydown.enter="saveResult" />
            <button v-if="isResultChanged" type="button" class="ds-btn ds-btn--primary result-save" :disabled="!isResultValid" @click="saveResult">Lagre</button>
          </div>
          <button v-if="hasResult" type="button" class="ds-btn ds-btn--ghost cmd-full" @click="clearResult">Fjern resultat</button>
        </template>
        <p v-else-if="hasResult" class="cmd-readscore">{{ teamName }} {{ match.home_score }}–{{ match.away_score }} {{ match.opponent }}</p>
        <p v-else class="cmd-readmuted">Ikke spilt ennå</p>
      </section>

      <!-- Målscorere -->
      <section class="cmd-section">
        <div class="cmd-head">
          <h2 class="cmd-label">Målscorere</h2>
        </div>
        <p v-if="aggregatedScorers.length === 0" class="cmd-readmuted">Ingen ennå</p>
        <div v-else class="cmd-pills">
          <span v-for="s in aggregatedScorers" :key="s.player_id" class="referee-pill cmd-scorer">
            {{ s.player?.name || 'Ukjent' }}<span v-if="s.count > 1" class="cmd-scorer__count"> ×{{ s.count }}</span>
          </span>
        </div>
        <button v-if="canEdit" type="button" class="ds-btn ds-btn--secondary cmd-full" @click="showScorerSheet = true">Legg til scorer</button>
      </section>

      <!-- Referat -->
      <section class="cmd-section">
        <div class="cmd-head">
          <h2 class="cmd-label">Kampreferat</h2>
          <button v-if="canEdit && !isEditingReport && match.report" type="button" class="ds-btn ds-btn--ghost ds-btn--sm cmd-headbtn" @click="isEditingReport = true">Endre</button>
        </div>
        <template v-if="canEdit">
          <div v-if="!isEditingReport && match.report" class="cmd-report-read">{{ match.report }}</div>
          <template v-else-if="isEditingReport">
            <textarea v-model="reportInput" class="ds-input cmd-textarea" rows="6" maxlength="1000" placeholder="Høydepunkter, læring …"></textarea>
            <div class="cmd-actions">
              <button type="button" class="ds-btn ds-btn--ghost" @click="reportInput = match.report || ''; isEditingReport = false">Avbryt</button>
              <button type="button" class="ds-btn ds-btn--primary" :disabled="!isReportChanged" @click="saveReport">Lagre</button>
            </div>
          </template>
          <button v-else type="button" class="ds-btn ds-btn--secondary cmd-full" @click="isEditingReport = true">Skriv referat</button>
        </template>
        <template v-else>
          <div v-if="match.report" class="cmd-report-read">{{ match.report }}</div>
          <p v-else class="cmd-readmuted">Ingen ennå</p>
        </template>
      </section>
    </div>

    <!-- Scorer-sheet (kun trener) -->
    <Sheet :show="showScorerSheet" title="Mål" @close="showScorerSheet = false">
      <div class="scorer-form">
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
/* Hero og seksjoner speiler seriekampen (MatchDetailView). */
.hero {
  margin-top: var(--ds-space-md);
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-md);
}
.hero__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  column-gap: var(--ds-space-md);
  align-items: start;
}
.hero__side {
  display: flex; flex-direction: column; align-items: center;
  gap: 10px; min-width: 0; text-align: center;
}
.hero__team {
  font-size: var(--ds-text-sm);
  overflow-wrap: break-word;
  font-weight: var(--ds-weight-semibold);
  line-height: 1.25;
  color: var(--ds-color-text-primary);
}
.hero__mid {
  display: flex; flex-direction: column; align-items: center;
  gap: 6px; min-width: 84px; padding: 8px 0 0;
}
.hero__big {
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-2xl);
  font-weight: var(--ds-weight-bold);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  line-height: 1;
  color: var(--ds-color-text-primary);
  white-space: nowrap;
}
.hero__big--tba { color: var(--ds-color-text-tertiary); }
.hero__sub {
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-secondary);
  text-align: center;
}
.hero__place {
  margin: 0;
  text-align: center;
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-tertiary);
}

.cmd-sections { display: flex; flex-direction: column; gap: 10px; padding-bottom: var(--ds-space-xl); }
.cmd-section {
  background: var(--ds-color-bg-subtle);
  border-radius: var(--ds-radius-lg);
  padding: var(--ds-space-md);
  display: flex; flex-direction: column; gap: var(--ds-space-sm);
}
.cmd-head {
  display: flex; align-items: center; justify-content: space-between;
  min-height: 32px;
}
.cmd-label {
  margin: 0;
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: 0;
  color: var(--ds-color-text-primary);
}
.cmd-headbtn { margin-right: calc(-1 * var(--ds-space-sm)); }
.cmd-full { width: 100%; margin-top: var(--ds-space-xs); }
.cmd-actions { display: flex; justify-content: flex-end; gap: 8px; }
.cmd-readscore { font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-primary); margin: 0; }
.cmd-readmuted { color: var(--ds-color-text-tertiary); font-size: var(--ds-text-sm); margin: 0; }

/* Resultat-skjema – identisk med seriekamper (skjuler tallfelt-pilene) */
.result-form { display: flex; align-items: center; gap: 8px; }
.result-input {
  width: 64px; min-height: var(--ds-btn-h); text-align: center;
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
.result-save { margin-left: auto; }

.cmd-pills { display: flex; flex-wrap: wrap; gap: 8px; }
.cmd-scorer__count { font-weight: var(--ds-weight-bold); }

.cmd-textarea { width: 100%; min-height: 120px; resize: vertical; line-height: 1.5; }
.cmd-report-read {
  white-space: pre-wrap;
  color: var(--ds-color-text-primary);
  font-size: var(--ds-text-sm);
  line-height: 1.55;
}

.scorer-form { padding-top: var(--ds-space-sm); }
.cmd-picker { display: flex; flex-wrap: wrap; gap: 8px; }
.cmd-sheet-bottom { display: flex; gap: 8px; margin-top: var(--ds-space-lg); }
</style>
