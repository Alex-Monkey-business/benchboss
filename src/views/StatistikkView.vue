<script setup>
import { ref, computed, onMounted } from 'vue'
import { useSeasons } from '../composables/useSeasons'
import { useMatches } from '../composables/useMatches'
import { useCoaches } from '../composables/useCoaches'
import { useReferees } from '../composables/useReferees'
import { usePlayers } from '../composables/usePlayers'
import AnimatedNumber from '../components/AnimatedNumber.vue'
import Skeleton from '../components/Skeleton.vue'
import FormCurve from '../components/FormCurve.vue'

const { activeSeason, fetchSeasons } = useSeasons()
const { matches, matchCoaches, matchPlayers, fetchMatches } = useMatches()
const { coaches, fetchCoaches } = useCoaches()
const { referees, fetchReferees } = useReferees()
const { players, fetchPlayers } = usePlayers()

// Skeleton only on the very first load. Data persists across navigation.
const loading = ref(matches.value.length === 0)

onMounted(async () => {
  await Promise.all([fetchSeasons(), fetchCoaches(), fetchReferees(), fetchPlayers()])
  if (activeSeason.value) {
    await fetchMatches(activeSeason.value.id)
  }
  loading.value = false
})

const TEAM_LABELS = { gronn: 'Grønn', rod: 'Rød', hvit: 'Hvit' }
const TEAM_KEYS = ['gronn', 'rod', 'hvit']

function isHalsenTeam(name) {
  return (name || '').toLowerCase().includes('halsen')
}

function colorOf(name) {
  const n = (name || '').toLowerCase()
  if (n.includes('grønn') || n.includes('gronn')) return 'gronn'
  if (n.includes('rød') || n.includes('rod')) return 'rod'
  if (n.includes('hvit')) return 'hvit'
  return null
}

function isPlayed(match) {
  return match.home_score !== null && match.home_score !== undefined
    && match.away_score !== null && match.away_score !== undefined
}

const halsenMatches = computed(() => matches.value.filter(m =>
  isHalsenTeam(m.home_team) || isHalsenTeam(m.away_team)
))

const playedMatches = computed(() => halsenMatches.value.filter(isPlayed))

// Halsen totalt: ekskluder internkamper (Halsen vs Halsen) for å unngå
// dobbel-telling — de bidrar bare til per-lag-statistikk.
const halsenTotal = computed(() => {
  let played = 0, w = 0, d = 0, l = 0, gf = 0, ga = 0
  playedMatches.value.forEach(m => {
    const home = isHalsenTeam(m.home_team)
    const away = isHalsenTeam(m.away_team)
    if (home && away) return // internkamp
    played++
    const halsenScore = home ? m.home_score : m.away_score
    const oppScore = home ? m.away_score : m.home_score
    gf += halsenScore
    ga += oppScore
    if (halsenScore > oppScore) w++
    else if (halsenScore < oppScore) l++
    else d++
  })
  return { played, w, d, l, gf, ga, diff: gf - ga }
})

function statsForColor(color) {
  let played = 0, w = 0, d = 0, l = 0, gf = 0, ga = 0
  playedMatches.value.forEach(m => {
    const homeColor = isHalsenTeam(m.home_team) ? colorOf(m.home_team) : null
    const awayColor = isHalsenTeam(m.away_team) ? colorOf(m.away_team) : null
    const onHome = homeColor === color
    const onAway = awayColor === color
    if (!onHome && !onAway) return
    played++
    // Internkamp Halsen vs Halsen der dette laget er på begge sider er umulig.
    const teamScore = onHome ? m.home_score : m.away_score
    const oppScore = onHome ? m.away_score : m.home_score
    gf += teamScore
    ga += oppScore
    if (teamScore > oppScore) w++
    else if (teamScore < oppScore) l++
    else d++
  })
  return {
    played, w, d, l, gf, ga,
    diff: gf - ga,
    points: w * 3 + d
  }
}

