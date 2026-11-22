<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePlayers } from '../composables/usePlayers'
import { usePlayerSeasonTeams } from '../composables/usePlayerSeasonTeams'
import { usePlayerStats } from '../composables/usePlayerStats'
import { usePlayerLevels, LEVELS } from '../composables/usePlayerLevels'
import { useSeasons } from '../composables/useSeasons'
import { useSeasonTeams } from '../composables/useSeasonTeams'
import { useToast } from '../composables/useToast'
import { POSITION_VALG, playerValg, valgKort, valgSett } from '../lib/playerPositions'
import { trimAbbrevDots } from '../lib/dateLabels'
import Sheet from '../components/Sheet.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import SeasonPicker from '../components/SeasonPicker.vue'
import Velger from '../components/Velger.vue'
import BackLink from '../components/BackLink.vue'

const route = useRoute()
const router = useRouter()
const { players, fetchPlayers, updatePlayer, deletePlayer } = usePlayers()
const { fetchPlayerSeasonTeams, teamForSeason, isLoanEligible, setLoanEligible, playerSeasonTeams } = usePlayerSeasonTeams()
const { ensurePlayerStats, statsFor, statsById, matchesFor } = usePlayerStats()
const { seasons, viewingSeason, ensureSeasons } = useSeasons()
const { seasonTeams, seasonTeam, teamsForSeason } = useSeasonTeams()
const { fetchPlayerLevels, levelFor, setLevel } = usePlayerLevels()
const { show: showToast } = useToast()

// Spilleren står i cachen fra Tropp: siden tegnes med en gang. Bare tallene
// venter, og de kommer inn når hentingen er ferdig.
const ready = ref(players.value.some(p => p.id === route.params.id))
const statsKlar = ref(false)
const player = computed(() => players.value.find(p => p.id === route.params.id) || null)
const seasonId = computed(() => viewingSeason.value?.id ?? null)

// Før ventet siden på alt, også alle mål, all spilletid og alle innlån i
// kullet, og hentet sesongene på nytt hver gang. Nå: profilen først, tallene
// i bakgrunnen, og sesongene bare når de er gamle.
onMounted(() => {
  Promise.all([fetchPlayers(), fetchPlayerSeasonTeams(), ensureSeasons(), fetchPlayerLevels()])
    .finally(() => { ready.value = true })
  ensurePlayerStats().finally(() => { statsKlar.value = true })
})

// Kampene hentes per sesong. Uten denne sto tallene fast på sesongen siden ble
// åpnet i, og sesongvelgeren gjorde ingenting synlig.
watch(viewingSeason, async (s) => {
  if (s) await ensurePlayerStats()
})

const stats = computed(() => statsFor(route.params.id))
const valgNa = computed(() => playerValg(player.value))
const level = computed(() => (player.value ? levelFor(player.value.id) : null))
const teamNow = computed(() => {
  const slug = teamForSeason(player.value, seasonId.value)
  // Bare et lag som fantes i sesongen. Fjorårets «Rød» er ikke laget nå.
  return teamsForSeason(seasonId.value).find(t => t.slug === slug) || null
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
      const team = seasonTeam(row.team)
      return { id: s.id, season: s.name, team: team?.name || row.team, accent: team?.accent || 'paper' }
    })
    .filter(Boolean)
})

const recentMatches = computed(() => matchesFor(route.params.id).slice(0, 5))

