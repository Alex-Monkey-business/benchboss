<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../stores/auth'
import { useSeasons } from '../composables/useSeasons'
import { useMatches } from '../composables/useMatches'
import { useExpenses } from '../composables/useExpenses'
import { useToast } from '../composables/useToast'
import { useCoaches } from '../composables/useCoaches'
import { useReferees } from '../composables/useReferees'
import { parseMatchFile, detectSeasonName } from '../lib/excelParser'
import { formatPhone, parsePhone } from '../lib/phone'
import ConfirmDialog from '../components/ConfirmDialog.vue'

const router = useRouter()
const { coach, logout } = useAuth()
const { coaches, fetchCoaches } = useCoaches()
const coachImage = computed(() => coaches.value.find(c => c.name === coach.value?.name)?.image)
const { seasons, activeSeason, fetchSeasons, createSeason, setActiveSeason } = useSeasons()
const { matches, fetchMatches, bulkAddMatches, addMatch, deleteAllMatches } = useMatches()
const { fetchExpenses } = useExpenses()
const { referees, fetchReferees, addReferee, updateReferee, deleteReferee } = useReferees()
const { show: showToast } = useToast()

const loading = ref(false)
const dragActive = ref(false)
const parsedMatches = ref([])
const showPreview = ref(false)
const importing = ref(false)
const detectedSeason = ref(null)

// New season form
const newSeasonName = ref('')
const showNewSeason = ref(false)

// Add match form
const showAddMatch = ref(false)
const newMatch = ref({
  match_date: '',
  match_time: '',
  home_team: '',
  away_team: '',
  division: '',
  round: ''
})

const showLogoutDialog = ref(false)
const showDeleteAllDialog = ref(false)
const deleting = ref(false)

// Dommere admin
const editingRefereeId = ref(null)
const editRefereeName = ref('')
const editRefereePhone = ref('')
const showAddReferee = ref(false)
const newRefereeName = ref('')
const newRefereePhone = ref('')
const refereeToDelete = ref(null)

onMounted(async () => {
  await Promise.all([fetchSeasons(), fetchCoaches(), fetchReferees()])
})

// File upload
function onDragOver(e) {
  e.preventDefault()
  dragActive.value = true
}

function onDragLeave() {
  dragActive.value = false
}

async function onDrop(e) {
  e.preventDefault()
  dragActive.value = false
  const file = e.dataTransfer?.files[0]
  if (file) await processFile(file)
}

async function onFileSelect(e) {
  const file = e.target.files?.[0]
  if (file) await processFile(file)
}

async function processFile(file) {
  try {
    loading.value = true
    const result = await parseMatchFile(file)
    parsedMatches.value = result
    detectedSeason.value = detectSeasonName(result)
    showPreview.value = true
    loading.value = false
  } catch (err) {
    loading.value = false
    showToast('Kunne ikke lese filen: ' + err.message, 'error')
  }
}

async function confirmImport() {
  if (parsedMatches.value.length === 0) return

  importing.value = true

  // Find or create the detected season
  let targetSeason = activeSeason.value
  if (detectedSeason.value) {
    const existing = seasons.value.find(s => s.name === detectedSeason.value)
    if (existing) {
      targetSeason = existing
      await setActiveSeason(existing.id)
    } else {
      targetSeason = await createSeason(detectedSeason.value)
    }
  }

  if (!targetSeason) {
    showToast('Ingen sesong valgt', 'error')
    importing.value = false
    return
  }

  // Fetch existing matches for this season to check for duplicates
  await fetchMatches(targetSeason.id)

  const matchData = parsedMatches.value
    .map(m => ({ ...m, season_id: targetSeason.id }))
    .filter(m => {
      // Skip if a match with same date, time, home and away already exists
      return !matches.value.some(existing =>
        existing.match_date === m.match_date &&
        existing.match_time === m.match_time &&
        existing.home_team === m.home_team &&
        existing.away_team === m.away_team
      )
    })

  if (matchData.length === 0) {
    showToast('Alle kamper finnes allerede i sesongen', 'info')
    showPreview.value = false
    parsedMatches.value = []
    detectedSeason.value = null
    importing.value = false
    return
  }

  await bulkAddMatches(matchData)
  await fetchExpenses(matches.value.map(m => m.id))

  const skipped = parsedMatches.value.length - matchData.length
  const msg = skipped > 0
    ? `${matchData.length} kamper importert, ${skipped} duplikater hoppet over`
    : `${matchData.length} kamper importert til ${targetSeason.name}`
  showToast(msg, 'success')
  showPreview.value = false
  parsedMatches.value = []
  detectedSeason.value = null
  importing.value = false
}

