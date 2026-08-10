<script setup>
import { ref, computed, onMounted } from 'vue'
import { useSeasons } from '../composables/useSeasons'
import { useMatches } from '../composables/useMatches'
import { useExpenses } from '../composables/useExpenses'
import { useToast } from '../composables/useToast'
import { parseMatchFile, detectSeasonName } from '../lib/excelParser'
import { isHalsen } from '../lib/matchMeta'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import Sheet from '../components/Sheet.vue'

const { seasons, activeSeason, viewingSeason, fetchSeasons, createSeason, setViewingSeason } = useSeasons()
const { matches, fetchMatches, bulkAddMatches, addMatch, updateMatch, deleteAllMatches, backfillDefaultCoaches } = useMatches()
const { fetchExpenses } = useExpenses()
const { show: showToast } = useToast()

const fileInput = ref(null)
const loading = ref(false)
const dragActive = ref(false)
const parsedMatches = ref([])
const skippedForeign = ref(0)
const showPreview = ref(false)
const importing = ref(false)
const detectedSeason = ref(null)

const newSeasonName = ref('')
const showNewSeason = ref(false)

const showAddMatch = ref(false)
const newMatch = ref({
  match_date: '',
  match_time: '',
  home_team: '',
  away_team: '',
  division: '',
  round: ''
})

const showDeleteAllDialog = ref(false)
const deleting = ref(false)

const editingMatch = ref(null)
const editDateInput = ref('')
const editTimeInput = ref('')