// Spilletiden mot snittet i laget: det treneren lurer på er om spilleren har
// fått nok. Snittet er snittet av de andres snitt per kamp, bare spillere med
// målt tid. Uten noen å sammenligne med vises bare spillerens egen tid.
const lagSnittSek = computed(() => {
  const lag = teamNow.value?.slug
  if (!lag || !player.value) return null
  const snitt = players.value
    .filter(p => teamForSeason(p, seasonId.value) === lag)
    .map(p => statsById.value[p.id])
    .filter(s => s?.timedGames > 0)
    .map(s => s.avgSec)
  if (snitt.length < 2) return null
  return Math.round(snitt.reduce((a, b) => a + b, 0) / snitt.length)
})
const soyler = computed(() => {
  const egen = mins(stats.value.avgSec)
  const lag = lagSnittSek.value == null ? null : mins(lagSnittSek.value)
  const maks = Math.max(egen, lag || 0, 1)
  return { egen, lag, egenPst: Math.round(egen / maks * 100), lagPst: lag == null ? 0 : Math.round(lag / maks * 100) }
})
const motSnitt = computed(() => {
  const { egen, lag } = soyler.value
  if (lag == null) return ''
  const d = egen - lag
  if (d === 0) return 'Likt med snittet i laget.'
  const n = Math.abs(d)
  return `${n} ${n === 1 ? 'minutt' : 'minutter'} ${d > 0 ? 'over' : 'under'} snittet i laget.`
})

// Posisjonene på en liten bane, angrep opp.
const BANE = {
  angrep: [52, 28], venstre_ving: [20, 58], sentral: [52, 66], hoyre_ving: [84, 58],
  venstre_back: [20, 108], stopper: [52, 112], hoyre_back: [84, 108], keeper: [52, 136]
}
const baneTekst = computed(() => {
  const deler = []
  if (valgNa.value.primar) deler.push(`${valgKort(valgNa.value.primar)} som første valg`)
  if (valgNa.value.sekundar) deler.push(`${valgKort(valgNa.value.sekundar)} som andre valg`)
  return `Bane: ${deler.join(', ')}`
})

function kampDato(iso) {
  return trimAbbrevDots(new Date(iso + 'T12:00:00').toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }))
}
function kampLinje(m) {
  const deler = [kampDato(m.match_date)]
  if (m.home_score != null && m.away_score != null) deler.push(`${m.home_score}–${m.away_score}`)
  return deler.join(' · ')
}

// ── Redigering ───────────────────────────────────────────────────────────────
const editing = ref(false)
const editName = ref('')
const editTeam = ref('')
const editPrimar = ref('')
const editSekundar = ref('')
const editLoan = ref(false)
const editLevel = ref(null)
const toDelete = ref(false)
const saving = ref(false)