async function handleCreateSeason() {
  if (!newSeasonName.value.trim()) return
  await createSeason(newSeasonName.value.trim())
  showToast(`${newSeasonName.value} opprettet`, 'success')
  newSeasonName.value = ''
  showNewSeason.value = false
}

async function switchSeason(seasonId) {
  await setActiveSeason(seasonId)
  await fetchMatches(seasonId)
  await fetchExpenses(matches.value.map(m => m.id))
  showToast(`Byttet til ${activeSeason.value?.name}`, 'success')
}

async function handleAddMatch() {
  if (!newMatch.value.home_team || !newMatch.value.away_team || !newMatch.value.match_date) return
  await addMatch({
    ...newMatch.value,
    season_id: activeSeason.value.id,
    fee_amount: 200
  })
  showToast('Kamp lagt til', 'success')
  showAddMatch.value = false
  newMatch.value = { match_date: '', match_time: '', home_team: '', away_team: '', division: '', round: '' }
}

async function confirmDeleteAll() {
  if (!activeSeason.value) return
  deleting.value = true
  await deleteAllMatches(activeSeason.value.id)
  showDeleteAllDialog.value = false
  deleting.value = false
  showToast('Alle kamper slettet', 'success')
}

function startEditReferee(r) {
  editingRefereeId.value = r.id
  editRefereeName.value = r.name
  editRefereePhone.value = formatPhone(r.phone) || r.phone || ''
}

function cancelEditReferee() {
  editingRefereeId.value = null
  editRefereeName.value = ''
  editRefereePhone.value = ''
}

async function saveEditReferee() {
  const name = editRefereeName.value.trim()
  if (!name) return
  const phone = parsePhone(editRefereePhone.value)
  if (editRefereePhone.value && !phone) {
    showToast('Telefonnummer må være 8 sifre', 'error')
    return
  }
  await updateReferee(editingRefereeId.value, { name, phone })
  showToast('Dommer oppdatert', 'success')
  cancelEditReferee()
}

async function handleAddReferee() {
  const name = newRefereeName.value.trim()
  if (!name) return
  const phone = parsePhone(newRefereePhone.value)
  if (newRefereePhone.value && !phone) {
    showToast('Telefonnummer må være 8 sifre', 'error')
    return
  }
  await addReferee(name, phone)
  showToast(`${name} lagt til`, 'success')
  newRefereeName.value = ''
  newRefereePhone.value = ''
  showAddReferee.value = false
}

async function confirmDeleteReferee() {
  if (!refereeToDelete.value) return
  const name = refereeToDelete.value.name
  await deleteReferee(refereeToDelete.value.id)
  refereeToDelete.value = null
  showToast(`${name} slettet`, 'success')
}

function confirmLogout() {
  showLogoutDialog.value = false
  logout()
  router.push('/login')
}
</script>

