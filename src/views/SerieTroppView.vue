<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAuth } from '../stores/auth'
import { useSeasons } from '../composables/useSeasons'
import { usePlayers } from '../composables/usePlayers'
import { usePlayerSeasonTeams } from '../composables/usePlayerSeasonTeams'
import { useToast } from '../composables/useToast'
import { useSeasonTeams } from '../composables/useSeasonTeams'
import { useCoaches } from '../composables/useCoaches'
import { playerPositions } from '../lib/playerPositions'
import Sheet from '../components/Sheet.vue'

const { isParent } = useAuth()
const { activeSeason, fetchSeasons } = useSeasons()
const { players, fetchPlayers, addPlayer, updatePlayer } = usePlayers()
const { fetchPlayerSeasonTeams, isLoanEligible } = usePlayerSeasonTeams()
const { seasonTeams } = useSeasonTeams()
const { coaches, fetchCoaches } = useCoaches()
const { show: showToast } = useToast()

const canEdit = computed(() => !isParent.value)
const ready = ref(false)
const editing = ref(false)
const seasonId = computed(() => activeSeason.value?.id ?? null)

const TEAM_OPTIONS = computed(() =>
  [{ value: '', label: 'Ingen' }, ...seasonTeams.value.map(t => ({ value: t.slug, label: t.name }))])

onMounted(async () => {
  await Promise.all([fetchSeasons(), fetchPlayers(), fetchPlayerSeasonTeams(), fetchCoaches()])
  ready.value = true
})

// Trenernavnet på lagkortet blir en lenke til trenerprofilen — samme grep som
// spiller-chipsene, samme `canEdit`-lås.
//
// `t.trainers` er NAVN, ikke id-er, og skal forbli det: både
// defaultCoachIdsForMatch og useToday.teamByName slår opp på navn. Oppslaget
// gjøres her i stedet. Står vi på den statiske SEASON_TEAMS-fallbacken finnes
// ingen trenerrad, og da blir navnet stående som tekst.
function coachId(name) {
  return coaches.value.find(c => c.name === name)?.id || null
}

const byName = (a, b) => a.name.localeCompare(b.name, 'no')

// Serielag = players.primary_team. Ingen egen tabell — spilleren bærer laget sitt.
function teamPlayers(slug) {
  return players.value.filter(p => p.primary_team === slug).sort(byName)
}
const unplaced = computed(() =>
  [...players.value].filter(p => !p.primary_team).sort(byName))
// Lånespiller-status er trenerinformasjon. Foreldre ser hverken stjerner eller
// forklaringen på hva de betyr.
const eligible = p => canEdit.value && isLoanEligible(p, seasonId.value)
const hasEligible = computed(() => players.value.some(eligible))

// Posisjonene styrer forslagene i kampmodus. Antallet uten er det eneste
// signalet som trengs for å se om jobben er gjort — vises kun i rediger-modus.
const missingPositions = computed(() =>
  players.value.filter(p => !playerPositions(p).length).length)

// Hurtig lag-bytte (chip-prikkene / ×)
async function assign(playerId, team) {
  await updatePlayer(playerId, { primary_team: team })
}
async function remove(playerId) {
  await updatePlayer(playerId, { primary_team: null })
}

// Ny spiller
const showAdd = ref(false)
const newName = ref('')
const newTeam = ref('')
function openAdd() {
  newName.value = ''
  newTeam.value = ''
  showAdd.value = true
}
async function handleAdd() {
  const name = newName.value.trim()
  if (!name) return
  await addPlayer(name, newTeam.value)
  showToast(`${name} lagt til`, 'success')
  showAdd.value = false
}

</script>