// Recent results for form-curve, oldest → newest
function recentResultsForColor(color, limit = 10) {
  const sorted = [...playedMatches.value]
    .filter(m => !(isHalsenTeam(m.home_team) && isHalsenTeam(m.away_team)))
    .filter(m => {
      const homeColor = isHalsenTeam(m.home_team) ? colorOf(m.home_team) : null
      const awayColor = isHalsenTeam(m.away_team) ? colorOf(m.away_team) : null
      return homeColor === color || awayColor === color
    })
    .sort((a, b) => a.match_date.localeCompare(b.match_date))
    .slice(-limit)

  return sorted.map(m => {
    const onHome = isHalsenTeam(m.home_team) && colorOf(m.home_team) === color
    const teamScore = onHome ? m.home_score : m.away_score
    const oppScore = onHome ? m.away_score : m.home_score
    const opponent = onHome ? m.away_team : m.home_team
    let result = 'd'
    if (teamScore > oppScore) result = 'w'
    else if (teamScore < oppScore) result = 'l'
    return { result, opponent, score: `${teamScore} – ${oppScore}`, date: m.match_date }
  })
}

const halsenRecentResults = computed(() => {
  const sorted = [...playedMatches.value]
    .filter(m => !(isHalsenTeam(m.home_team) && isHalsenTeam(m.away_team)))
    .sort((a, b) => a.match_date.localeCompare(b.match_date))
    .slice(-10)
  return sorted.map(m => {
    const home = isHalsenTeam(m.home_team)
    const halsenScore = home ? m.home_score : m.away_score
    const oppScore = home ? m.away_score : m.home_score
    const opponent = home ? m.away_team : m.home_team
    let result = 'd'
    if (halsenScore > oppScore) result = 'w'
    else if (halsenScore < oppScore) result = 'l'
    return { result, opponent, score: `${halsenScore} – ${oppScore}`, date: m.match_date }
  })
})

const teamStats = computed(() =>
  TEAM_KEYS
    .map(key => ({
      key,
      label: TEAM_LABELS[key],
      recent: recentResultsForColor(key),
      ...statsForColor(key)
    }))
    .sort((a, b) =>
      b.points - a.points ||
      b.diff - a.diff ||
      b.gf - a.gf ||
      a.label.localeCompare(b.label)
    )
)

// Trener-leaderboard
const coachStats = computed(() => {
  const counts = {}
  matchCoaches.value.forEach(mc => {
    counts[mc.coach_id] = (counts[mc.coach_id] || 0) + 1
  })
  return coaches.value
    .map(c => ({ id: c.id, name: c.name, count: counts[c.id] || 0 }))
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
})

// Dommer-leaderboard — grouper på matches.referee-strengen
const refereeStats = computed(() => {
  const counts = {}
  halsenMatches.value.forEach(m => {
    const name = (m.referee || '').trim()
    if (!name) return
    counts[name] = (counts[name] || 0) + 1
  })
  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
})

