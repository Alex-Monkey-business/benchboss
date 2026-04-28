<script setup>
import { ref, computed, onMounted } from 'vue'
import { useSeasons } from '../composables/useSeasons'
import { useMatches } from '../composables/useMatches'
import { usePlayers } from '../composables/usePlayers'
import { useToast } from '../composables/useToast'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import Sheet from '../components/Sheet.vue'

const { activeSeason, fetchSeasons } = useSeasons()
const { matchPlayers, fetchMatches } = useMatches()
const { players, fetchPlayers, addPlayer, updatePlayer, deletePlayer } = usePlayers()
const { show: showToast } = useToast()

const editingPlayer = ref(null)
const editPlayerName = ref('')
const editPlayerTeam = ref('')
const showAddPlayer = ref(false)
const newPlayerName = ref('')
const newPlayerTeam = ref('')
const playerToDelete = ref(null)

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

function startEditPlayer(p) {
  editingPlayer.value = p
  editPlayerName.value = p.name
  editPlayerTeam.value = p.primary_team || ''
}

function cancelEditPlayer() {
  editingPlayer.value = null
  editPlayerName.value = ''
  editPlayerTeam.value = ''
}

async function saveEditPlayer() {
  const name = editPlayerName.value.trim()
  if (!name) return
  await updatePlayer(editingPlayer.value.id, { name, primary_team: editPlayerTeam.value })
  showToast('Hospitant oppdatert', 'success')
  cancelEditPlayer()
}

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

async function confirmDeletePlayer() {
  if (!playerToDelete.value) return
  const name = playerToDelete.value.name
  await deletePlayer(playerToDelete.value.id)
  playerToDelete.value = null
  cancelEditPlayer()
  showToast(`${name} slettet`, 'success')
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
          <div v-for="p in playerStats" :key="p.id" class="referee-row">
            <button class="referee-row__main" @click="startEditPlayer(p)">
              <div class="referee-row__name">
                {{ p.name }}
                <span v-if="p.primary_team" :class="['hospitant-team-tag', `hospitant-team-tag--${p.primary_team}`]">{{ TEAM_LABELS[p.primary_team] }}</span>
              </div>
              <div class="referee-row__phone">
                {{ p.count }} ekstra {{ p.count === 1 ? 'kamp' : 'kamper' }}
              </div>
              <svg class="referee-row__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>

        <button class="more-inline-action" @click="showAddPlayer = true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Ny hospitant
        </button>
      </div>
    </div>

    <div style="height: 24px;"></div>

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

    <Sheet :show="!!editingPlayer" title="Rediger hospitant" @close="cancelEditPlayer">
      <div class="ds-form-group">
        <label class="ds-label">Navn</label>
        <input v-model="editPlayerName" class="ds-input" placeholder="Navn" />
      </div>
      <div class="ds-form-group">
        <label class="ds-label ds-label--optional">Hovedlag</label>
        <select v-model="editPlayerTeam" class="ds-input">
          <option v-for="opt in TEAM_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
      </div>
      <div class="sheet-actions sheet-actions--with-delete">
        <button class="sheet-actions__delete" @click="playerToDelete = editingPlayer" aria-label="Slett spiller">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
        </button>
        <button class="ds-btn ds-btn--secondary" @click="cancelEditPlayer">Avbryt</button>
        <button class="ds-btn ds-btn--primary" @click="saveEditPlayer">Lagre</button>
      </div>
    </Sheet>

    <ConfirmDialog
      :show="!!playerToDelete"
      title="Slett hospitant?"
      :message="`Er du sikker på at du vil slette ${playerToDelete?.name}? Tilknytninger til kamper fjernes også.`"
      confirm-label="Slett"
      variant="warning"
      @confirm="confirmDeletePlayer"
      @cancel="playerToDelete = null"
    />
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
  border-bottom: 1px solid var(--ds-color-border-light);
}

.referee-row:last-child {
  border-bottom: 0;
}

.referee-row__main {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px 4px;
  background: transparent;
  border: 0;
  cursor: pointer;
  text-align: left;
  font: inherit;
  -webkit-tap-highlight-color: transparent;
}

.referee-row__name {
  flex: 1;
  font-weight: 500;
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-primary);
}

.referee-row__phone {
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

.sheet-actions--with-delete {
  justify-content: space-between;
}

.sheet-actions__delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--ds-radius-md);
  background: transparent;
  border: 1px solid var(--ds-color-border);
  color: var(--ds-color-error);
  cursor: pointer;
  transition: all 0.15s ease;
  margin-right: auto;
}

.sheet-actions__delete:hover {
  background: var(--ds-color-error-light);
  border-color: var(--ds-color-error);
}
</style>