<template>
  <div class="desktop-container">
    <div class="page-header">
      <h1 class="page-header__title">Tropp</h1>
      <p class="page-header__subtitle">{{ activeSeason?.name || 'Serie' }}</p>
    </div>

    <div class="px-lg">
      <div v-if="canEdit && (!ready || players.length)" class="tropp-actions">
        <button v-if="editing" type="button" class="add-link" @click="openAdd">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Ny spiller
        </button>
        <span v-else class="tropp-hint">{{ unplaced.length }} ikke plassert</span>
        <button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" @click="editing = !editing">
          {{ editing ? 'Ferdig' : 'Rediger tropp' }}
        </button>
      </div>

      <div v-if="!ready" class="cmd-muted">Henter tropp …</div>

      <div v-else-if="canEdit && players.length === 0" class="ds-empty">
        <img src="/illustrations/bench-boss-state-icons/512/empty-squad-transparent.png" alt="" class="ds-empty__illo" />
        <h3 class="ds-empty__title">Ingen spillere ennå</h3>
        <p class="ds-empty__description">Legg inn spillerne i kullet, så kan du fordele dem på lag og sette posisjoner.</p>
        <button type="button" class="ds-btn ds-btn--primary ds-empty__action" @click="openAdd">Ny spiller</button>
      </div>

      <!-- Samme layout i lese- og edit-modus: lag-kort med chips -->
      <template v-else>
        <div v-if="canEdit && (hasEligible || missingPositions)" class="legends">
          <p v-if="hasEligible" class="star-legend"><span class="chip__star">★</span> = egnet som lånespiller</p>
          <p v-if="missingPositions" class="star-legend">{{ missingPositions }} uten posisjon</p>
        </div>

        <section v-for="t in seasonTeams" :key="t.slug" class="teamcard" :data-accent="t.accent">
          <header class="teamcard__head">
            <span class="teamcard__dot"></span>
            <span class="teamcard__name">{{ t.name }}</span>
            <span class="teamcard__count">{{ teamPlayers(t.slug).length }}</span>
          </header>
          <p v-if="t.trainers?.length" class="teamcard__trainers">
            <span>Trenere: </span>
            <template v-for="(n, i) in t.trainers" :key="n">
              <span v-if="i > 0">, </span>
              <router-link v-if="canEdit && coachId(n)" :to="`/trener/${coachId(n)}`" class="teamcard__trainer">{{ n }}</router-link>
              <template v-else>{{ n }}</template>
            </template>
          </p>
          <p v-if="teamPlayers(t.slug).length === 0" class="teamcard__empty">Ingen spillere lagt til ennå.</p>
          <div v-else class="roster">
            <span v-for="p in teamPlayers(t.slug)" :key="p.id" class="chip chip--team">
              <router-link v-if="canEdit" :to="`/spiller/${p.id}`" class="chip__name">{{ p.name }}</router-link>
              <template v-else>{{ p.name }}</template>
              <span v-if="eligible(p)" class="chip__star" title="Egnet som lånespiller">★</span>
              <button v-if="editing" type="button" class="chip__x" :aria-label="`Ta ${p.name} av laget`" @click="remove(p.id)">×</button>
            </span>
          </div>
        </section>

        <section v-if="canEdit && unplaced.length" class="teamcard teamcard--muted">
          <header class="teamcard__head">
            <span class="teamcard__name">Ikke plassert</span>
            <span class="teamcard__count">{{ unplaced.length }}</span>
          </header>
          <div class="roster">
            <span v-for="p in unplaced" :key="p.id" class="chip chip--muted">
              <router-link v-if="canEdit" :to="`/spiller/${p.id}`" class="chip__name">{{ p.name }}</router-link>
              <template v-else>{{ p.name }}</template>
              <span v-if="eligible(p)" class="chip__star" title="Egnet som lånespiller">★</span>
              <span v-if="editing" class="chip__assign">
                <button
                  v-for="t in seasonTeams"
                  :key="t.slug"
                  type="button"
                  class="chip__dot"
                  :data-accent="t.accent"
                  :aria-label="`Sett ${p.name} på ${t.name}`"
                  :title="t.name"
                  @click="assign(p.id, t.slug)"
                ></button>
              </span>
            </span>
          </div>
        </section>
      </template>
    </div>

    <Sheet :show="showAdd" title="Ny spiller" @close="showAdd = false">
      <div class="ds-form-group">
        <label class="ds-label">Navn</label>
        <input v-model="newName" class="ds-input" placeholder="Spillerens navn" @keydown.enter="handleAdd" />
      </div>
      <div class="ds-form-group">
        <label class="ds-label ds-label--optional">Lag</label>
        <select v-model="newTeam" class="ds-input">
          <option v-for="opt in TEAM_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
      </div>
      <div class="sheet-actions">
        <button class="ds-btn ds-btn--secondary" @click="showAdd = false">Avbryt</button>
        <button class="ds-btn ds-btn--primary" :disabled="!newName.trim()" @click="handleAdd">Legg til</button>
      </div>
    </Sheet>

  </div>