// Hospitant-leaderboard
const playerStats = computed(() => {
  const counts = {}
  matchPlayers.value.forEach(mp => {
    counts[mp.player_id] = (counts[mp.player_id] || 0) + 1
  })
  return players.value
    .map(p => ({ id: p.id, name: p.name, primary_team: p.primary_team, count: counts[p.id] || 0 }))
    .filter(p => p.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
})

const hasAnyResult = computed(() => playedMatches.value.length > 0)
</script>

<template>
  <div class="desktop-container">
    <div class="page-header ds-anim-fade-up">
      <h1 class="page-header__title">Statistikk</h1>
      <p class="page-header__subtitle">{{ activeSeason?.name }}</p>
    </div>

    <div v-if="loading" class="px-lg stat-skel-stack" aria-hidden="true">
      <Skeleton :width="100" :height="14" />
      <div class="ds-card stat-skel-card">
        <div class="stat-skel-card__top">
          <div v-for="i in 4" :key="i" class="stat-skel-card__metric">
            <Skeleton :width="36" :height="28" />
            <Skeleton :width="22" :height="11" />
          </div>
        </div>
        <div class="stat-skel-card__goals">
          <Skeleton :width="80" :height="13" />
          <Skeleton :width="32" :height="13" />
        </div>
      </div>
      <Skeleton :width="80" :height="14" style="margin-top: 8px;" />
      <div class="ds-card stat-skel-card">
        <div v-for="i in 3" :key="i" class="stat-skel-row">
          <Skeleton :width="60" :height="13" />
          <Skeleton :width="20" :height="13" />
          <Skeleton :width="20" :height="13" />
          <Skeleton :width="20" :height="13" />
          <Skeleton :width="30" :height="13" />
        </div>
      </div>
    </div>

    <template v-else>
    <!-- Halsen totalt -->
    <div class="px-lg mb-lg ds-anim-fade-up ds-anim-delay-1">
      <div class="stat-section-label">Halsen totalt</div>
      <div class="stat-card-large">
        <template v-if="hasAnyResult">
          <div class="stat-card-large__top">
            <div class="stat-card-large__metric">
              <AnimatedNumber class="stat-card-large__value" :value="halsenTotal.played" />
              <span class="stat-card-large__label">Spilt</span>
            </div>
            <div class="stat-card-large__metric stat-card-large__metric--win">
              <AnimatedNumber class="stat-card-large__value" :value="halsenTotal.w" />
              <span class="stat-card-large__label">V</span>
            </div>
            <div class="stat-card-large__metric stat-card-large__metric--draw">
              <AnimatedNumber class="stat-card-large__value" :value="halsenTotal.d" />
              <span class="stat-card-large__label">U</span>
            </div>
            <div class="stat-card-large__metric stat-card-large__metric--loss">
              <AnimatedNumber class="stat-card-large__value" :value="halsenTotal.l" />
              <span class="stat-card-large__label">T</span>
            </div>
          </div>
          <div class="stat-card-large__goals">
            <span class="stat-card-large__goals-text">
              Mål: <AnimatedNumber :value="halsenTotal.gf" /> – <AnimatedNumber :value="halsenTotal.ga" />
            </span>
            <span :class="['stat-card-large__diff', halsenTotal.diff >= 0 ? 'stat-card-large__diff--pos' : 'stat-card-large__diff--neg']">
              {{ halsenTotal.diff > 0 ? '+' : '' }}<AnimatedNumber :value="Math.abs(halsenTotal.diff)" />
            </span>
          </div>
          <div class="stat-card-large__form">
            <FormCurve :results="halsenRecentResults" :max="10" />
          </div>
        </template>
        <div v-else class="stat-empty">
          Ingen spilte kamper enda. V/U/T-tall vises når resultater registreres.
        </div>
      </div>
    </div>

    <!-- Per fargelag -->
    <div v-if="hasAnyResult" class="px-lg mb-lg ds-anim-fade-up ds-anim-delay-2">
      <div class="stat-section-label">Per lag</div>
      <div class="standings">
        <div class="standings__header">
          <span></span>
          <span>Sp</span>
          <span>V</span>
          <span>U</span>
          <span>T</span>
          <span class="standings__header-goals">Mål</span>
          <span class="standings__header-diff">+/-</span>
          <span class="standings__header-points">P</span>
        </div>
        <div v-for="team in teamStats" :key="team.key" class="standings__row">
          <span class="standings__team">
            <span :class="['standings__dot', `standings__dot--${team.key}`]" aria-hidden="true"></span>
            {{ team.label }}
          </span>
          <span class="standings__num standings__num--muted">{{ team.played }}</span>
          <span class="standings__num">{{ team.w }}</span>
          <span class="standings__num standings__num--muted">{{ team.d }}</span>
          <span class="standings__num standings__num--muted">{{ team.l }}</span>
          <span class="standings__goals">{{ team.gf }} – {{ team.ga }}</span>
          <span :class="['standings__diff', team.diff > 0 ? 'standings__diff--pos' : team.diff < 0 ? 'standings__diff--neg' : '']">
            {{ team.diff > 0 ? '+' : '' }}{{ team.diff }}
          </span>
          <span class="standings__points">{{ team.points }}</span>
        </div>
      </div>

      <!-- Form per team — last 10 matches -->
      <div v-if="teamStats.some(t => t.recent.length > 0)" class="form-section">
        <div class="form-section__label">Form siste 10</div>
        <div class="form-section__rows">
          <div v-for="team in teamStats" :key="team.key" class="form-section__row">
            <span class="form-section__team">
              <span :class="['standings__dot', `standings__dot--${team.key}`]" aria-hidden="true"></span>
              {{ team.label }}
            </span>
            <FormCurve :results="team.recent" :max="10" label="" />
          </div>
        </div>
      </div>
    </div>

    <!-- Lånespiller-leaderboard -->
    <div v-if="playerStats.length > 0" class="px-lg mb-lg ds-anim-fade-up ds-anim-delay-3">
      <div class="stat-section-label">Lånespillere</div>
      <div class="leaderboard ds-anim-stagger-list">
        <div v-for="(item, i) in playerStats" :key="item.id" class="leaderboard__row">
          <span class="leaderboard__rank">{{ i + 1 }}</span>
          <span class="leaderboard__name">
            {{ item.name }}
            <span v-if="item.primary_team" :class="['leaderboard__tag', `leaderboard__tag--${item.primary_team}`]">{{ TEAM_LABELS[item.primary_team] }}</span>
          </span>
          <span class="leaderboard__count">{{ item.count }} ekstra</span>
        </div>
      </div>
    </div>

    <!-- Trener-leaderboard -->
    <div v-if="coachStats.length > 0" class="px-lg mb-lg ds-anim-fade-up ds-anim-delay-4">
      <div class="stat-section-label">Trenere</div>
      <div class="leaderboard ds-anim-stagger-list">
        <div v-for="(item, i) in coachStats" :key="item.id" class="leaderboard__row">
          <span class="leaderboard__rank">{{ i + 1 }}</span>
          <span class="leaderboard__name">{{ item.name }}</span>
          <span class="leaderboard__count">{{ item.count }} {{ item.count === 1 ? 'kamp' : 'kamper' }}</span>
        </div>
      </div>
    </div>

    <!-- Dommer-leaderboard -->
    <div v-if="refereeStats.length > 0" class="px-lg mb-lg ds-anim-fade-up ds-anim-delay-5">
      <div class="stat-section-label">Dommere</div>
      <div class="leaderboard ds-anim-stagger-list">
        <div v-for="(item, i) in refereeStats" :key="item.name" class="leaderboard__row">
          <span class="leaderboard__rank">{{ i + 1 }}</span>
          <span class="leaderboard__name">{{ item.name }}</span>
          <span class="leaderboard__count">{{ item.count }} {{ item.count === 1 ? 'kamp' : 'kamper' }}</span>
        </div>
      </div>
    </div>
    </template>
  </div>
</template>

<style scoped>
.stat-card-large__form {
  margin-top: var(--ds-space-sm);
  padding-top: var(--ds-space-sm);
  border-top: 1px solid var(--ds-color-border-light);
}

.form-section {
  margin-top: var(--ds-space-md);
  padding: var(--ds-space-md) var(--ds-space-lg);
  background: var(--ds-color-bg-subtle);
  border-radius: var(--ds-radius-md);
}

.form-section__label {
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-medium);
  letter-spacing: var(--ds-tracking-wider);
  text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
  margin-bottom: var(--ds-space-sm);
}