<template>
  <div class="desktop-container">
    <div class="page-header">
      <h1 class="page-header__title">Mer</h1>
    </div>

    <!-- ═══ IMPORT SECTION ═══ -->
    <div class="px-lg mb-lg">
      <div class="ds-card">
        <h3 class="more-section__title">Last opp kampprogram</h3>

        <div v-if="!showPreview">
          <div
            :class="['file-drop', { 'file-drop--active': dragActive }]"
            @dragover="onDragOver"
            @dragleave="onDragLeave"
            @drop="onDrop"
            @click="$refs.fileInput.click()"
          >
            <div class="file-drop__icon">
              <img src="/illustrations/file.png" alt="" style="width: 80px; height: 80px; object-fit: contain; display: block; margin: 0 auto;" />
            </div>
            <p class="file-drop__text">Dra fil hit eller tap for å velge</p>
            <p class="file-drop__hint">Støtter .xlsx, .xls og .csv</p>
          </div>
          <input
            ref="fileInput"
            type="file"
            accept=".xlsx,.xls,.csv"
            style="display: none;"
            @change="onFileSelect"
          />
        </div>

        <!-- Preview -->
        <div v-else>
          <div class="ds-alert ds-alert--info mb-md">
            {{ parsedMatches.length }} kamper funnet i filen.
            <template v-if="detectedSeason">
              Sesong: <strong>{{ detectedSeason }}</strong>
            </template>
          </div>

          <div style="overflow-x: auto; margin-bottom: 16px;">
            <table class="preview-table">
              <thead>
                <tr>
                  <th>Dato</th>
                  <th>Tid</th>
                  <th>Hjemmelag</th>
                  <th>Bortelag</th>
                  <th>Avd</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(m, i) in parsedMatches.slice(0, 10)" :key="i">
                  <td>{{ m.match_date }}</td>
                  <td>{{ m.match_time }}</td>
                  <td>{{ m.home_team }}</td>
                  <td>{{ m.away_team }}</td>
                  <td>{{ m.division }}</td>
                </tr>
                <tr v-if="parsedMatches.length > 10">
                  <td colspan="5" style="text-align: center; color: var(--ds-color-text-tertiary);">
                    ...og {{ parsedMatches.length - 10 }} til
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="ds-flex ds-gap-sm">
            <button class="ds-btn ds-btn--secondary" @click="showPreview = false; parsedMatches = []">Avbryt</button>
            <button class="ds-btn ds-btn--primary" :disabled="importing" @click="confirmImport">
              {{ importing ? 'Importerer...' : `Importer ${parsedMatches.length} kamper` }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ ADD MATCH (expandable) ═══ -->
    <div class="px-lg mb-lg">
      <button v-if="!showAddMatch" class="more-action-row" @click="showAddMatch = true">
        <span class="more-action-row__icon more-action-row__icon--accent">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </span>
        <span class="more-action-row__label">Legg til kamp manuelt</span>
        <svg class="more-action-row__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>

      <div v-else class="ds-card ds-card--compact">
        <div class="ds-flex ds-flex--between" style="margin-bottom: 16px; align-items: center;">
          <h3 class="more-section__title" style="margin: 0;">Ny kamp</h3>
          <button class="more-close-btn" @click="showAddMatch = false">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="ds-form-row">
          <div class="ds-form-group">
            <label class="ds-label">Dato</label>
            <input v-model="newMatch.match_date" type="date" class="ds-input" />
          </div>
          <div class="ds-form-group">
            <label class="ds-label">Tid</label>
            <input v-model="newMatch.match_time" type="time" class="ds-input" />
          </div>
        </div>
        <div class="ds-form-group">
          <label class="ds-label">Hjemmelag</label>
          <input v-model="newMatch.home_team" class="ds-input" placeholder="f.eks. Halsen Grønn" />
        </div>
        <div class="ds-form-group">
          <label class="ds-label">Bortelag</label>
          <input v-model="newMatch.away_team" class="ds-input" placeholder="f.eks. Falk Blå" />
        </div>
        <div class="ds-form-row">
          <div class="ds-form-group">
            <label class="ds-label ds-label--optional">Avdeling</label>
            <input v-model="newMatch.division" class="ds-input" placeholder="f.eks. Avd 3" />
          </div>
          <div class="ds-form-group">
            <label class="ds-label ds-label--optional">Runde</label>
            <input v-model="newMatch.round" class="ds-input" placeholder="f.eks. 2" />
          </div>
        </div>
        <button class="ds-btn ds-btn--primary" @click="handleAddMatch">Legg til kamp</button>
      </div>
    </div>

    <!-- ═══ SEASONS ═══ -->
    <div class="px-lg mb-lg">
      <div class="more-section-label">Sesong</div>

      <div class="ds-card ds-card--compact">
        <!-- Active season summary -->
        <div v-if="activeSeason" class="more-season-active">
          <div>
            <div class="more-season-active__name">{{ activeSeason.name }}</div>
            <div class="more-season-active__meta">
              {{ matches.length }} kamper
              <template v-if="activeSeason.status === 'settled'"> &middot; avsluttet</template>
            </div>
          </div>
          <span class="ds-badge" :class="activeSeason.status === 'settled' ? 'ds-badge--success' : 'ds-badge--accent'">
            {{ activeSeason.status === 'settled' ? 'Avsluttet' : 'Aktiv' }}
          </span>
        </div>

        <!-- Other seasons (only if more than 1) -->
        <div v-if="seasons.length > 1" class="more-season-list">
          <div class="more-season-list__label">Bytt sesong</div>
          <button
            v-for="s in seasons.filter(s => s.id !== activeSeason?.id)"
            :key="s.id"
            class="more-season-item"
            @click="switchSeason(s.id)"
          >
            <span>{{ s.name }}</span>
            <span v-if="s.status === 'settled'" class="ds-badge ds-badge--subtle" style="font-size: 0.65rem;">Avsluttet</span>
          </button>
        </div>

        <!-- New season -->
        <div v-if="showNewSeason" class="more-season-new">
          <div class="ds-flex ds-gap-sm">
            <input v-model="newSeasonName" class="ds-input" placeholder="f.eks. Høst 2025" @keydown.enter="handleCreateSeason" />
            <button class="ds-btn ds-btn--primary" @click="handleCreateSeason">Opprett</button>
          </div>
        </div>

        <button class="more-inline-action" @click="showNewSeason = !showNewSeason">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {{ showNewSeason ? 'Avbryt' : 'Ny sesong' }}
        </button>
      </div>
    </div>

    <!-- ═══ DOMMERE ═══ -->
    <div class="px-lg mb-lg">
      <div class="more-section-label">Dommere</div>

      <div class="ds-card ds-card--compact">
        <div v-if="referees.length === 0 && !showAddReferee" class="referee-empty">
          Ingen dommere registrert.
        </div>

        <div v-else class="referee-list">
          <div v-for="r in referees" :key="r.id" class="referee-row">
            <template v-if="editingRefereeId === r.id">
              <div class="referee-row__edit">
                <input v-model="editRefereeName" class="ds-input" placeholder="Navn" />
                <input v-model="editRefereePhone" class="ds-input" placeholder="8-sifret nummer" inputmode="numeric" />
                <div class="ds-flex ds-gap-sm" style="margin-top: 8px;">
                  <button class="ds-btn ds-btn--secondary ds-btn--sm" @click="cancelEditReferee">Avbryt</button>
                  <button class="ds-btn ds-btn--primary ds-btn--sm" @click="saveEditReferee">Lagre</button>
                  <button class="referee-row__delete" @click="refereeToDelete = r" aria-label="Slett dommer">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                  </button>
                </div>
              </div>
            </template>
            <template v-else>
              <button class="referee-row__main" @click="startEditReferee(r)">
                <div class="referee-row__name">{{ r.name }}</div>
                <div class="referee-row__phone">
                  <template v-if="r.phone">{{ formatPhone(r.phone) }}</template>
                  <template v-else><span class="referee-row__phone--missing">Ingen telefon</span></template>
                </div>
                <svg class="referee-row__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </template>
          </div>
        </div>

        <div v-if="showAddReferee" class="referee-add-form">
          <input v-model="newRefereeName" class="ds-input" placeholder="Navn" @keydown.enter="handleAddReferee" />
          <input v-model="newRefereePhone" class="ds-input" placeholder="8-sifret nummer (valgfritt)" inputmode="numeric" @keydown.enter="handleAddReferee" />
          <div class="ds-flex ds-gap-sm" style="margin-top: 8px;">
            <button class="ds-btn ds-btn--secondary ds-btn--sm" @click="showAddReferee = false; newRefereeName = ''; newRefereePhone = ''">Avbryt</button>
            <button class="ds-btn ds-btn--primary ds-btn--sm" @click="handleAddReferee">Legg til</button>
          </div>
        </div>

        <button v-else class="more-inline-action" @click="showAddReferee = true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Ny dommer
        </button>
      </div>
    </div>

    <!-- ═══ KONTO ═══ -->
    <div class="px-lg mb-lg">
      <div class="more-section-label">Konto</div>

      <div class="more-account-card">
        <div class="more-account-card__avatar">
          <img v-if="coachImage" :src="coachImage" :alt="coach.name" class="more-account-card__avatar-img" />
          <template v-else>{{ coach?.name?.charAt(0) }}</template>
        </div>
        <div class="more-account-card__info">
          <div class="more-account-card__name">{{ coach?.name }}</div>
          <button class="more-account-card__logout" @click="showLogoutDialog = true">Logg ut</button>
        </div>
      </div>
    </div>

    <!-- ═══ DANGER ZONE ═══ -->
    <div v-if="matches.length > 0" class="px-lg mb-lg">
      <div class="more-danger-zone">
        <button class="more-danger-btn" @click="showDeleteAllDialog = true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          Slett alle {{ matches.length }} kamper i {{ activeSeason?.name }}
        </button>
      </div>
    </div>

    <!-- Spacer for bottom nav -->
    <div style="height: 24px;"></div>

    <ConfirmDialog
      :show="showDeleteAllDialog"
      title="Slett alle kamper?"
      :message="`Er du sikker på at du vil slette alle ${matches.length} kamper i ${activeSeason?.name}? Dette kan ikke angres.`"
      confirm-label="Slett alle"
      variant="warning"
      @confirm="confirmDeleteAll"
      @cancel="showDeleteAllDialog = false"
    />

    <ConfirmDialog
      :show="showLogoutDialog"
      title="Logg ut?"
      message="Du kan logge inn igjen med PIN-koden din."
      confirm-label="Logg ut"
      variant="warning"
      @confirm="confirmLogout"
      @cancel="showLogoutDialog = false"
    />

    <ConfirmDialog
      :show="!!refereeToDelete"
      title="Slett dommer?"
      :message="`Er du sikker på at du vil slette ${refereeToDelete?.name}?`"
      confirm-label="Slett"
      variant="warning"
      @confirm="confirmDeleteReferee"
      @cancel="refereeToDelete = null"
    />
  </div>
</template>

<style scoped>
/* Section title */
.more-section__title {
  font-family: var(--ds-font-heading);
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 16px;
}

/* Section label (small uppercase) */
.more-section-label {
  font-size: var(--ds-text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ds-color-text-tertiary);
  padding: 0 4px;
  margin-bottom: 8px;
}

/* Action row (tappable list item) */
.more-action-row {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 16px 20px;
  background: var(--ds-color-bg-elevated);
  border: var(--ds-border-width) solid var(--ds-color-border);
  border-radius: var(--ds-radius-lg);
  cursor: pointer;
  transition: all 0.15s var(--ds-ease-default);
  text-align: left;
}
.more-action-row:hover {
  transform: translate(-2px, -2px);
  box-shadow: var(--ds-shadow-md);
}
.more-action-row:active {
  transform: translate(1px, 1px);
  box-shadow: none;
}
.more-action-row__icon {
  width: 36px;
  height: 36px;
  border-radius: var(--ds-radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.more-action-row__icon--accent {
  background: var(--ds-color-accent-light);
  color: var(--ds-color-accent);
}
.more-action-row__label {
  flex: 1;
  font-weight: 500;
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-primary);
}
.more-action-row__chevron {
  color: var(--ds-color-text-tertiary);
  flex-shrink: 0;
}

/* Close button for expanded sections */
.more-close-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--ds-radius-sm);
  border: none;
  background: var(--ds-color-bg-subtle);
  color: var(--ds-color-text-secondary);
  cursor: pointer;
  transition: background 0.15s;
}
.more-close-btn:hover {
  background: var(--ds-color-border-light);
}