function openEdit() {
  if (!player.value) return
  editName.value = player.value.name
  editTeam.value = player.value.primary_team || ''
  editPrimar.value = valgNa.value.primar
  editSekundar.value = valgNa.value.sekundar
  editLoan.value = isLoanEligible(player.value, seasonId.value)
  editLevel.value = level.value
  editing.value = true
}
// Bare posisjonene, i rekkefølgen på banen bakfra. Ingen gruppeoverskrifter.
const posValg = POSITION_VALG.map(v => ({ value: v.value, label: v.label }))
watch(editPrimar, v => { if (!v || v === editSekundar.value) editSekundar.value = '' })
async function save() {
  const name = editName.value.trim()
  if (!name || !player.value || saving.value) return
  saving.value = true
  try {
    // Dobbeltskriving i overgangen: player_season_teams er den varige raden,
    // players.loan_eligible holdes i sync til kolonnen droppes.
    await updatePlayer(player.value.id, {
      name, primary_team: editTeam.value, loan_eligible: editLoan.value,
      positions: [...new Set([...valgSett(editPrimar.value), ...valgSett(editSekundar.value)])],
      primary_positions: valgSett(editPrimar.value)
    })
    await setLoanEligible(player.value.id, seasonId.value, editLoan.value, editTeam.value)
    if (!(await setLevel(player.value.id, editLevel.value))) {
      showToast('Fikk ikke lagret nivået', 'error')
      return
    }
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
      <BackLink to="/serie/tropp" label="Tropp" />
      <button v-if="player" type="button" class="sp__rediger" aria-label="Rediger spiller" @click="openEdit">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M13 7l4 4" /></svg>
      </button>
    </div>

    <div v-if="!ready" class="sp__muted">Henter spiller …</div>
    <div v-else-if="!player" class="sp__muted">Fant ikke spilleren.</div>

    <div v-else class="sp">
      <!-- Hvem: navn, lag, nivå og posisjonene på en bane. -->
      <header class="sp__kort">
        <div class="sp__hvem">
          <div class="sp__topp">
            <h1 class="sp__name">{{ player.name }}</h1>
            <div class="sp__tags">
              <span v-if="teamNow" class="sp__tag sp__tag--lag" :data-lag="teamNow.slug">{{ teamNow.name }}</span>
              <span v-else class="sp__tag">Ikke på et lag</span>
              <span v-if="level" class="sp__tag">Nivå {{ level }}</span>
              <span v-if="isLoanEligible(player, seasonId)" class="sp__tag">Kan lånes</span>
            </div>
          </div>
          <div v-if="valgNa.primar" class="sp__pos">
            <span class="sp__posrad"><span class="sp__prikk sp__prikk--fylt" aria-hidden="true"></span>{{ valgKort(valgNa.primar) }}</span>
            <span v-if="valgNa.sekundar" class="sp__posrad"><span class="sp__prikk" aria-hidden="true"></span>{{ valgKort(valgNa.sekundar) }}</span>
          </div>
          <button v-else type="button" class="sp__inline-action" @click="openEdit">Sett posisjon</button>
        </div>
        <svg class="sp__bane" role="img" :aria-label="baneTekst" width="104" height="148" viewBox="0 0 104 148" fill="none">
          <rect class="sp__bane-flate" x="1" y="1" width="102" height="146" rx="10" />
          <path class="sp__bane-strek" d="M1 74h102" />
          <circle class="sp__bane-strek" cx="52" cy="74" r="14" />
          <rect class="sp__bane-strek" x="30" y="1" width="44" height="20" />
          <rect class="sp__bane-strek" x="30" y="127" width="44" height="20" />
          <circle v-if="BANE[valgNa.sekundar]" class="sp__bane-andre" :cx="BANE[valgNa.sekundar][0]" :cy="BANE[valgNa.sekundar][1]" r="8" />
          <circle v-if="BANE[valgNa.primar]" class="sp__bane-forste" :cx="BANE[valgNa.primar][0]" :cy="BANE[valgNa.primar][1]" r="9" />
        </svg>
      </header>

      <!-- Spilletid først: har spilleren fått nok? Sesongvelgeren står her,
           siden alle tallene under gjelder sesongen. -->
      <section class="sp__section">
        <div class="sp__seasonrow">
          <h2 class="ds-section-label sp__h2">Spilletid</h2>
          <SeasonPicker />
        </div>
        <p v-if="!statsKlar" class="sp__muted" aria-busy="true">Henter tallene …</p>
        <template v-else-if="hasTimed">
          <p class="sp__stort">
            <span class="sp__stort-tall">{{ soyler.egen }}</span>
            <span class="sp__stort-tekst">min i snitt per kamp</span>
          </p>
          <div v-if="soyler.lag != null" class="sp__soyler">
            <div class="sp__soyle">
              <div class="sp__soyle-tekst sp__soyle-tekst--egen"><span>{{ player.name }}</span><span>{{ soyler.egen }} min</span></div>
              <div class="sp__spor"><div class="sp__fyll" :style="{ width: soyler.egenPst + '%' }"></div></div>
            </div>
            <div class="sp__soyle">
              <div class="sp__soyle-tekst"><span>Snitt i {{ teamNow.name }}</span><span>{{ soyler.lag }} min</span></div>
              <div class="sp__spor"><div class="sp__fyll sp__fyll--lag" :style="{ width: soyler.lagPst + '%' }"></div></div>
            </div>
          </div>
          <p v-if="motSnitt" class="sp__merknad">{{ motSnitt }}</p>
        </template>
        <!-- Spilletid finnes bare for kamper kjørt i kampmodus. «0 min» ville
             lest som en benket unge. -->
        <p v-else class="sp__muted">Ingen målt spilletid denne sesongen.</p>
      </section>

      <div v-if="statsKlar" class="sp__tall">
        <div class="sp__tallrute">
          <span class="sp__tallnum">{{ stats.games }}</span>
          <span class="sp__tallnavn">Kamper</span>
        </div>
        <div class="sp__tallrute">
          <span class="sp__tallnum">{{ stats.goals }}</span>
          <span class="sp__tallnavn">Mål</span>
        </div>
        <div class="sp__tallrute">
          <span class="sp__tallnum">{{ hasTimed ? mins(stats.totalSec) : '–' }}</span>
          <span class="sp__tallnavn">Min totalt</span>
        </div>
      </div>
      <p v-if="statsKlar && (stats.extra || stats.keeperSec)" class="sp__merknad sp__merknad--tall">
        <template v-if="stats.extra">{{ stats.extra }} {{ stats.extra === 1 ? 'kamp' : 'kamper' }} som lånespiller.</template>
        <template v-if="stats.keeperSec"> {{ mins(stats.keeperSec) }} min i mål.</template>
      </p>

      <section v-if="statsKlar && recentMatches.length" class="sp__section">
        <h2 class="ds-section-label sp__h2">Siste kamper</h2>
        <ul class="sp__matches">
          <li v-for="m in recentMatches" :key="m.id">
            <router-link :to="`/kamp/${m.id}`" class="sp__match">
              <span class="sp__matchtekst">
                <span class="sp__matchname">{{ m.home_team }} – {{ m.away_team }}</span>
                <span class="sp__matchdate">{{ kampLinje(m) }}</span>
              </span>
              <svg class="sp__pil" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18" /></svg>
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
    </div>

    <!-- Ett ark, like felt: samme høyde, kant og hjørner. Lagre ligger fast
         nederst, og Slett står for seg under. -->
    <Sheet :show="editing" title="Rediger spiller" @close="editing = false">
      <div class="red">
        <div class="red__felt">
          <label class="red__navn" for="red-navn">Navn</label>
          <input id="red-navn" v-model="editName" class="red__input" placeholder="Navn" @keydown.enter="save" />
        </div>
        <div class="red__felt">
          <span id="red-lag" class="red__navn">Lag</span>
          <!-- Trykk igjen for å ta spilleren av laget. -->
          <div class="poschips poschips--lag" role="group" aria-labelledby="red-lag" :style="{ gridTemplateColumns: `repeat(${Math.min(Math.max(seasonTeams.length, 1), 4)}, minmax(0, 1fr))` }">
            <button
              v-for="t in seasonTeams"
              :key="t.slug"
              type="button"
              class="poschip"
              :class="{ 'poschip--on': editTeam === t.slug }"
              :aria-pressed="editTeam === t.slug ? 'true' : 'false'"
              @click="editTeam = editTeam === t.slug ? '' : t.slug"
            >{{ t.name }}</button>
          </div>
        </div>
        <div class="red__felt">
          <label class="red__navn" for="pos-primar">Posisjon, første valg</label>
          <Velger id="pos-primar" v-model="editPrimar" :valg="posValg" />
        </div>
        <div class="red__felt">
          <label class="red__navn" for="pos-sekundar">Posisjon, andre valg</label>
          <Velger
            id="pos-sekundar"
            v-model="editSekundar"
            :valg="posValg.map(v => ({ ...v, disabled: v.value === editPrimar }))"
            :disabled="!editPrimar"
          />
        </div>
        <div class="red__felt">
          <span id="red-niva" class="red__navn">Nivå</span>
          <div class="poschips poschips--tre" role="group" aria-labelledby="red-niva">
            <button
              v-for="l in LEVELS"
              :key="l"
              type="button"
              class="poschip"
              :class="{ 'poschip--on': editLevel === l }"
              :aria-pressed="editLevel === l ? 'true' : 'false'"
              @click="editLevel = editLevel === l ? null : l"
            >{{ l }}</button>
          </div>
        </div>
        <div class="red__bryter">
          <span id="red-laan">Kan lånes til andre lag</span>
          <button
            type="button"
            role="switch"
            class="red__switch"
            :aria-checked="editLoan ? 'true' : 'false'"
            aria-labelledby="red-laan"
            @click="editLoan = !editLoan"
          ><span class="red__knott"></span></button>
        </div>
      </div>
      <template #footer>
        <div class="red__bunn">
          <button type="button" class="ds-btn ds-btn--primary red__lagre" :disabled="!editName.trim() || saving" @click="save">Lagre</button>
          <button type="button" class="red__slett" @click="toDelete = true">Slett spiller</button>
        </div>
      </template>
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
.sp__muted { margin: 0; color: var(--ds-color-text-tertiary); font-size: var(--ds-text-sm); padding: var(--ds-space-sm) var(--ds-space-lg); }
.sp .sp__muted { padding: 0; }

.sp__nav {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--ds-space-md) var(--ds-space-lg) 0;
}
.sp__rediger {
  flex: none; width: 44px; height: 44px; margin-right: -12px;
  display: flex; align-items: center; justify-content: center;
  border: 0; border-radius: var(--ds-radius-full); background: transparent;
  color: var(--ds-color-text-secondary); cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.sp__rediger svg { width: 20px; height: 20px; }
@media (hover: hover) and (pointer: fine) {
  .sp__rediger:hover { background: var(--ds-color-bg-subtle); }
}

.sp {
  display: flex; flex-direction: column; gap: var(--ds-space-lg);
  padding: var(--ds-space-md) var(--ds-space-lg) var(--ds-space-2xl);
}

.sp__kort {
  display: flex; align-items: stretch; gap: var(--ds-space-md);
  padding: 20px;
  background: var(--ds-color-bg-elevated);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-xl);
}
.sp__hvem { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: space-between; gap: var(--ds-space-md); }
.sp__topp { display: flex; flex-direction: column; gap: var(--ds-space-sm); }
.sp__name {
  margin: 0; font-family: var(--ds-font-heading);
  font-size: 2rem; line-height: 1.1; font-weight: var(--ds-weight-bold); letter-spacing: -0.02em;
  overflow-wrap: anywhere;
}
/* Én pilleform på hele sida. */
.sp__tags { display: flex; flex-wrap: wrap; gap: var(--ds-space-sm); }
.sp__tag {
  display: inline-flex; align-items: center; height: 32px; padding: 0 12px;
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-subtle); color: var(--ds-color-text-secondary);
  font-size: 0.9375rem; font-weight: var(--ds-weight-medium); white-space: nowrap;
}
.sp__tag--lag { font-weight: var(--ds-weight-semibold); }
.sp__tag--lag[data-lag="rod"] { background: var(--ds-team-rod-bg); color: var(--ds-team-rod); }
.sp__tag--lag[data-lag="gronn"] { background: var(--ds-team-gronn-bg); color: var(--ds-team-gronn); }