.form-section__rows {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
}

.form-section__row {
  display: grid;
  grid-template-columns: 90px 1fr;
  align-items: center;
  gap: var(--ds-space-sm);
}

.form-section__team {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-primary);
}

.stat-skel-stack {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.stat-skel-card {
  padding: var(--ds-space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-md);
}

.stat-skel-card__top {
  display: flex;
  justify-content: space-between;
  gap: var(--ds-space-md);
}

.stat-skel-card__metric {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ds-space-xs);
}

.stat-skel-card__goals {
  display: flex;
  justify-content: space-between;
  padding-top: var(--ds-space-sm);
  border-top: 1px solid var(--ds-color-border-light);
}

.stat-skel-row {
  display: grid;
  grid-template-columns: 1fr auto auto auto auto;
  align-items: center;
  gap: var(--ds-space-md);
  padding: var(--ds-space-sm) 0;
  border-bottom: 1px solid var(--ds-color-border-light);
}

.stat-skel-row:last-child { border-bottom: 0; }

.stat-section-label {
  font-size: var(--ds-text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ds-color-text-tertiary);
  padding: 0 4px;
  margin-bottom: 8px;
}

/* Halsen totalt — large card */
.stat-card-large {
  background: var(--ds-color-bg-elevated);
  border: var(--ds-border-width) solid var(--ds-color-border);
  border-radius: var(--ds-radius-lg);
  padding: 20px;
}

.stat-card-large__top {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.stat-card-large__metric {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  text-align: center;
}

.stat-card-large__value {
  font-family: var(--ds-font-heading);
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--ds-color-text-primary);
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

.stat-card-large__metric--win .stat-card-large__value {
  color: var(--ds-color-success);
}

.stat-card-large__metric--loss .stat-card-large__value {
  color: var(--ds-color-error);
}

.stat-card-large__metric--draw .stat-card-large__value {
  color: var(--ds-color-text-secondary);
}

.stat-card-large__label {
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ds-color-text-tertiary);
  font-weight: 600;
}

.stat-card-large__goals {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 14px;
  border-top: 1px solid var(--ds-color-border-light);
}

.stat-card-large__goals-text {
  font-size: 0.875rem;
  color: var(--ds-color-text-secondary);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}

.stat-card-large__diff {
  font-family: var(--ds-font-heading);
  font-size: 0.9375rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  padding: 2px 10px;
  border-radius: 999px;
}

.stat-card-large__diff--pos {
  background: var(--ds-color-success-light);
  color: var(--ds-color-success);
}

