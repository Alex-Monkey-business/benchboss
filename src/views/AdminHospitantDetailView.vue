<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSeasons } from '../composables/useSeasons'
import { useMatches } from '../composables/useMatches'
import { useExpenses } from '../composables/useExpenses'
import { useCoaches } from '../composables/useCoaches'
import { usePlayers } from '../composables/usePlayers'
import { useToast } from '../composables/useToast'
import MatchCard from '../components/MatchCard.vue'
import MatchCardSkeleton from '../components/MatchCardSkeleton.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import Sheet from '../components/Sheet.vue'
import Skeleton from '../components/Skeleton.vue'

const route = useRoute()
const router = useRouter()

const { activeSeason, fetchSeasons } = useSeasons()
const { matches, matchPlayers, fetchMatches, getCoachesForMatch } = useMatches()
const { expenses, fetchExpenses, getExpenseForMatch } = useExpenses()
const { coaches, fetchCoaches } = useCoaches()
const { players, fetchPlayers, updatePlayer, deletePlayer } = usePlayers()
const { show: showToast } = useToast()

// Skeleton only if players AND matches haven't been loaded yet.
const loading = ref(players.value.length === 0 || matches.value.length === 0)
const editing = ref(false)
const editName = ref('')
const editTeam = ref('')
const playerToDelete = ref(null)

const TEAM_OPTIONS = [
  { value: '', label: 'Ingen' },
  { value: 'gronn', label: 'Grønn' },
  { value: 'rod', label: 'Rød' },
  { value: 'hvit', label: 'Hvit' }
]
const TEAM_LABELS = { gronn: 'Grønn', rod: 'Rød', hvit: 'Hvit' }

const player = computed(() => players.value.find(p => p.id === route.params.id))

const playerMatches = computed(() => {
  if (!player.value) return []
  const matchIds = matchPlayers.value
    .filter(mp => mp.player_id === player.value.id)
    .map(mp => mp.match_id)
  return matches.value
    .filter(m => matchIds.includes(m.id))
    .sort((a, b) => b.match_date.localeCompare(a.match_date) || (b.match_time || '').localeCompare(a.match_time || ''))
})

onMounted(async () => {
  await Promise.all([fetchSeasons(), fetchPlayers(), fetchCoaches()])
  if (activeSeason.value) {
    await fetchMatches(activeSeason.value.id)
    await fetchExpenses(matches.value.map(m => m.id))
  }
  loading.value = false
})

function getCoachName(coachId) {
  return coaches.value.find(c => c.id === coachId)?.name || ''
}

function getCoachNamesForMatch(matchId) {
  const ids = getCoachesForMatch(matchId)
  return ids.map(id => getCoachName(id)).filter(Boolean).join(', ')
}

function startEdit() {
  if (!player.value) return
  editName.value = player.value.name
  editTeam.value = player.value.primary_team || ''
  editing.value = true
}

function cancelEdit() {
  editing.value = false
  editName.value = ''
  editTeam.value = ''
}

async function saveEdit() {
  const name = editName.value.trim()
  if (!name || !player.value) return
  await updatePlayer(player.value.id, { name, primary_team: editTeam.value })
  showToast('Lånespiller oppdatert', 'success')
  cancelEdit()
}

async function confirmDelete() {
  if (!playerToDelete.value) return
  const name = playerToDelete.value.name
  await deletePlayer(playerToDelete.value.id)
  playerToDelete.value = null
  showToast(`${name} slettet`, 'success')
  router.push('/admin/hospitanter')
}
</script>

<template>
  <div class="desktop-container">
    <div class="px-lg" style="padding-top: var(--ds-space-md);">
      <router-link to="/admin/hospitanter" class="back-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Lånespillere
      </router-link>
    </div>

    <div v-if="loading" class="px-lg" aria-hidden="true" style="display: flex; flex-direction: column; gap: 14px;">
      <Skeleton :width="160" :height="28" />
      <Skeleton :width="100" :height="13" />
      <div style="height: 8px;"></div>
      <MatchCardSkeleton :count="3" />
    </div>

    <template v-else-if="player">
      <div class="page-header detail-header">
        <div class="detail-header__main">
          <h1 class="page-header__title">{{ player.name }}</h1>
          <p class="page-header__subtitle">
            <span v-if="player.primary_team" :class="['hospitant-team-tag', `hospitant-team-tag--${player.primary_team}`]">{{ TEAM_LABELS[player.primary_team] }}</span>
            <span>{{ playerMatches.length }} ekstra {{ playerMatches.length === 1 ? 'kamp' : 'kamper' }} i {{ activeSeason?.name }}</span>
          </p>
        </div>
        <button class="detail-header__edit" @click="startEdit" aria-label="Rediger">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
      </div>

      <div class="px-lg mb-lg">
        <div v-if="playerMatches.length === 0" class="ds-empty">
          <h3 class="ds-empty__title">Ingen ekstra kamper enda</h3>
          <p class="ds-empty__description">Når du legger til {{ player.name }} som lånespiller på en kamp dukker den opp her.</p>
        </div>

        <div v-else class="ds-stack--sm">
          <MatchCard
            v-for="match in playerMatches"
            :key="match.id"
            :match="match"
            :expense="getExpenseForMatch(match.id)"
            :paid-by-name="getCoachName(getExpenseForMatch(match.id)?.paid_by)"
            :coach-names="getCoachNamesForMatch(match.id)"
          />
        </div>
      </div>
    </template>

    <template v-else>
      <div class="px-lg">
        <div class="ds-empty">
          <h3 class="ds-empty__title">Fant ikke hospitanten</h3>
          <p class="ds-empty__description">Den kan ha blitt slettet.</p>
        </div>
      </div>
    </template>

    <Sheet :show="editing" title="Rediger hospitant" @close="cancelEdit">
      <div class="ds-form-group">
        <label class="ds-label">Navn</label>
        <input v-model="editName" class="ds-input" placeholder="Navn" />
      </div>
      <div class="ds-form-group">
        <label class="ds-label ds-label--optional">Hovedlag</label>
        <select v-model="editTeam" class="ds-input">
          <option v-for="opt in TEAM_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
      </div>
      <div class="sheet-actions sheet-actions--with-delete">
        <button class="sheet-actions__delete" @click="playerToDelete = player" aria-label="Slett spiller">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
        </button>
        <button class="ds-btn ds-btn--secondary" @click="cancelEdit">Avbryt</button>
        <button class="ds-btn ds-btn--primary" @click="saveEdit">Lagre</button>
      </div>
    </Sheet>

    <ConfirmDialog
      :show="!!playerToDelete"
      title="Slett hospitant?"
      :message="`Er du sikker på at du vil slette ${playerToDelete?.name}? Tilknytninger til kamper fjernes også.`"
      confirm-label="Slett"
      variant="warning"
      @confirm="confirmDelete"
      @cancel="playerToDelete = null"
    />
  </div>
</template>

<style scoped>
.detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.detail-header__main {
  flex: 1;
  min-width: 0;
}

.detail-header__edit {
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--ds-radius-md);
  background: var(--ds-color-bg-elevated);
  border: 1px solid var(--ds-color-border);
  color: var(--ds-color-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
  margin-top: 4px;
}

.detail-header__edit:hover {
  background: var(--ds-color-bg-subtle);
  color: var(--ds-color-text-primary);
}

.page-header__subtitle {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.hospitant-team-tag {
  display: inline-block;
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  letter-spacing: 0.02em;
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
