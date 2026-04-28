<script setup>
import { ref, onMounted } from 'vue'
import { useReferees } from '../composables/useReferees'
import { useToast } from '../composables/useToast'
import { formatPhone, parsePhone } from '../lib/phone'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import Sheet from '../components/Sheet.vue'

const { referees, fetchReferees, addReferee, updateReferee, deleteReferee } = useReferees()
const { show: showToast } = useToast()

const editingReferee = ref(null)
const editRefereeName = ref('')
const editRefereePhone = ref('')
const showAddReferee = ref(false)
const newRefereeName = ref('')
const newRefereePhone = ref('')
const refereeToDelete = ref(null)

onMounted(async () => {
  await fetchReferees()
})

function startEditReferee(r) {
  editingReferee.value = r
  editRefereeName.value = r.name
  editRefereePhone.value = formatPhone(r.phone) || r.phone || ''
}

function cancelEditReferee() {
  editingReferee.value = null
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
  await updateReferee(editingReferee.value.id, { name, phone })
  showToast('Dommer oppdatert', 'success')
  cancelEditReferee()
}

function cancelAddReferee() {
  showAddReferee.value = false
  newRefereeName.value = ''
  newRefereePhone.value = ''
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
  cancelAddReferee()
}

async function confirmDeleteReferee() {
  if (!refereeToDelete.value) return
  const name = refereeToDelete.value.name
  await deleteReferee(refereeToDelete.value.id)
  refereeToDelete.value = null
  cancelEditReferee()
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
      <h1 class="page-header__title">Dommere</h1>
    </div>

    <div class="px-lg mb-lg">
      <div class="ds-card ds-card--compact">
        <div v-if="referees.length === 0" class="referee-empty">
          Ingen dommere registrert.
        </div>

        <div v-else class="referee-list">
          <div v-for="r in referees" :key="r.id" class="referee-row">
            <button class="referee-row__main" @click="startEditReferee(r)">
              <div class="referee-row__name">{{ r.name }}</div>
              <div class="referee-row__phone">
                <template v-if="r.phone">{{ formatPhone(r.phone) }}</template>
                <template v-else><span class="referee-row__phone--missing">Ingen telefon</span></template>
              </div>
              <svg class="referee-row__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>

        <button class="more-inline-action" @click="showAddReferee = true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Ny dommer
        </button>
      </div>
    </div>

    <Sheet :show="showAddReferee" title="Ny dommer" @close="cancelAddReferee">
      <div class="ds-form-group">
        <label class="ds-label">Navn</label>
        <input v-model="newRefereeName" class="ds-input" placeholder="Dommerens navn" @keydown.enter="handleAddReferee" />
      </div>
      <div class="ds-form-group">
        <label class="ds-label ds-label--optional">Telefon</label>
        <input v-model="newRefereePhone" class="ds-input" placeholder="8-sifret nummer" inputmode="numeric" @keydown.enter="handleAddReferee" />
      </div>
      <div class="sheet-actions">
        <button class="ds-btn ds-btn--secondary" @click="cancelAddReferee">Avbryt</button>
        <button class="ds-btn ds-btn--primary" :disabled="!newRefereeName.trim()" @click="handleAddReferee">Legg til</button>
      </div>
    </Sheet>

    <Sheet :show="!!editingReferee" title="Rediger dommer" @close="cancelEditReferee">
      <div class="ds-form-group">
        <label class="ds-label">Navn</label>
        <input v-model="editRefereeName" class="ds-input" placeholder="Navn" />
      </div>
      <div class="ds-form-group">
        <label class="ds-label ds-label--optional">Telefon</label>
        <input v-model="editRefereePhone" class="ds-input" placeholder="8-sifret nummer" inputmode="numeric" />
      </div>
      <div class="sheet-actions sheet-actions--with-delete">
        <button class="sheet-actions__delete" @click="refereeToDelete = editingReferee" aria-label="Slett dommer">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
        </button>
        <button class="ds-btn ds-btn--secondary" @click="cancelEditReferee">Avbryt</button>
        <button class="ds-btn ds-btn--primary" @click="saveEditReferee">Lagre</button>
      </div>
    </Sheet>

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
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}

.referee-row__phone--missing {
  color: var(--ds-color-text-tertiary);
  font-style: italic;
}

.referee-row__chevron {
  color: var(--ds-color-text-tertiary);
  flex-shrink: 0;
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