.stat-card-large__diff--neg {
  background: var(--ds-color-error-light);
  color: var(--ds-color-error);
}

.stat-empty {
  padding: 16px 4px;
  text-align: center;
  font-size: 0.875rem;
  color: var(--ds-color-text-tertiary);
}

/* League-table style standings */
.standings {
  background: var(--ds-color-bg-elevated);
  border: var(--ds-border-width) solid var(--ds-color-border);
  border-radius: var(--ds-radius-lg);
  overflow: hidden;
}

.standings__header,
.standings__row {
  display: grid;
  grid-template-columns: 1fr 24px 24px 24px 24px auto auto auto;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  font-variant-numeric: tabular-nums;
}

.standings__header {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ds-color-text-tertiary);
  background: var(--ds-color-bg-subtle);
  padding-top: 8px;
  padding-bottom: 8px;
}

.standings__header > span {
  text-align: center;
}

.standings__header > span:first-child {
  text-align: left;
}

.standings__header-goals {
  min-width: 48px;
  text-align: right !important;
}

.standings__header-diff {
  min-width: 40px;
  text-align: center !important;
}

.standings__header-points {
  min-width: 24px;
  text-align: center !important;
}

.standings__row {
  border-top: 1px solid var(--ds-color-border-light);
}

.standings__team {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--ds-color-text-primary);
}

.standings__dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
}

.standings__dot--gronn {
  background: var(--ds-color-success);
}

.standings__dot--rod {
  background: var(--ds-color-error);
}

.standings__dot--hvit {
  background: var(--ds-color-bg);
  border: 1px solid var(--ds-color-border-strong);
}

.standings__num {
  text-align: center;
  font-size: 0.875rem;
  color: var(--ds-color-text-primary);
  font-weight: 500;
}

.standings__num--muted {
  color: var(--ds-color-text-tertiary);
  font-weight: 400;
}

.standings__goals {
  text-align: right;
  font-size: 0.875rem;
  color: var(--ds-color-text-primary);
  font-weight: 500;
  min-width: 48px;
  letter-spacing: 0.01em;
}

.standings__diff {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--ds-color-bg-subtle);
  color: var(--ds-color-text-tertiary);
  text-align: center;
  min-width: 40px;
  letter-spacing: 0.01em;
}

.standings__diff--pos {
  background: var(--ds-color-success-light);
  color: var(--ds-color-success);
}

.standings__diff--neg {
  background: var(--ds-color-error-light);
  color: var(--ds-color-error);
}

.standings__points {
  text-align: center;
  font-size: 0.9375rem;
  font-weight: 700;
  color: var(--ds-color-text-primary);
  font-variant-numeric: tabular-nums;
  min-width: 24px;
}

/* Leaderboards */
.leaderboard {
  background: var(--ds-color-bg-elevated);
  border: var(--ds-border-width) solid var(--ds-color-border);
  border-radius: var(--ds-radius-lg);
  overflow: hidden;
}

.leaderboard__row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--ds-color-border-light);
}

.leaderboard__row:last-child {
  border-bottom: 0;
}

.leaderboard__rank {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--ds-color-text-tertiary);
  width: 18px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.leaderboard__name {
  flex: 1;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--ds-color-text-primary);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.leaderboard__count {
  font-size: 0.8125rem;
  color: var(--ds-color-text-secondary);
  font-variant-numeric: tabular-nums;
}

.leaderboard__tag {
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  letter-spacing: 0.02em;
}

.leaderboard__tag--gronn {
  background: var(--ds-color-success-light);
  color: var(--ds-color-success);
}

.leaderboard__tag--rod {
  background: var(--ds-color-error-light);
  color: var(--ds-color-error);
}

.leaderboard__tag--hvit {
  background: var(--ds-color-bg-subtle);
  color: var(--ds-color-text-tertiary);
  border: 1px solid var(--ds-color-border-light);
}

@media (max-width: 400px) {
  .standings__header,
  .standings__row {
    padding-left: 10px;
    padding-right: 10px;
    gap: 4px;
    grid-template-columns: 1fr 22px 22px 22px 22px auto auto auto;
  }
  .standings__goals {
    font-size: 0.8125rem;
    min-width: 40px;
  }
  .standings__diff {
    min-width: 32px;
    padding: 2px 5px;
    font-size: 0.6875rem;
  }
  .standings__points {
    font-size: 0.875rem;
    min-width: 20px;
  }
}
</style>
