<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePlayers } from '../composables/usePlayers'
import { usePlayerSeasonTeams } from '../composables/usePlayerSeasonTeams'
import { usePlayerStats } from '../composables/usePlayerStats'
import { useSeasons } from '../composables/useSeasons'
import { useSeasonTeams } from '../composables/useSeasonTeams'
import { useToast } from '../composables/useToast'
import { POSITIONS, playerPositions, positionLabel } from '../lib/playerPositions'
import { shortRelativeDate } from '../lib/dateLabels'
import Sheet from '../components/Sheet.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import SeasonPicker from '../components/SeasonPicker.vue'

const route = useRoute()
const router = useRouter()
const { players, fetchPlayers, updatePlayer, deletePlayer } = usePlayers()
const { fetchPlayerSeasonTeams, teamForSeason, isLoanEligible, setLoanEligible, playerSeasonTeams } = usePlayerSeasonTeams()
const { ensurePlayerStats, statsFor, matchesFor } = usePlayerStats()
const { seasons, viewingSeason, fetchSeasons } = useSeasons()
const { seasonTeams } = useSeasonTeams()
const { show: showToast } = useToast()

const ready = ref(false)
const player = computed(() => players.value.find(p => p.id === route.params.id) || null)
const seasonId = computed(() => viewingSeason.value?.id ?? null)

onMounted(async () => {
  await Promise.all([fetchPlayers(), fetchPlayerSeasonTeams(), fetchSeasons()])
  await ensurePlayerStats()
  ready.value = true
})

// Kampene hentes per sesong. Uten denne sto tallene fast på sesongen siden ble
// åpnet i, og sesongvelgeren gjorde ingenting synlig.
watch(viewingSeason, async (s) => {
  if (s) await ensurePlayerStats()
})

const stats = computed(() => statsFor(route.params.id))
const positions = computed(() => playerPositions(player.value))
const teamNow = computed(() => {
  const slug = teamForSeason(player.value, seasonId.value)
  return seasonTeams.value.find(t => t.slug === slug) || null
})

// Spilletid finnes bare for kamper som faktisk ble kjørt i kampmodus. Uten den
// nyansen leser «0 min» som en benket unge, og det er en løgn vi ikke vil ha
// på en skjerm om et navngitt barn.
const hasTimed = computed(() => stats.value.timedGames > 0)

function mins(sec) {
  return Math.round((sec || 0) / 60)
}

// Lagrekka gjennom sesongene — kun sesonger der spilleren faktisk har en rad.
const teamHistory = computed(() => {
  if (!player.value) return []
  return seasons.value
    .map(s => {
      const row = playerSeasonTeams.value.find(
        r => r.player_id === player.value.id && r.season_id === s.id)
      if (!row?.team) return null
      const team = seasonTeams.value.find(t => t.slug === row.team)
      return { id: s.id, season: s.name, team: team?.name || row.team, accent: team?.accent || 'paper' }
    })
    .filter(Boolean)
})

const recentMatches = computed(() => matchesFor(route.params.id).slice(0, 5))

// ── Redigering ───────────────────────────────────────────────────────────────
const editing = ref(false)
const editName = ref('')
const editTeam = ref('')
const editPositions = ref([])
const editLoan = ref(false)
const toDelete = ref(false)
const saving = ref(false)

const TEAM_OPTIONS = computed(() =>
  [{ value: '', label: 'Ingen' }, ...seasonTeams.value.map(t => ({ value: t.slug, label: t.name }))])

function openEdit() {
  if (!player.value) return
  editName.value = player.value.name
  editTeam.value = player.value.primary_team || ''
  editPositions.value = [...positions.value]
  editLoan.value = isLoanEligible(player.value, seasonId.value)
  editing.value = true
}
function togglePosition(value) {
  const i = editPositions.value.indexOf(value)
  if (i > -1) editPositions.value.splice(i, 1)
  else editPositions.value.push(value)
}
async function save() {
  const name = editName.value.trim()
  if (!name || !player.value || saving.value) return
  saving.value = true
  try {
    // Dobbeltskriving i overgangen: player_season_teams er den varige raden,
    // players.loan_eligible holdes i sync til kolonnen droppes.
    await updatePlayer(player.value.id, {
      name, primary_team: editTeam.value, loan_eligible: editLoan.value, positions: editPositions.value
    })
    await setLoanEligible(player.value.id, seasonId.value, editLoan.value, editTeam.value)
    editing.value = false
    showToast('Spiller oppdatert', 'success')
  } finally {
    saving.value = false
  }
}
async function confirmDelete() {
  if (!player.value) return
  const name = player.value.name
  await deletePlayer(player.value.id)
  toDelete.value = false
  showToast(`${name} slettet`, 'success')
  router.replace('/serie/tropp')
}
</script>