onMounted(async () => {
  await fetchSeasons()
  if (viewingSeason.value) {
    await fetchMatches(viewingSeason.value.id)
  }
})

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

    // Serieoppsettet fra kretsen inneholder hele avdelingen. Bare kamper der
    // et Halsen-lag faktisk spiller skal inn — resten er andre lags kamper.
    const ours = result.filter(m => isHalsen(m.home_team) || isHalsen(m.away_team))
    skippedForeign.value = result.length - ours.length

    if (ours.length === 0) {
      loading.value = false
      showToast('Fant ingen Halsen-kamper i filen', 'error')
      return
    }

    parsedMatches.value = ours
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

  let targetSeason = viewingSeason.value
  if (detectedSeason.value) {
    const existing = seasons.value.find(s => s.name === detectedSeason.value)
    if (existing) {
      targetSeason = existing
      setViewingSeason(existing.id)
    } else {
      targetSeason = await createSeason(detectedSeason.value)
    }
  }

  if (!targetSeason) {
    showToast('Ingen sesong valgt', 'error')
    importing.value = false
    return
  }

  await fetchMatches(targetSeason.id)

  // Postgres gir tid som «17:30:00», parseren som «17:30» — uten hh:mm-kutt
  // matcher aldri to like kamper, og samme fil importert to ganger dobler alt.
  const hhmm = t => (t || '').slice(0, 5)

  const matchData = parsedMatches.value
    .map(m => ({ ...m, season_id: targetSeason.id }))
    .filter(m => !matches.value.some(existing =>
      existing.match_date === m.match_date &&
      hhmm(existing.match_time) === hhmm(m.match_time) &&
      existing.home_team === m.home_team &&
      existing.away_team === m.away_team
    ))

  if (matchData.length === 0) {
    showToast('Alle kamper finnes allerede i sesongen', 'info')
    showPreview.value = false
    parsedMatches.value = []
    skippedForeign.value = 0
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
  skippedForeign.value = 0
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

function cancelNewSeason() {
  showNewSeason.value = false
  newSeasonName.value = ''
}

async function switchSeason(seasonId) {
  setViewingSeason(seasonId)
  await fetchMatches(seasonId)
  await fetchExpenses(matches.value.map(m => m.id))
  showToast(`Byttet til ${viewingSeason.value?.name}`, 'success')
}

const backfilling = ref(false)

async function handleBackfillCoaches() {
  if (!viewingSeason.value || backfilling.value) return
  backfilling.value = true
  const updated = await backfillDefaultCoaches(viewingSeason.value.id)
  backfilling.value = false
  showToast(
    updated > 0
      ? `Standardtrenere satt på ${updated} kamp${updated === 1 ? '' : 'er'}`
      : 'Alle kamper har allerede trenere',
    'success'
  )
}

async function handleAddMatch() {
  if (!newMatch.value.home_team || !newMatch.value.away_team || !newMatch.value.match_date) return
  await addMatch({
    ...newMatch.value,
    season_id: viewingSeason.value.id,
    fee_amount: 200
  })
  showToast('Kamp lagt til', 'success')
  cancelAddMatch()
}

function cancelAddMatch() {
  showAddMatch.value = false
  newMatch.value = { match_date: '', match_time: '', home_team: '', away_team: '', division: '', round: '' }
}

async function confirmDeleteAll() {
  if (!viewingSeason.value) return
  deleting.value = true
  await deleteAllMatches(viewingSeason.value.id)
  showDeleteAllDialog.value = false
  deleting.value = false
  showToast('Alle kamper slettet', 'success')
}

function openEditDateTime(match) {
  editingMatch.value = match
  editDateInput.value = match.match_date || ''
  editTimeInput.value = (match.match_time || '').substring(0, 5)
}

function cancelEditDateTime() {
  editingMatch.value = null
}

const isDateTimeChanged = computed(() => {
  if (!editingMatch.value) return false
  const currentDate = editingMatch.value.match_date || ''
  const currentTime = (editingMatch.value.match_time || '').substring(0, 5)
  return editDateInput.value !== currentDate || editTimeInput.value !== currentTime
})

async function saveDateTime() {
  if (!editingMatch.value || !editDateInput.value || !isDateTimeChanged.value) return
  const newDate = editDateInput.value
  const newTime = editTimeInput.value || null
  const weekday = new Date(newDate + 'T12:00:00').toLocaleDateString('nb-NO', { weekday: 'long' })
  const updates = {
    match_date: newDate,
    match_time: newTime,
    match_day: weekday,
  }
  await updateMatch(editingMatch.value.id, updates)
  if (viewingSeason.value) await fetchMatches(viewingSeason.value.id)
  editingMatch.value = null
  showToast('Tidspunkt oppdatert', 'success')
}

function formatMatchDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short' })
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
      <h1 class="page-header__title">Sesong & kampprogram</h1>
    </div>

    <!-- ═══ SESONG ═══ -->
    <div class="px-lg mb-lg">
      <div class="section-label">Sesong</div>
      <div class="ds-card ds-card--compact">
        <div v-if="viewingSeason" class="season-active">
          <div>
            <div class="season-active__name">{{ viewingSeason.name }}</div>
            <div class="season-active__meta">
              {{ matches.length }} kamper
              <template v-if="viewingSeason.status === 'settled'"> · avsluttet</template>
            </div>
          </div>
          <span v-if="viewingSeason.status === 'settled'" class="ds-badge ds-badge--success">Avsluttet</span>
          <span v-else-if="viewingSeason.id === activeSeason?.id" class="ds-badge ds-badge--accent">Aktiv</span>
        </div>

        <div v-if="seasons.length > 1" class="season-list">
          <div class="season-list__label">Bytt sesong</div>
          <button
            v-for="s in seasons.filter(s => s.id !== viewingSeason?.id)"
            :key="s.id"
            class="season-item"
            @click="switchSeason(s.id)"
          >
            <span>{{ s.name }}</span>
            <span v-if="s.status === 'settled'" class="ds-badge ds-badge--subtle" style="font-size: 0.65rem;">Avsluttet</span>
          </button>
        </div>

        <button class="inline-action" @click="showNewSeason = true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Ny sesong
        </button>
      </div>
    </div>

    <!-- ═══ IMPORT ═══ -->
    <div class="px-lg mb-lg">
      <div class="section-label">Last opp kampprogram</div>
      <div class="ds-card">
        <div v-if="!showPreview">
          <div
            :class="['file-drop', { 'file-drop--active': dragActive }]"
            @dragover="onDragOver"
            @dragleave="onDragLeave"
            @drop="onDrop"
            @click="fileInput?.click()"
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

        <div v-else>
          <div class="ds-alert ds-alert--info mb-md">
            {{ parsedMatches.length }} Halsen-kamper funnet i filen.
            <template v-if="skippedForeign">
              {{ skippedForeign }} kamper for andre lag utelates.
            </template>
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

    <!-- ═══ ADD MATCH ═══ -->
    <div class="px-lg mb-lg">
      <button class="action-row" @click="showAddMatch = true">
        <span class="action-row__icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </span>
        <span class="action-row__label">Legg til kamp manuelt</span>
        <svg class="action-row__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>

    <!-- ═══ BACKFILL TRENERE ═══ -->
    <div v-if="matches.length > 0" class="px-lg mb-lg">
      <button class="action-row" :disabled="backfilling" @click="handleBackfillCoaches">
        <span class="action-row__icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 10-16 0"/></svg>
        </span>
        <span class="action-row__label">{{ backfilling ? 'Setter trenere…' : 'Sett standardtrenere på kamper uten' }}</span>
        <svg class="action-row__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>

    <!-- ═══ MATCH LIST ═══ -->
    <div v-if="matches.length > 0" class="px-lg mb-lg">
      <div class="section-label">Kamper i {{ viewingSeason?.name }}</div>
      <div class="ds-card ds-card--compact match-list-card">
        <div
          v-for="m in matches"
          :key="m.id"
          class="match-row"
        >
          <div class="match-row__when">
            <span class="match-row__date">{{ formatMatchDate(m.match_date) }}</span>
            <span
              v-if="m.match_time && m.match_time.substring(0, 5) !== '00:00'"
              class="match-row__time"
            >{{ m.match_time.substring(0, 5) }}</span>
          </div>
          <div class="match-row__teams">
            <span class="match-row__team">{{ m.home_team }}</span>
            <span class="match-row__vs">vs</span>
            <span class="match-row__team">{{ m.away_team }}</span>
          </div>
          <button
            type="button"
            class="match-row__edit"
            aria-label="Endre tidspunkt"
            @click="openEditDateTime(m)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- ═══ DANGER ZONE ═══ -->
    <div v-if="matches.length > 0" class="px-lg mb-lg">
      <div class="danger-zone">
        <button class="danger-btn" @click="showDeleteAllDialog = true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          Slett alle {{ matches.length }} kamper i {{ viewingSeason?.name }}
        </button>
      </div>
    </div>

    <Sheet :show="showNewSeason" title="Ny sesong" @close="cancelNewSeason">
      <div class="ds-form-group">
        <label class="ds-label">Sesongnavn</label>
        <input v-model="newSeasonName" class="ds-input" placeholder="f.eks. Høst 2025" @keydown.enter="handleCreateSeason" />
      </div>
      <div class="sheet-actions">
        <button class="ds-btn ds-btn--secondary" @click="cancelNewSeason">Avbryt</button>
        <button class="ds-btn ds-btn--primary" :disabled="!newSeasonName.trim()" @click="handleCreateSeason">Opprett</button>
      </div>
    </Sheet>

    <Sheet :show="showAddMatch" title="Ny kamp" @close="cancelAddMatch">
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
      <div class="sheet-actions">
        <button class="ds-btn ds-btn--secondary" @click="cancelAddMatch">Avbryt</button>
        <button class="ds-btn ds-btn--primary" @click="handleAddMatch">Legg til kamp</button>
      </div>
    </Sheet>

    <Sheet
      :show="!!editingMatch"
      :title="editingMatch ? `${editingMatch.home_team} vs ${editingMatch.away_team}` : ''"
      @close="cancelEditDateTime"
    >
      <div class="ds-form-row">
        <div class="ds-form-group">
          <label class="ds-label">Dato</label>
          <input v-model="editDateInput" type="date" class="ds-input" />
        </div>
        <div class="ds-form-group">
          <label class="ds-label">Tid</label>
          <input v-model="editTimeInput" type="time" class="ds-input" />
        </div>
      </div>
      <div class="sheet-actions">
        <button class="ds-btn ds-btn--secondary" @click="cancelEditDateTime">Avbryt</button>
        <button
          class="ds-btn ds-btn--primary"
          :disabled="!editDateInput || !isDateTimeChanged"
          @click="saveDateTime"
        >
          Lagre
        </button>
      </div>
    </Sheet>

    <ConfirmDialog
      :show="showDeleteAllDialog"
      title="Slett alle kamper?"
      :message="`Er du sikker på at du vil slette alle ${matches.length} kamper i ${viewingSeason?.name}? Dette kan ikke angres.`"
      confirm-label="Slett alle"
      variant="warning"
      @confirm="confirmDeleteAll"
      @cancel="showDeleteAllDialog = false"
    />
  </div>
</template>

<style scoped>
.section-label {
  font-size: var(--ds-text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ds-color-text-tertiary);
  padding: 0 4px;
  margin-bottom: 8px;
}

.season-active {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 16px;
}
.season-active__name {
  font-weight: 600;
  font-size: var(--ds-text-base);
  font-family: var(--ds-font-heading);
}
.season-active__meta {
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-tertiary);
  margin-top: 2px;
}