</template>

<style scoped>
.cmd-muted { color: var(--ds-color-text-tertiary); font-size: var(--ds-text-sm); padding: var(--ds-space-sm) 2px; }

.tropp-actions {
  display: flex; align-items: center; justify-content: space-between; gap: var(--ds-space-md);
  margin-bottom: var(--ds-space-md);
}
.tropp-hint { font-size: var(--ds-text-sm); color: var(--ds-color-text-tertiary); }
.add-link {
  display: inline-flex; align-items: center; gap: 6px;
  background: transparent; border: 0; padding: 0; cursor: pointer;
  color: var(--ds-color-accent);
  font-family: var(--ds-font-body); font-weight: 600; font-size: var(--ds-text-sm);
}
.add-link:hover { text-decoration: underline; }

.edit-hint {
  color: var(--ds-color-text-tertiary); font-size: var(--ds-text-sm);
  margin: 0 0 var(--ds-space-md);
}

/* Tonal accent-palett (delt med treningsplan/login) */
[data-accent="warm"]       { --accent-bg: #F8E8E0; --accent-text: #7A3A24; }
[data-accent="sage"]       { --accent-bg: #E2EDDE; --accent-text: #3D5C44; }
[data-accent="cornflower"] { --accent-bg: #D6DDEF; --accent-text: #3D456B; }
[data-accent="olive"]      { --accent-bg: #F0E7D6; --accent-text: #6B5630; }
[data-accent="sky"]        { --accent-bg: #DDE6EC; --accent-text: #3A4C5C; }
[data-accent="peach"]      { --accent-bg: #F8E8E0; --accent-text: #7A3A24; }
/* Hvit = nøytral papir-chip med stroke (token-basert → følger dark mode) */
[data-accent="paper"] {
  --accent-bg: var(--ds-color-bg-elevated);
  --accent-text: var(--ds-color-text-primary);
  --accent-border: var(--ds-color-border-strong);
}
[data-accent="paper"] .teamcard__dot,
[data-accent="paper"] .chip__dot {
  background: var(--ds-color-bg-elevated);
  border: 1px solid var(--ds-color-border-strong);
  box-shadow: none;
}
:global([data-theme="dark"] [data-accent="warm"]) { --accent-bg: #2A1E18; --accent-text: #F4C4A8; }
:global([data-theme="dark"] [data-accent="sage"]) { --accent-bg: #1A241D; --accent-text: #B5D2B0; }
:global([data-theme="dark"] [data-accent="cornflower"]) { --accent-bg: #1A1F33; --accent-text: #B9C2E5; }
:global([data-theme="dark"] [data-accent="olive"]) { --accent-bg: #2A241A; --accent-text: #D9C99E; }
:global([data-theme="dark"] [data-accent="sky"]) { --accent-bg: #1A222A; --accent-text: #B0C5D8; }
:global([data-theme="dark"] [data-accent="peach"]) { --accent-bg: #2A1E18; --accent-text: #F4C4A8; }

/* Ett kort per lag */
.teamcard {
  margin-top: var(--ds-space-md);
  background: var(--ds-color-bg-elevated);
  border: var(--ds-border-width) solid var(--ds-color-border-light);
  border-radius: var(--ds-radius-lg);
  box-shadow: var(--ds-shadow-xs);
  padding: var(--ds-space-md) var(--ds-space-lg) var(--ds-space-lg);
}
.teamcard:first-of-type { margin-top: 0; }
.teamcard--muted { background: var(--ds-color-bg-subtle); box-shadow: none; }

.teamcard__head {
  display: flex; align-items: center; gap: var(--ds-space-sm);
  margin-bottom: var(--ds-space-md);
}
.teamcard__dot { width: 10px; height: 10px; border-radius: 50%; flex: none; background: var(--accent-text); }
.teamcard__name {
  font-family: var(--ds-font-heading);
  font-size: var(--ds-text-lg);
  font-weight: var(--ds-weight-bold);
  letter-spacing: var(--ds-tracking-tight);
  color: var(--ds-color-text-primary);
}
.teamcard--muted .teamcard__name { color: var(--ds-color-text-tertiary); font-size: var(--ds-text-md); }
.teamcard__count {
  margin-left: auto;
  color: var(--ds-color-text-tertiary);
  font-size: var(--ds-text-sm); font-weight: var(--ds-weight-medium);
}
.teamcard__trainers {
  margin: calc(var(--ds-space-sm) * -1) 0 var(--ds-space-md);
  color: var(--ds-color-text-tertiary); font-size: var(--ds-text-sm);
}
/* Understreket, ikke farget: navnet skal se klikkbart ut uten å konkurrere
   med spillerne under, som er kortets hovedsak. */
.teamcard__trainer {
  color: var(--ds-color-text-secondary);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.teamcard__trainer:hover { color: var(--ds-color-text-primary); }
.teamcard__empty { color: var(--ds-color-text-tertiary); font-size: var(--ds-text-sm); margin: 0; }

.roster { display: flex; flex-wrap: wrap; gap: var(--ds-space-sm); }
.chip {
  display: inline-flex; align-items: center; gap: var(--ds-space-xs);
  padding: 6px var(--ds-space-md);
  border: 1px solid transparent;
  border-radius: var(--ds-radius-full);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-semibold);
}
.chip--team { background: var(--accent-bg); color: var(--accent-text); border-color: var(--accent-border, transparent); }
.chip--muted {
  background: var(--ds-color-bg-subtle); color: var(--ds-color-text-secondary);
  padding-right: 4px;
}
.chip__name {
  background: transparent; border: 0; padding: 0; margin: 0; cursor: pointer;
  font: inherit; color: inherit; letter-spacing: inherit;
}
.chip__name:hover { text-decoration: underline; }

.chip__x {
  display: grid; place-items: center;
  width: 18px; height: 18px; margin: 0 -4px 0 2px; padding: 0;
  border: none; border-radius: 50%;
  background: transparent; color: inherit; opacity: 0.55;
  font-size: 15px; line-height: 1; cursor: pointer;
}
.chip__x:hover { opacity: 1; }

.chip__assign { display: inline-flex; align-items: center; gap: 5px; margin-left: 4px; }
.chip__dot {
  width: 18px; height: 18px; padding: 0; flex: none;
  background: var(--accent-text);
  border: 2px solid var(--ds-color-bg-elevated);
  border-radius: 50%; cursor: pointer;
  box-shadow: 0 0 0 1px var(--ds-color-border-light);
}
.chip__dot:hover { transform: scale(1.15); }

.chip__star { color: var(--ds-color-warning); font-size: 11px; margin: 0 -2px 0 1px; }

/* To forklaringslinjer sto som inline-flex og kolliderte på samme linje uten
   mellomrom: «★ = egnet som lånespiller16 uten posisjon». Beholderen eier nå
   både retningen og luften. */
.legends {
  display: flex; flex-wrap: wrap; column-gap: var(--ds-space-md); row-gap: 4px;
  margin-bottom: var(--ds-space-md);
}
.star-legend {
  display: inline-flex; align-items: center; gap: 5px;
  margin: 0;
  font-size: var(--ds-text-xs); color: var(--ds-color-text-tertiary);
}
.star-legend .chip__star { font-size: 12px; margin: 0; }

/* Sheet-handlinger (ny/rediger spiller) */
.sheet-actions {
  display: flex; align-items: center; justify-content: flex-end;
  gap: 8px; margin-top: var(--ds-space-lg);
}
.sheet-actions--with-delete { justify-content: space-between; }
.sheet-actions__delete {
  display: inline-flex; align-items: center; justify-content: center;
  width: 40px; height: 40px; margin-right: auto;
  border-radius: var(--ds-radius-md);
  background: transparent; border: 1px solid var(--ds-color-border);
  color: var(--ds-color-error); cursor: pointer;
  transition: all 0.15s ease;
}
.sheet-actions__delete:hover {
  background: var(--ds-color-error-light); border-color: var(--ds-color-error);
}
</style>