<template>
  <div class="desktop-container">
    <div class="sp__nav">
      <router-link to="/serie/tropp" class="sp__back">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Tropp
      </router-link>
    </div>

    <div v-if="!ready" class="sp__muted">Henter spiller …</div>
    <div v-else-if="!player" class="sp__muted">Fant ikke spilleren.</div>

    <template v-else>
      <header class="sp__head">
        <span class="sp__avatar" :data-team="player.primary_team || 'none'">{{ player.name.charAt(0).toUpperCase() }}</span>
        <div class="sp__id">
          <h1 class="sp__name">{{ player.name }}</h1>
          <p class="sp__sub">
            <span v-if="teamNow">{{ teamNow.name }}</span>
            <span v-else>Ikke på et lag</span>
            <span v-if="isLoanEligible(player, seasonId)" class="sp__star" title="Egnet som lånespiller">★</span>
          </p>
        </div>
        <button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" @click="openEdit">Rediger</button>
      </header>

      <section class="sp__section">
        <h2 class="ds-section-label sp__h2">Posisjoner</h2>
        <div v-if="positions.length" class="sp__tags">
          <span v-for="v in positions" :key="v" class="sp__tag">{{ positionLabel(v) }}</span>
        </div>
        <p v-else class="sp__muted">Ingen posisjoner satt — spilleren foreslås ikke noe sted i kampmodus.</p>
      </section>

      <!-- Sesongvelger, ikke bare en overskrift: tallene er sesongscopet, og
           ved sesongstart står alt på null. Uten velgeren fantes det ingen vei
           til fjorårets tall herfra. -->
      <section class="sp__section">
        <div class="sp__seasonrow">
          <h2 class="ds-section-label sp__h2">Sesong</h2>
          <SeasonPicker />
        </div>
        <div class="sp__stats">
          <div class="sp__stat">
            <span class="sp__statnum">{{ stats.games }}</span>
            <span class="sp__statlabel">kamper</span>
          </div>
          <div class="sp__stat">
            <span class="sp__statnum">{{ stats.goals }}</span>
            <span class="sp__statlabel">mål</span>
          </div>
          <div v-if="stats.extra" class="sp__stat">
            <span class="sp__statnum">{{ stats.extra }}</span>
            <span class="sp__statlabel">som lånespiller</span>
          </div>
        </div>
      </section>

      <section class="sp__section">
        <h2 class="ds-section-label sp__h2">Spilletid</h2>
        <div v-if="hasTimed" class="sp__stats">
          <div class="sp__stat">
            <span class="sp__statnum">{{ mins(stats.totalSec) }}</span>
            <span class="sp__statlabel">min totalt</span>
          </div>
          <div class="sp__stat">
            <span class="sp__statnum">{{ mins(stats.avgSec) }}</span>
            <span class="sp__statlabel">min i snitt</span>
          </div>
          <div v-if="stats.keeperSec" class="sp__stat">
            <span class="sp__statnum">{{ mins(stats.keeperSec) }}</span>
            <span class="sp__statlabel">min i mål</span>
          </div>
        </div>
        <p v-else class="sp__muted">
          Ingen kamper kjørt i kampmodus ennå. Spilletid registreres bare når klokka går.
        </p>
        <p v-if="hasTimed" class="sp__note">Fra {{ stats.timedGames }} av {{ stats.games }} kamper — kun de som ble kjørt i kampmodus.</p>
      </section>

      <section v-if="recentMatches.length" class="sp__section">
        <h2 class="ds-section-label sp__h2">Siste kamper</h2>
        <ul class="sp__matches">
          <li v-for="m in recentMatches" :key="m.id">
            <router-link :to="`/kamp/${m.id}`" class="sp__match">
              <span class="sp__matchname">{{ m.home_team }} – {{ m.away_team }}</span>
              <span class="sp__matchdate">{{ shortRelativeDate(m.match_date) }}</span>
            </router-link>
          </li>
        </ul>
      </section>

      <section v-if="teamHistory.length > 1" class="sp__section">
        <h2 class="ds-section-label sp__h2">Lag gjennom sesongene</h2>
        <ul class="sp__history">
          <li v-for="h in teamHistory" :key="h.id" class="sp__histrow">
            <span class="sp__histseason">{{ h.season }}</span>
            <span class="sp__histteam" :data-accent="h.accent">{{ h.team }}</span>
          </li>
        </ul>
      </section>
    </template>

    <Sheet :show="editing" title="Rediger spiller" @close="editing = false">
      <div class="ds-form-group">
        <label class="ds-label">Navn</label>
        <input v-model="editName" class="ds-input" placeholder="Navn" @keydown.enter="save" />
      </div>
      <div class="ds-form-group">
        <label class="ds-label ds-label--optional">Lag</label>
        <select v-model="editTeam" class="ds-input">
          <option v-for="opt in TEAM_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
      </div>
      <div class="ds-form-group">
        <label class="ds-label ds-label--optional">Posisjoner</label>
        <div class="poschips">
          <button
            v-for="o in POSITIONS"
            :key="o.value"
            type="button"
            class="poschip"
            :class="{ 'poschip--on': editPositions.includes(o.value) }"
            @click="togglePosition(o.value)"
          >{{ o.label }}</button>
        </div>
        <p class="poschips__hint">Sorterer forslagene i kampmodus</p>
      </div>
      <button
        type="button"
        class="loan-toggle"
        :class="{ 'loan-toggle--on': editLoan }"
        @click="editLoan = !editLoan"
      >
        <span class="loan-toggle__star">★</span>
        <span class="loan-toggle__title">Egnet som lånespiller</span>
        <span class="loan-toggle__switch" :class="{ 'loan-toggle__switch--on': editLoan }"></span>
      </button>
      <div class="sheet-actions sheet-actions--with-delete">
        <button class="sheet-actions__delete" aria-label="Slett spiller" @click="toDelete = true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
        </button>
        <button class="ds-btn ds-btn--secondary" @click="editing = false">Avbryt</button>
        <button class="ds-btn ds-btn--primary" :disabled="!editName.trim() || saving" @click="save">Lagre</button>
      </div>
    </Sheet>

    <ConfirmDialog
      :show="toDelete"
      title="Slett spiller?"
      :message="`Er du sikker på at du vil slette ${player?.name}? Tilknytninger til kamper fjernes også.`"
      confirm-label="Slett"
      variant="warning"
      @confirm="confirmDelete"
      @cancel="toDelete = false"
    />
  </div>
