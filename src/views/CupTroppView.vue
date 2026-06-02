<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAuth } from '../stores/auth'
import { useCups } from '../composables/useCups'
import { usePlayers } from '../composables/usePlayers'
import { useCupSquad } from '../composables/useCupSquad'
import { CUP_TEAMS, cupTeam } from '../lib/cupTeams'
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

function teamPlayers(slug) {
  return playerIdsForTeam(slug).map(id => getPlayerById(id)).filter(Boolean).sort(byName)
}
const unplaced = computed(() =>
  allPlayers.value.filter(p => !teamForPlayer(p.id)))

async function toggle(playerId, team) {
  if (!cupId.value) return
  if (teamForPlayer(playerId) === team) await removeFromSquad(cupId.value, playerId)
  else await setTeam(cupId.value, playerId, team)
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

      <!-- REDIGER: flat liste med lag-bryter per spiller -->
      <template v-else-if="canEdit && editing">
        <p class="cmd-muted" style="margin-bottom:var(--ds-space-sm);">Velg lag for hver spiller. Trykk valgt lag igjen for å fjerne.</p>
        <div v-if="allPlayers.length === 0" class="cmd-muted">Ingen spillere i poolen — legg til under Admin → Spillere.</div>
        <div class="list">
          <div v-for="p in allPlayers" :key="p.id" class="prow">
            <span class="pname">{{ p.name }}</span>
            <div class="ds-pills">
              <button
                v-for="t in CUP_TEAMS"
                :key="t.slug"
                type="button"
                class="ds-pill"
                :class="{ 'ds-pill--active': teamForPlayer(p.id) === t.slug }"
                @click="toggle(p.id, t.slug)"
              >
                {{ t.name.replace('Halsen IF ', '') }}
              </button>
            </div>
          </div>
        </div>
      </template>

      <!-- VISNING: gruppert per lag + ikke plassert nederst -->
      <template v-else>
        <section v-for="t in CUP_TEAMS" :key="t.slug" class="team">
          <div class="teamhead">{{ t.name }} <span class="teamhead__count">{{ teamPlayers(t.slug).length }}</span></div>
          <div v-if="teamPlayers(t.slug).length === 0" class="cmd-muted">Ingen spillere lagt til ennå.</div>
          <div v-else class="list">
            <div v-for="p in teamPlayers(t.slug)" :key="p.id" class="prow prow--read">
              <span class="pname">{{ p.name }}</span>
            </div>
          </div>
        </section>

        <section v-if="canEdit && unplaced.length" class="team">
          <div class="teamhead teamhead--muted">Ikke plassert <span class="teamhead__count">{{ unplaced.length }}</span></div>
          <div class="list">
            <div v-for="p in unplaced" :key="p.id" class="prow prow--read prow--muted">
              <span class="pname">{{ p.name }}</span>
            </div>
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

.team { margin-top: var(--ds-space-lg); }
.team:first-of-type { margin-top: 0; }
.teamhead {
  font-family: var(--ds-font-heading);
  font-size: var(--ds-text-lg);
  font-weight: var(--ds-weight-bold);
  letter-spacing: var(--ds-tracking-tight);
  color: var(--ds-color-text-primary);
  margin-bottom: var(--ds-space-sm);
}
.teamhead--muted { color: var(--ds-color-text-tertiary); font-size: var(--ds-text-md); }
.teamhead__count { color: var(--ds-color-text-tertiary); font-family: var(--ds-font-body); font-size: var(--ds-text-sm); font-weight: var(--ds-weight-medium); }

.list { display: flex; flex-direction: column; gap: var(--ds-space-sm); }
.prow {
  display: flex; align-items: center; justify-content: space-between; gap: var(--ds-space-md);
  background: var(--ds-color-bg-elevated);
  border: var(--ds-border-width) solid var(--ds-color-border-light);
  border-radius: var(--ds-radius-lg);
  box-shadow: var(--ds-shadow-xs);
  padding: var(--ds-space-md);
}
.prow--muted { background: var(--ds-color-bg-subtle); box-shadow: none; }
.pname { font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-primary); }
.prow--muted .pname { color: var(--ds-color-text-secondary); font-weight: var(--ds-weight-medium); }
</style>