.sp__pos { display: flex; flex-direction: column; gap: 4px; font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary); }
.sp__posrad { display: flex; align-items: center; gap: var(--ds-space-sm); }
/* Fylt er første valg. Ring er andre valg. Samme tegn som på banen. */
.sp__prikk { flex: none; width: 12px; height: 12px; box-sizing: border-box; border-radius: 50%; border: 2px solid var(--ds-color-accent); }
.sp__prikk--fylt { background: var(--ds-color-accent); }

.sp__bane { flex: none; }
.sp__bane-flate { fill: var(--ds-color-bg-subtle); stroke: var(--ds-color-border-strong); stroke-width: 1.5; }
.sp__bane-strek { stroke: var(--ds-color-border-strong); stroke-width: 1.5; }
.sp__bane-forste { fill: var(--ds-color-accent); }
.sp__bane-andre { fill: var(--ds-color-bg-subtle); stroke: var(--ds-color-accent); stroke-width: 2.5; }

.sp__section { display: flex; flex-direction: column; gap: var(--ds-space-md); }
/* Utseendet kommer fra .ds-section-label; her bare marginen i denne siden. */
.sp__h2 { margin: 0; }
.sp__seasonrow { display: flex; align-items: center; justify-content: space-between; gap: var(--ds-space-md); min-height: 44px; }

