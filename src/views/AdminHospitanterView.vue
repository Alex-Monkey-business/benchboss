<script setup>
import { ref, computed, onMounted } from 'vue'
import { useSeasons } from '../composables/useSeasons'
import { useMatches } from '../composables/useMatches'
import { usePlayers } from '../composables/usePlayers'
import { useToast } from '../composables/useToast'
import Sheet from '../components/Sheet.vue'

const { activeSeason, fetchSeasons } = useSeasons()
const { matchPlayers, fetchMatches } = useMatches()
const { players, fetchPlayers, addPlayer } = usePlayers()
const { show: showToast } = useToast()

const showAddPlayer = ref(false)
const newPlayerName = ref('')
const newPlayerTeam = ref('')

const TEAM_OPTIONS = [
  { value: '', label: 'Ingen' },
  { value: 'gronn', label: 'Grønn' },
  { value: 'rod', label: 'Rød' },
  { value: 'hvit', label: 'Hvit' }
]
const TEAM_LABELS = { gronn: 'Grønn', rod: 'Rød', hvit: 'Hvit' }

onMounted(async () => {
  await Promise.all([fetchSeasons(), fetchPlayers()])
  if (activeSeason.value) {
    await fetchMatches(activeSeason.value.id)
  }
})

const playerStats = computed(() => {
  const counts = {}
  matchPlayers.value.forEach(mp => {
    counts[mp.player_id] = (counts[mp.player_id] || 0) + 1
  })
  return players.value.map(p => ({ ...p, count: counts[p.id] || 0 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
})

const totalHospitantMatches = computed(() => matchPlayers.value.length)

function cancelAddPlayer() {
  showAddPlayer.value = false
  newPlayerName.value = ''
  newPlayerTeam.value = ''
}

async function handleAddPlayer() {
  const name = newPlayerName.value.trim()
  if (!name) return
  await addPlayer(name, newPlayerTeam.value)
  showToast(`${name} lagt til`, 'success')
  cancelAddPlayer()
}
</script>

<template>
  <div class="desktop-container">
    <div class="px-lg" style="padding-top: var(--ds-space-md);">
      <router-link to="/admin" class="back-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Admin
      </router-link>
    </div>

    <div class="page-header">
      <h1 class="page-header__title">Hospitanter</h1>
      <p v-if="players.length > 0" class="page-header__subtitle">
        {{ players.length }} spillere · {{ totalHospitantMatches }} ekstra kamper
      </p>
    </div>

    <div class="px-lg mb-lg">
      <div class="ds-card ds-card--compact">
        <div v-if="playerStats.length === 0" class="referee-empty">
          Ingen spillere i poolen.
        </div>

        <div v-else class="referee-list">
          <router-link
            v-for="p in playerStats"
            :key="p.id"
            :to="`/admin/hospitanter/${p.id}`"
            class="referee-row"
          >
            <div class="referee-row__name">
              {{ p.name }}
              <span v-if="p.primary_team" :class="['hospitant-team-tag', `hospitant-team-tag--${p.primary_team}`]">{{ TEAM_LABELS[p.primary_team] }}</span>
            </div>
            <div class="referee-row__count">
              {{ p.count }} ekstra {{ p.count === 1 ? 'kamp' : 'kamper' }}
            </div>
            <svg class="referee-row__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </router-link>
        </div>

        <button class="more-inline-action" @click="showAddPlayer = true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Ny hospitant
        </button>
      </div>
    </div>

    <Sheet :show="showAddPlayer" title="Ny hospitant" @close="cancelAddPlayer">
      <div class="ds-form-group">
        <label class="ds-label">Navn</label>
        <input v-model="newPlayerName" class="ds-input" placeholder="Spillerens navn" @keydown.enter="handleAddPlayer" />
      </div>
      <div class="ds-form-group">
        <label class="ds-label ds-label--optional">Hovedlag</label>
        <select v-model="newPlayerTeam" class="ds-input">
          <option v-for="opt in TEAM_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
      </div>
      <div class="sheet-actions">
        <button class="ds-btn ds-btn--secondary" @click="cancelAddPlayer">Avbryt</button>
        <button class="ds-btn ds-btn--primary" :disabled="!newPlayerName.trim()" @click="handleAddPlayer">Legg til</button>
      </div>
    </Sheet>
  </div>
</template>

<style scoped>
.referee-empty {
  padding: 24px 4px;
  text-align: center;
  color: var(--ds-color-text-tertiary);
  font-size: var(--ds-text-sm);
}

.referee-list {
  display: flex;
  flex-direction: column;
}

.referee-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px 4px;
  text-decoration: none;
  color: inherit;
  border-bottom: 1px solid var(--ds-color-border-light);
  -webkit-tap-highlight-color: transparent;
  transition: background 0.15s ease;
}

.referee-row:last-child {
  border-bottom: 0;
}

.referee-row:hover {
  background: var(--ds-color-bg-subtle);
}

.referee-row__name {
  flex: 1;
  font-weight: 500;
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-primary);
}

.referee-row__count {
  font-size: 0.8125rem;
  color: var(--ds-color-text-secondary);
}

.referee-row__chevron {
  color: var(--ds-color-text-tertiary);
  flex-shrink: 0;
}

.hospitant-team-tag {
  display: inline-block;
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  letter-spacing: 0.02em;
  margin-left: 6px;
}

.hospitant-team-tag--gronn {
  background: var(--ds-color-success-light);
  color: var(--ds-color-success);
}

.hospitant-team-tag--rod {
  background: var(--ds-color-error-light);
  color: var(--ds-color-error);
}

.hospitant-team-tag--hvit {
  background: var(--ds-color-bg-elevated);
  color: var(--ds-color-text-tertiary);
  border: 1px solid var(--ds-color-border-light);
}

.more-inline-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 0;
  padding: 12px 4px 4px;
  margin-top: 8px;
  cursor: pointer;
  color: var(--ds-color-accent);
  font-weight: 600;
  font-size: 0.875rem;
  font-family: var(--ds-font-body);
}

.more-inline-action:hover {
  text-decoration: underline;
}

.sheet-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: var(--ds-space-lg);
}
</style>