/* Season active card */
.more-season-active {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 16px;
}
.more-season-active__name {
  font-weight: 600;
  font-size: var(--ds-text-base);
  font-family: var(--ds-font-heading);
}
.more-season-active__meta {
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-tertiary);
  margin-top: 2px;
}

/* Season list */
.more-season-list {
  border-top: 1px solid var(--ds-color-border-light);
  padding-top: 12px;
  margin-bottom: 12px;
}
.more-season-list__label {
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-tertiary);
  margin-bottom: 8px;
}
.more-season-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 12px;
  background: var(--ds-color-bg-subtle);
  border: 1px solid transparent;
  border-radius: var(--ds-radius-sm);
  cursor: pointer;
  font-size: var(--ds-text-sm);
  font-weight: 500;
  color: var(--ds-color-text-primary);
  transition: all 0.15s;
  text-align: left;
}
.more-season-item + .more-season-item {
  margin-top: 6px;
}
.more-season-item:hover {
  background: var(--ds-color-accent-light);
  border-color: var(--ds-color-accent);
  color: var(--ds-color-accent);
}

/* New season form area */
.more-season-new {
  border-top: 1px solid var(--ds-color-border-light);
  padding-top: 12px;
  margin-bottom: 12px;
}

/* Inline action link */
.more-inline-action {
  display: flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: none;
  color: var(--ds-color-accent);
  font-size: var(--ds-text-xs);
  font-weight: 600;
  cursor: pointer;
  padding: 8px 0 0;
  border-top: 1px solid var(--ds-color-border-light);
  width: 100%;
  transition: opacity 0.15s;
}
.more-inline-action:hover {
  opacity: 0.7;
}