</template>

<style scoped>
.sp__muted { color: var(--ds-color-text-tertiary); font-size: var(--ds-text-sm); padding: var(--ds-space-sm) var(--ds-space-lg); }

.sp__nav { padding: var(--ds-space-md) var(--ds-space-lg) 0; }
.sp__back {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: var(--ds-text-sm); font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-tertiary); text-decoration: none;
}
.sp__back svg { width: 16px; height: 16px; }

.sp__head {
  display: flex; align-items: center; gap: var(--ds-space-md);
  padding: var(--ds-space-md) var(--ds-space-lg) var(--ds-space-lg);
}
.sp__avatar {
  flex: none; width: 52px; height: 52px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: var(--ds-text-lg); font-weight: var(--ds-weight-semibold);
  background: var(--ds-color-bg-elevated); color: var(--ds-color-text-secondary);
  border: 1.5px solid var(--ds-color-border);
}
.sp__avatar[data-team="gronn"] { border-color: var(--ds-color-team-gronn, #2E7D52); }
.sp__avatar[data-team="rod"] { border-color: var(--ds-color-team-rod, #B4453C); }
.sp__avatar[data-team="hvit"] { border-color: var(--ds-color-border-strong); }
.sp__id { flex: 1; min-width: 0; }
.sp__name { margin: 0; font-size: var(--ds-text-xl); font-weight: var(--ds-weight-semibold); }
.sp__sub {
  margin: 2px 0 0; display: flex; align-items: center; gap: 5px;
  font-size: var(--ds-text-sm); color: var(--ds-color-text-tertiary);
}
.sp__star { color: var(--ds-color-warning); }

.sp__section { padding: 0 var(--ds-space-lg) var(--ds-space-xl); }
/* Utseendet kommer fra .ds-section-label; her bare marginen i denne siden. */
.sp__h2 { margin: 0 0 var(--ds-space-sm); }
.sp__section .sp__muted { padding: 0; }
.sp__seasonrow {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: var(--ds-space-md); margin-bottom: var(--ds-space-sm);
}
.sp__seasonrow .sp__h2 { margin: 0; }

.sp__tags { display: flex; flex-wrap: wrap; gap: var(--ds-space-sm); }
.sp__tag {
  padding: 7px 13px; border-radius: var(--ds-radius-full);
  border: 1.5px solid var(--ds-color-border); background: var(--ds-color-bg-elevated);
  font-size: var(--ds-text-sm); font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-secondary);
}

.sp__stats { display: flex; flex-wrap: wrap; gap: var(--ds-space-md); }
.sp__stat {
  flex: 1 1 0; min-width: 88px;
  display: flex; flex-direction: column; gap: 2px;
  padding: var(--ds-space-md);
  border: 1.5px solid var(--ds-color-border); border-radius: var(--ds-radius-md);
  background: var(--ds-color-bg-elevated);
}
.sp__statnum { font-size: var(--ds-text-xl); font-weight: var(--ds-weight-semibold); line-height: 1.1; }
.sp__statlabel { font-size: var(--ds-text-xs); color: var(--ds-color-text-tertiary); }
.sp__note { margin: var(--ds-space-sm) 0 0; font-size: var(--ds-text-xs); color: var(--ds-color-text-tertiary); }

.sp__matches, .sp__history { list-style: none; margin: 0; padding: 0; }
.sp__match {
  display: flex; align-items: center; justify-content: space-between; gap: var(--ds-space-md);
  padding: 11px 0; text-decoration: none; color: inherit;
  border-bottom: 1px solid var(--ds-color-border);
}
.sp__matchname {
  font-size: var(--ds-text-sm); font-weight: var(--ds-weight-medium);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;
}
.sp__matchdate { flex: none; font-size: var(--ds-text-xs); color: var(--ds-color-text-tertiary); }
.sp__matches li:last-child .sp__match { border-bottom: 0; }

.sp__histrow {
  display: flex; align-items: center; justify-content: space-between; gap: var(--ds-space-md);
  padding: 9px 0; border-bottom: 1px solid var(--ds-color-border);
  font-size: var(--ds-text-sm);
}
.sp__histrow:last-child { border-bottom: 0; }
.sp__histseason { color: var(--ds-color-text-secondary); }
.sp__histteam { color: var(--ds-color-text-tertiary); }

/* Samme velger som i troppen — to kolonner, femte valg i full bredde. */
.poschips { display: grid; grid-template-columns: 1fr 1fr; gap: var(--ds-space-sm); }
.poschips .poschip:last-child:nth-child(odd) { grid-column: 1 / -1; }
.poschip {
  padding: 11px 14px; cursor: pointer;
  font-size: var(--ds-text-sm); font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-secondary);
  border: 1.5px solid var(--ds-color-border); border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-elevated);
  transition: border-color .15s ease, background .15s ease, color .15s ease;
  -webkit-tap-highlight-color: transparent;
}
.poschip--on {
  border-color: var(--ds-color-accent);
  background: var(--ds-color-accent);
  color: var(--ds-color-accent-text);
}
.poschips__hint { margin: var(--ds-space-sm) 0 0; font-size: var(--ds-text-xs); color: var(--ds-color-text-tertiary); }

.loan-toggle {
  display: flex; align-items: center; gap: var(--ds-space-md);
  width: 100%; text-align: left; cursor: pointer;
  padding: var(--ds-space-md); margin-top: var(--ds-space-xs);
  border: 1.5px solid var(--ds-color-border); border-radius: var(--ds-radius-md);
  background: var(--ds-color-bg-elevated); transition: border-color .15s ease;
  -webkit-tap-highlight-color: transparent;
}
.loan-toggle--on { border-color: var(--ds-color-warning); }
.loan-toggle__star { font-size: 18px; color: var(--ds-color-border-strong); flex: none; }
.loan-toggle--on .loan-toggle__star { color: var(--ds-color-warning); }
.loan-toggle__title {
  flex: 1; min-width: 0;
  font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-primary); font-size: var(--ds-text-sm);
}
.loan-toggle__switch {
  flex: none; width: 40px; height: 24px; border-radius: var(--ds-radius-full);
  background: var(--ds-color-border); position: relative; transition: background .15s ease;
}
.loan-toggle__switch::after {
  content: ''; position: absolute; top: 2px; left: 2px;
  width: 20px; height: 20px; border-radius: 50%; background: #fff;
  transition: transform .15s ease; box-shadow: var(--ds-shadow-xs);
}
.loan-toggle__switch--on { background: var(--ds-color-warning); }
.loan-toggle__switch--on::after { transform: translateX(16px); }
</style>