.sp__stort { margin: 0; display: flex; align-items: baseline; gap: var(--ds-space-sm); }
.sp__stort-tall {
  font-family: var(--ds-font-heading);
  font-size: 3.25rem; line-height: 1; font-weight: var(--ds-weight-bold);
  letter-spacing: -0.03em; font-variant-numeric: tabular-nums;
}
.sp__stort-tekst { font-size: 1.0625rem; color: var(--ds-color-text-secondary); }

.sp__soyler { display: flex; flex-direction: column; gap: 12px; }
.sp__soyle { display: flex; flex-direction: column; gap: 6px; }
.sp__soyle-tekst {
  display: flex; justify-content: space-between; gap: var(--ds-space-md);
  font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary);
  font-variant-numeric: tabular-nums;
}
.sp__soyle-tekst--egen { color: var(--ds-color-text-primary); }
.sp__soyle-tekst--egen > :first-child { font-weight: var(--ds-weight-semibold); }
.sp__spor { height: 12px; border-radius: var(--ds-radius-full); background: var(--ds-color-bg-subtle); overflow: hidden; }
.sp__fyll {
  height: 100%; border-radius: var(--ds-radius-full); background: var(--ds-color-accent);
  transform-origin: left center;
  animation: sp-voks 600ms cubic-bezier(0.23, 1, 0.32, 1) both;
}
.sp__fyll--lag { background: var(--ds-color-border-strong); animation-delay: 80ms; }
@keyframes sp-voks { from { transform: scaleX(0); } }
.sp__merknad { margin: 0; font-size: 0.9375rem; color: var(--ds-color-text-secondary); }
.sp__merknad--tall { margin-top: calc(var(--ds-space-sm) - var(--ds-space-lg)); font-size: var(--ds-text-sm); color: var(--ds-color-text-tertiary); }