.season-list {
  border-top: 1px solid var(--ds-color-border-light);
  padding-top: 12px;
  margin-bottom: 12px;
}
.season-list__label {
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-tertiary);
  margin-bottom: 8px;
}
.season-item {
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
.season-item + .season-item {
  margin-top: 6px;
}
.season-item:hover {
  background: var(--ds-color-accent-light);
  border-color: var(--ds-color-accent);
  color: var(--ds-color-accent);
}

.inline-action {
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
.inline-action:hover {
  opacity: 0.7;
}

.action-row {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 14px 16px;
  background: var(--ds-color-bg-elevated);
  border: var(--ds-border-width) solid var(--ds-color-border);
  border-radius: var(--ds-radius-lg);
  cursor: pointer;
  transition: all 0.15s var(--ds-ease-default);
  text-align: left;
}
.action-row:hover {
  transform: translate(-2px, -2px);
  box-shadow: var(--ds-shadow-md);
}
.action-row:active {
  transform: translate(1px, 1px);
  box-shadow: none;
}
.action-row__icon {
  width: 36px;
  height: 36px;
  border-radius: var(--ds-radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: var(--ds-color-accent-light);
  color: var(--ds-color-accent);
}
.action-row__label {
  flex: 1;
  font-weight: 500;
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-primary);
}
.action-row__chevron {
  color: var(--ds-color-text-tertiary);
  flex-shrink: 0;
}

.danger-zone {
  text-align: center;
  padding: 4px 0;
}
.danger-btn {
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
.danger-btn:hover {
  color: var(--ds-color-error);
  background: var(--ds-color-error-light);
}

.sheet-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: var(--ds-space-lg);
}

.match-list-card {
  padding: 4px 0;
}

.match-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--ds-radius-sm);
  transition: background 0.15s;
}

.match-row + .match-row {
  border-top: 1px solid var(--ds-color-border-light);
}

.match-row:hover {
  background: var(--ds-color-bg-subtle);
}

.match-row__when {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  width: 110px;
  font-variant-numeric: tabular-nums;
}

.match-row__date {
  font-size: var(--ds-text-xs);
  font-weight: 600;
  color: var(--ds-color-text-primary);
}

.match-row__time {
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-tertiary);
  margin-top: 1px;
}

.match-row__teams {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--ds-text-sm);
  min-width: 0;
}

.match-row__team {
  font-weight: 500;
  color: var(--ds-color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.match-row__vs {
  font-size: 0.6875rem;
  color: var(--ds-color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}

.match-row__edit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--ds-color-text-tertiary);
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
  -webkit-tap-highlight-color: transparent;
}

.match-row__edit:hover {
  background: var(--ds-color-bg-elevated);
  color: var(--ds-color-accent);
}

.match-row__edit svg {
  width: 14px;
  height: 14px;
}

@media (max-width: 480px) {
  .match-row__teams {
    flex-direction: column;
    align-items: flex-start;
    gap: 0;
  }
  .match-row__vs {
    display: none;
  }
}
</style>
