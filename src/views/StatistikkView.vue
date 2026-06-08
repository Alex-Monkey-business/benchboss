<script setup>
import { ref, computed, onMounted } from 'vue'
import { useSeasons } from '../composables/useSeasons'
import { useMatches } from '../composables/useMatches'
import { useCoaches } from '../composables/useCoaches'
import { useReferees } from '../composables/useReferees'
import { usePlayers } from '../composables/usePlayers'
import { useMatchGoals } from '../composables/useMatchGoals'
import { useMatchMode } from '../composables/useMatchMode'
import AnimatedNumber from '../components/AnimatedNumber.vue'
import Skeleton from '../components/Skeleton.vue'
import FormCurve from '../components/FormCurve.vue'
import { hasResult, isPlayed } from '../lib/matchMeta'

const { activeSeason, fetchSeasons } = useSeasons()
const { matches, matchCoaches, matchPlayers, fetchMatches } = useMatches()
const { coaches, fetchCoaches } = useCoaches()
const { referees, fetchReferees } = useReferees()
const { players, fetchPlayers } = usePlayers()
const { goals: allGoals, fetchAllGoals } = useMatchGoals()
const { stints, fetchAllStints } = useMatchMode()

// Skeleton only on the very first load. Data persists across navigation.
const loading = ref(matches.value.length === 0)

