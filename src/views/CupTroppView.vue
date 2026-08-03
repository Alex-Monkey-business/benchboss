<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAuth } from '../stores/auth'
import { useCups } from '../composables/useCups'
import { usePlayers } from '../composables/usePlayers'
import { useCupSquad } from '../composables/useCupSquad'
import { CUP_TEAMS } from '../lib/cupTeams'
import CupTabs from '../components/CupTabs.vue'

const { isParent } = useAuth()
const { activeCup, fetchCups } = useCups()
const { players, fetchPlayers, getPlayerById } = usePlayers()
const { squad, fetchCupSquad, teamForPlayer, playerIdsForTeam, setTeam, removeFromSquad } = useCupSquad()

const canEdit = computed(() => !isParent.value)
const ready = ref(false)
const editing = ref(false)
const cupId = computed(() => activeCup.value?.id)

onMounted(async () => {
  await Promise.all([fetchCups(), fetchPlayers()])
  if (cupId.value) await fetchCupSquad(cupId.value)
  ready.value = true
})

const byName = (a, b) => a.name.localeCompare(b.name, 'no')
const allPlayers = computed(() => [...players.value].sort(byName))

// Tonal accent-palett delt med treningsplan/login — terrakotta, kornblå, salvie …
const TEAM_ACCENTS = ['warm', 'cornflower', 'sage', 'olive', 'sky', 'peach']
const teamAccent = (i) => TEAM_ACCENTS[i % TEAM_ACCENTS.length]

function teamPlayers(slug) {
  return playerIdsForTeam(slug).map(id => getPlayerById(id)).filter(Boolean).sort(byName)
}
const unplaced = computed(() =>
  allPlayers.value.filter(p => !teamForPlayer(p.id)))

async function assign(playerId, team) {
  if (!cupId.value) return
  await setTeam(cupId.value, playerId, team)
}
async function remove(playerId) {
  if (!cupId.value) return
  await removeFromSquad(cupId.value, playerId)
}
</script>

<template>
  <div class="desktop-container">
    <div class="page-header">
      <h1 class="page-header__title">Tropp</h1>
      <p class="page-header__subtitle">{{ activeCup?.name || 'Cup' }}</p>
    </div>

    <div class="px-lg">
      <CupTabs />

      <div v-if="canEdit" class="tropp-actions">
        <span class="tropp-hint">{{ unplaced.length }} ikke plassert</span>
        <button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" @click="editing = !editing">
          {{ editing ? 'Ferdig' : 'Rediger tropp' }}
        </button>
      </div>

      <div v-if="!ready" class="cmd-muted">Henter tropp …</div>

      <!-- Samme layout i lese- og edit-modus: lag-kort med chips -->
      <template v-else>
        <p v-if="editing" class="edit-hint">Trykk × for å ta av laget. Trykk en farge for å plassere.</p>

        <section v-for="(t, i) in CUP_TEAMS" :key="t.slug" class="teamcard" :data-accent="teamAccent(i)">
          <header class="teamcard__head">
            <span class="teamcard__dot"></span>
            <span class="teamcard__name">{{ t.name }}</span>
            <span class="teamcard__count">{{ teamPlayers(t.slug).length }}</span>
          </header>
          <p v-if="t.trainers?.length" class="teamcard__trainers">Trenere: {{ t.trainers.join(', ') }}</p>
          <p v-if="teamPlayers(t.slug).length === 0" class="teamcard__empty">Ingen spillere lagt til ennå.</p>
          <div v-else class="roster">
            <span v-for="p in teamPlayers(t.slug)" :key="p.id" class="chip chip--team">
              {{ p.name }}
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
              {{ p.name }}
              <span v-if="editing" class="chip__assign">
                <button
                  v-for="(t, i) in CUP_TEAMS"
                  :key="t.slug"
                  type="button"
                  class="chip__dot"
                  :data-accent="teamAccent(i)"
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
  </div>
</template>

<style scoped>
.cmd-muted { color: var(--ds-color-text-tertiary); font-size: var(--ds-text-sm); padding: var(--ds-space-sm) 2px; }

.tropp-actions {
  display: flex; align-items: center; justify-content: space-between; gap: var(--ds-space-md);
  margin-bottom: var(--ds-space-md);
}
.tropp-hint { font-size: var(--ds-text-sm); color: var(--ds-color-text-tertiary); }

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
.teamcard__empty { color: var(--ds-color-text-tertiary); font-size: var(--ds-text-sm); margin: 0; }

.roster { display: flex; flex-wrap: wrap; gap: var(--ds-space-sm); }
.chip {
  display: inline-flex; align-items: center; gap: var(--ds-space-xs);
  padding: 6px var(--ds-space-md);
  border-radius: var(--ds-radius-full);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-semibold);
}
.chip--team { background: var(--accent-bg); color: var(--accent-text); }
.chip--muted {
  background: var(--ds-color-bg-subtle); color: var(--ds-color-text-secondary);
  padding-right: 4px;
}

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
</style>