/* Referee admin */
.referee-empty {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-tertiary);
  text-align: center;
  padding: 12px 0 16px;
}

.referee-list {
  margin-bottom: 4px;
}

.referee-row {
  border-bottom: 1px solid var(--ds-color-border-light);
}

.referee-row:last-child {
  border-bottom: none;
}

.referee-row__main {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 4px;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  -webkit-tap-highlight-color: transparent;
}

.referee-row__main:hover {
  background: var(--ds-color-bg-elevated);
  border-radius: 6px;
}

.referee-row__name {
  font-size: var(--ds-text-sm);
  font-weight: 600;
  color: var(--ds-color-text-primary);
  flex: 1;
}

.referee-row__phone {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
  font-variant-numeric: tabular-nums;
}

.referee-row__phone--missing {
  color: var(--ds-color-text-tertiary);
  font-style: italic;
}

.referee-row__chevron {
  color: var(--ds-color-text-tertiary);
  flex-shrink: 0;
}

.referee-row__edit {
  padding: 8px 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.referee-row__delete {
  margin-left: auto;
  background: none;
  border: none;
  color: var(--ds-color-error);
  cursor: pointer;
  padding: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.referee-add-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 0 8px;
  border-top: 1px solid var(--ds-color-border-light);
}

/* Account card */
.more-account-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 20px;
  background: var(--ds-color-bg-elevated);
  border: var(--ds-border-width) solid var(--ds-color-border);
  border-radius: var(--ds-radius-lg);
}
.more-account-card__avatar {
  width: 40px;
  height: 40px;
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-accent);
  color: var(--ds-color-accent-text);
  font-weight: 700;
  font-size: var(--ds-text-base);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-family: var(--ds-font-heading);
}
.more-account-card__avatar-img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}
.more-account-card__info {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.more-account-card__name {
  font-weight: 600;
  font-size: var(--ds-text-sm);
}
.more-account-card__logout {
  border: none;
  background: none;
  color: var(--ds-color-text-tertiary);
  font-size: var(--ds-text-xs);
  font-weight: 500;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--ds-radius-sm);
  transition: all 0.15s;
}
.more-account-card__logout:hover {
  color: var(--ds-color-error);
  background: var(--ds-color-error-light);
}

/* Danger zone */
.more-danger-zone {
  text-align: center;
  padding: 4px 0;
}
.more-danger-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: none;
  color: var(--ds-color-text-tertiary);
  font-size: var(--ds-text-xs);
  font-weight: 500;
  cursor: pointer;
  padding: 8px 16px;
  border-radius: var(--ds-radius-sm);
  transition: all 0.15s;
}
.more-danger-btn:hover {
  color: var(--ds-color-error);
  background: var(--ds-color-error-light);
}
</style>