onMounted(async () => {
  await Promise.all([fetchSeasons(), fetchCoaches(), fetchReferees(), fetchPlayers(), fetchAllGoals(), fetchAllStints()])
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

const halsenMatches = computed(() => matches.value.filter(m =>
  isHalsenTeam(m.home_team) || isHalsenTeam(m.away_team)
))

// Spilte kamper (tid-basert) — grunnlag for deltakelse. Resultat-avhengig
// statistikk (tabell/mål) gates i tillegg på hasResult().
const playedMatches = computed(() => halsenMatches.value.filter(isPlayed))
const playedMatchIds = computed(() => new Set(playedMatches.value.map(m => m.id)))

// Kommende (ikke spilte) kamper — for å vise hvor booket en lånespiller alt er.
const upcomingMatchIds = computed(() => new Set(
  halsenMatches.value.filter(m => !isPlayed(m)).map(m => m.id)
))

// Spilte kamper som mangler resultat — vises som varsel øverst.
const missingResultCount = computed(() =>
  playedMatches.value.filter(m => !hasResult(m)).length
)

// Halsen totalt: ekskluder internkamper (Halsen vs Halsen) for å unngå
// dobbel-telling — de bidrar bare til per-lag-statistikk.
const halsenTotal = computed(() => {
  let played = 0, w = 0, d = 0, l = 0, gf = 0, ga = 0
  playedMatches.value.forEach(m => {
    const home = isHalsenTeam(m.home_team)
    const away = isHalsenTeam(m.away_team)
    if (home && away) return // internkamp
    played++
    if (!hasResult(m)) return // spilt, men resultat ikke lagt inn enda
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
    if (!hasResult(m)) return // spilt, men resultat ikke lagt inn enda
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
    .filter(hasResult)
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
    .filter(hasResult)
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
    if (!playedMatchIds.value.has(mc.match_id)) return
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
  playedMatches.value.forEach(m => {
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
  const upcoming = {}
  matchPlayers.value.forEach(mp => {
    if (playedMatchIds.value.has(mp.match_id)) {
      counts[mp.player_id] = (counts[mp.player_id] || 0) + 1
    } else if (upcomingMatchIds.value.has(mp.match_id)) {
      upcoming[mp.player_id] = (upcoming[mp.player_id] || 0) + 1
    }
  })
  return players.value
    .map(p => ({
      id: p.id, name: p.name, primary_team: p.primary_team,
      count: counts[p.id] || 0,
      upcoming: upcoming[p.id] || 0
    }))
    .filter(p => p.count > 0 || p.upcoming > 0)
    .sort((a, b) => b.count - a.count || b.upcoming - a.upcoming || a.name.localeCompare(b.name))
})

// Toppscorere — kun mål registrert i denne sesongens kamper
const topScorers = computed(() => {
  const counts = {}
  allGoals.value.forEach(g => {
    if (!playedMatchIds.value.has(g.match_id)) return
    counts[g.player_id] = (counts[g.player_id] || 0) + 1
  })
  return players.value
    .map(p => ({ id: p.id, name: p.name, primary_team: p.primary_team, count: counts[p.id] || 0 }))
    .filter(p => p.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
})

// Spilletid — akkumulert per spiller over sesongens kamper (fra match mode).
// Summerer kun lukkede stints; pågående kamp (åpne stints) telles ikke ennå.
const playtimeAsc = ref(false)
const playtimeStats = computed(() => {
  const seasonIds = new Set(matches.value.map(m => m.id))
  const fieldSec = {}, keeperSec = {}, gamesByPlayer = {}
  stints.value.forEach(s => {
    if (!seasonIds.has(s.match_id)) return
    if (s.off_clock == null) return
    const dur = Math.max(0, s.off_clock - s.on_clock)
    if (s.role === 'keeper') keeperSec[s.player_id] = (keeperSec[s.player_id] || 0) + dur
    else fieldSec[s.player_id] = (fieldSec[s.player_id] || 0) + dur
    ;(gamesByPlayer[s.player_id] || (gamesByPlayer[s.player_id] = new Set())).add(s.match_id)
  })
  const rows = players.value
    .map(p => {
      const f = fieldSec[p.id] || 0
      const k = keeperSec[p.id] || 0
      const total = f + k
      const games = gamesByPlayer[p.id]?.size || 0
      return {
        id: p.id, name: p.name, primary_team: p.primary_team,
        fieldSec: f, keeperSec: k, totalSec: total, games,
        avgSec: games ? Math.round(total / games) : 0
      }
    })
    .filter(p => p.totalSec > 0)
  return rows.sort((a, b) =>
    (playtimeAsc.value ? a.totalSec - b.totalSec : b.totalSec - a.totalSec) ||
    a.name.localeCompare(b.name)
  )
})

function fmtMinSec(sec) {
  const s = Math.max(0, Math.round(sec || 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const hasPlayedMatches = computed(() => playedMatches.value.length > 0)
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
    <!-- Varsel: spilte kamper uten resultat -->
    <div v-if="missingResultCount > 0" class="px-lg">
      <div class="missing-result-note">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9"/>
          <line x1="12" y1="8" x2="12" y2="12.5"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        {{ missingResultCount }} spilt{{ missingResultCount === 1 ? ' kamp' : 'e kamper' }} mangler resultat
      </div>
    </div>

    <!-- Halsen totalt -->
    <div class="px-lg mb-lg ds-anim-fade-up ds-anim-delay-1">
      <div class="stat-section-label">Halsen totalt</div>
      <div class="stat-card-large">
        <template v-if="hasPlayedMatches">
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
    <div v-if="hasPlayedMatches" class="px-lg mb-lg ds-anim-fade-up ds-anim-delay-2">
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

    <!-- Toppscorere — vises alltid (med empty state) for å gjøre feature synlig -->
    <div class="px-lg mb-lg ds-anim-fade-up ds-anim-delay-3">
      <div class="stat-section-label">Toppscorere</div>
      <div v-if="topScorers.length === 0" class="leaderboard-empty">
        Ingen mål registrert ennå. Legg til scorere på en kamp under «Resultat & referat».
      </div>
      <div v-else class="leaderboard ds-anim-stagger-list">
        <div v-for="(item, i) in topScorers" :key="item.id" class="leaderboard__row">
          <span class="leaderboard__rank">{{ i + 1 }}</span>
          <span class="leaderboard__name">
            {{ item.name }}
            <span v-if="item.primary_team" :class="['leaderboard__tag', `leaderboard__tag--${item.primary_team}`]">{{ TEAM_LABELS[item.primary_team] }}</span>
          </span>
          <span class="leaderboard__count">{{ item.count }} mål</span>
        </div>
      </div>
    </div>

    <!-- Spilletid — fra match mode -->
    <div v-if="playtimeStats.length > 0" class="px-lg mb-lg ds-anim-fade-up ds-anim-delay-3">
      <div class="stat-section-label playtime-label">
        Spilletid
        <button type="button" class="playtime-sort" @click="playtimeAsc = !playtimeAsc">
          {{ playtimeAsc ? 'Minst først' : 'Mest først' }}
        </button>
      </div>
      <div class="leaderboard ds-anim-stagger-list">
        <div class="leaderboard__head">
          <span class="leaderboard__rank" aria-hidden="true"></span>
          <span class="leaderboard__name"></span>
          <span class="leaderboard__metric leaderboard__metric--head">Snitt</span>
          <span class="leaderboard__metric leaderboard__metric--head">Total</span>
        </div>
        <div v-for="(item, i) in playtimeStats" :key="item.id" class="leaderboard__row">
          <span class="leaderboard__rank">{{ i + 1 }}</span>
          <span class="leaderboard__name">
            {{ item.name }}
            <span v-if="item.primary_team" :class="['leaderboard__tag', `leaderboard__tag--${item.primary_team}`]">{{ TEAM_LABELS[item.primary_team] }}</span>
            <span v-if="item.keeperSec > 0" class="playtime-keeper">keeper {{ fmtMinSec(item.keeperSec) }}</span>
          </span>
          <span class="leaderboard__metric">{{ fmtMinSec(item.avgSec) }}</span>
          <span class="leaderboard__metric leaderboard__metric--total">{{ fmtMinSec(item.totalSec) }}</span>
        </div>
      </div>
    </div>

    <!-- Lånespiller-leaderboard -->
    <div v-if="playerStats.length > 0" class="px-lg mb-lg ds-anim-fade-up ds-anim-delay-3">
      <div class="stat-section-label">Lånespillere</div>
      <div class="leaderboard ds-anim-stagger-list">
        <div class="leaderboard__head">
          <span class="leaderboard__rank" aria-hidden="true"></span>
          <span class="leaderboard__name"></span>
          <span class="leaderboard__metric leaderboard__metric--head">Ekstra</span>
          <span class="leaderboard__metric leaderboard__metric--head">Kommende</span>
        </div>
        <div v-for="(item, i) in playerStats" :key="item.id" class="leaderboard__row">
          <span class="leaderboard__rank">{{ i + 1 }}</span>
          <span class="leaderboard__name">
            {{ item.name }}
            <span v-if="item.primary_team" :class="['leaderboard__tag', `leaderboard__tag--${item.primary_team}`]">{{ TEAM_LABELS[item.primary_team] }}</span>
          </span>
          <span class="leaderboard__metric">{{ item.count || '–' }}</span>
          <span class="leaderboard__metric leaderboard__metric--upcoming">{{ item.upcoming || '–' }}</span>
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
.playtime-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.playtime-sort {
  border: none;
  background: transparent;
  color: var(--ds-color-accent);
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  cursor: pointer;
  text-transform: none;
  letter-spacing: 0;
}
.playtime-keeper {
  display: inline-block;
  margin-left: 6px;
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-warning);
}
.leaderboard__metric--total {
  font-variant-numeric: tabular-nums;
  font-weight: var(--ds-weight-bold);
  color: var(--ds-color-text-primary);
}

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

.missing-result-note {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: var(--ds-space-lg);
  padding: 10px 14px;
  border-radius: var(--ds-radius-md);
  background: var(--ds-color-warm-bg);
  color: var(--ds-color-warm-text);
  border: 1px solid var(--ds-color-warm, transparent);
  font-size: 0.8125rem;
  font-weight: 500;
}

.missing-result-note svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
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
  border-radius: var(--ds-radius-full);
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
  background: var(--ds-team-gronn);
}

.standings__dot--rod {
  background: var(--ds-team-rod);
}

.standings__dot--hvit {
  background: var(--ds-team-hvit-bg);
  border: 1px solid var(--ds-team-hvit-border);
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
  border-radius: var(--ds-radius-full);
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

.leaderboard-empty {
  padding: 14px 16px;
  font-size: 0.8125rem;
  color: var(--ds-color-text-tertiary);
  background: var(--ds-color-bg-elevated);
  border: 1px dashed var(--ds-color-border);
  border-radius: var(--ds-radius-lg);
  line-height: 1.4;
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
  white-space: nowrap;
}

/* Aligned numeric columns for lånespiller-leaderboardet */
.leaderboard__head {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--ds-color-border-light);
}

.leaderboard__metric {
  width: 64px;
  flex-shrink: 0;
  text-align: right;
  font-size: 0.8125rem;
  color: var(--ds-color-text-secondary);
  font-variant-numeric: tabular-nums;
}

.leaderboard__metric--upcoming {
  color: var(--ds-color-text-tertiary);
}

.leaderboard__metric--head {
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ds-color-text-tertiary);
}

.leaderboard__tag {
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  letter-spacing: 0.02em;
}

.leaderboard__tag--gronn {
  background: var(--ds-team-gronn-bg);
  color: var(--ds-team-gronn);
}

.leaderboard__tag--rod {
  background: var(--ds-team-rod-bg);
  color: var(--ds-team-rod);
}

.leaderboard__tag--hvit {
  background: var(--ds-team-hvit-bg);
  color: var(--ds-team-hvit);
  border: 1px solid var(--ds-team-hvit-border);
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