.sp__tall {
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
  padding: var(--ds-space-md) 0;
  background: var(--ds-color-bg-elevated);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-lg);
}
.sp__tallrute { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.sp__tallrute + .sp__tallrute { border-left: 1px solid var(--ds-color-border); }
.sp__tallnum { font-size: 1.5rem; line-height: 1.1; font-weight: var(--ds-weight-bold); font-variant-numeric: tabular-nums; }
.sp__tallnavn { font-size: var(--ds-text-xs); color: var(--ds-color-text-tertiary); }

/* Handlingen hører til der mangelen er, ikke bare i blyanten øverst. */
.sp__inline-action {
  align-self: flex-start;
  display: inline-flex; align-items: center; min-height: 44px; padding: 0;
  border: 0; background: transparent; cursor: pointer;
  font-family: var(--ds-font-body); font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium); color: var(--ds-color-text-primary);
  text-decoration: underline; text-underline-offset: 3px;
  -webkit-tap-highlight-color: transparent;
}

/* Én radhøyde. */
.sp__matches, .sp__history { list-style: none; margin: calc(var(--ds-space-sm) * -1) 0 0; padding: 0; }
.sp__match {
  display: flex; align-items: center; gap: 12px; min-height: 64px;
  text-decoration: none; color: inherit;
  border-bottom: 1px solid var(--ds-color-border);
}
.sp__matches li:last-child .sp__match { border-bottom: 0; }
.sp__matchtekst { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.sp__matchname {
  font-size: var(--ds-text-md); font-weight: var(--ds-weight-medium);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.sp__matchdate { font-size: var(--ds-text-sm); color: var(--ds-color-text-tertiary); font-variant-numeric: tabular-nums; }
.sp__pil { flex: none; width: 20px; height: 20px; color: var(--ds-color-text-tertiary); }

.sp__histrow {
  display: flex; align-items: center; justify-content: space-between; gap: var(--ds-space-md);
  min-height: 48px; border-bottom: 1px solid var(--ds-color-border);
  font-size: var(--ds-text-md);
}
.sp__histrow:last-child { border-bottom: 0; }
.sp__histseason { color: var(--ds-color-text-secondary); }
.sp__histteam { color: var(--ds-color-text-tertiary); }

/* ── Rediger: alle felt 52 px høye, 12 px hjørner ─────────────────────────── */
.red { display: flex; flex-direction: column; gap: 20px; }
.red__felt { display: flex; flex-direction: column; gap: var(--ds-space-sm); }
.red__navn { font-size: 0.9375rem; font-weight: var(--ds-weight-medium); color: var(--ds-color-text-secondary); }
.red__input {
  height: 52px; box-sizing: border-box; padding: 0 var(--ds-space-md); width: 100%;
  border: 1px solid var(--ds-color-border-strong); border-radius: 12px;
  background: var(--ds-color-bg-elevated); color: var(--ds-color-text-primary);
  font-family: var(--ds-font-body); font-size: 1.0625rem;
}
.red__input:focus-visible { outline: none; border-color: var(--ds-color-accent); box-shadow: var(--ds-shadow-focus); }
.red :deep(.velger) { min-height: 52px; border: 1px solid var(--ds-color-border-strong); border-radius: 12px; font-size: 1.0625rem; }

/* Lag og Nivå: samme velger, ett spor med ett fylt valg. */
.poschips {
  display: grid; gap: 4px; height: 52px; box-sizing: border-box; padding: 4px;
  border-radius: 12px; background: var(--ds-color-bg-subtle);
}
.poschips--tre { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.poschip {
  min-width: 0; padding: 0 var(--ds-space-sm); cursor: pointer;
  border: 0; border-radius: 8px; background: transparent;
  font-family: var(--ds-font-body); font-size: var(--ds-text-md); font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-secondary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  transition: background .15s ease, color .15s ease;
  -webkit-tap-highlight-color: transparent;
}
.poschip--on { background: var(--ds-color-accent); color: var(--ds-color-accent-text); font-weight: var(--ds-weight-semibold); }
.poschip:focus-visible { outline: none; box-shadow: var(--ds-shadow-focus); }

.red__bryter {
  display: flex; align-items: center; justify-content: space-between; gap: var(--ds-space-md);
  min-height: 52px; font-size: 1.0625rem;
}
.red__switch {
  flex: none; width: 52px; height: 32px; padding: 3px; box-sizing: border-box;
  border: 0; border-radius: var(--ds-radius-full); cursor: pointer;
  background: var(--ds-color-border-strong);
  display: flex; align-items: center;
  transition: background .15s ease;
  -webkit-tap-highlight-color: transparent;
}
.red__knott {
  width: 26px; height: 26px; border-radius: 50%; background: #fff;
  box-shadow: var(--ds-shadow-xs);
  transition: transform 200ms cubic-bezier(0.23, 1, 0.32, 1);
}
.red__switch[aria-checked="true"] { background: var(--ds-color-accent); }
.red__switch[aria-checked="true"] .red__knott { transform: translateX(20px); }
.red__switch:focus-visible { outline: none; box-shadow: var(--ds-shadow-focus); }

.red__bunn { display: flex; flex-direction: column; gap: 4px; }
.red__lagre { width: 100%; min-height: 52px; border-radius: 12px; font-size: 1.0625rem; }
.red__slett {
  min-height: 44px; border: 0; background: transparent; cursor: pointer;
  font-family: var(--ds-font-body); font-size: var(--ds-text-md); font-weight: var(--ds-weight-medium);
  color: var(--ds-color-error);
  -webkit-tap-highlight-color: transparent;
}

@media (prefers-reduced-motion: reduce) {
  .sp__fyll { animation: none; }
  .red__knott, .poschip, .red__switch { transition: none; }
}
</style>
