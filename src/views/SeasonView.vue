<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAuth } from '../stores/auth'
import { useSeasons } from '../composables/useSeasons'
import { useMatches } from '../composables/useMatches'
import { useExpenses } from '../composables/useExpenses'
import { useCoaches } from '../composables/useCoaches'
import { useToast } from '../composables/useToast'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { exportSeasonToExcel } from '../lib/excelExport'

const { coach: currentCoach } = useAuth()
const { seasons, activeSeason, fetchSeasons, settleSeason } = useSeasons()
const { matches, fetchMatches, getCoachesForMatch } = useMatches()
const { expenses, fetchExpenses, getSettlement } = useExpenses()
const { coaches, fetchCoaches } = useCoaches()
const { show: showToast } = useToast()

const loading = ref(true)
const showSettleDialog = ref(false)

onMounted(async () => {
  await Promise.all([fetchSeasons(), fetchCoaches()])
  if (activeSeason.value) {
    await fetchMatches(activeSeason.value.id)
    await fetchExpenses(matches.value.map(m => m.id))
  }
  loading.value = false
})

const settlement = computed(() => {
  if (coaches.value.length === 0) return []
  return getSettlement(coaches.value).sort((a, b) => b.paid - a.paid)
})

const totalAmount = computed(() => expenses.value.reduce((s, e) => s + e.amount, 0))
const registeredCount = computed(() => expenses.value.length)
const isSettled = computed(() => activeSeason.value?.status === 'settled')

async function confirmSettle() {
  showSettleDialog.value = false
  if (activeSeason.value) {
    await settleSeason(activeSeason.value.id)
    showToast('Sesongen er avsluttet', 'success')
  }
}

function handleExport() {
  exportSeasonToExcel({
    seasonName: activeSeason.value?.name,
    matches: matches.value,
    expenses: expenses.value,
    coaches: coaches.value,
    getCoachesForMatch
  })
  showToast('Excel-fil lastet ned', 'success')
}
</script>

<template>
  <div class="desktop-container">
    <div class="page-header">
      <h1 class="page-header__title">Sesongoppgjør</h1>
      <p class="page-header__subtitle">{{ activeSeason?.name }}</p>
    </div>

    <div v-if="loading" style="text-align: center; padding: 48px 0;">
      <svg class="ds-anim-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--ds-color-accent)" stroke-width="2" stroke-linecap="round">
        <path d="M21 12a9 9 0 11-6.219-8.56"/>
      </svg>
    </div>

    <template v-else>
      <!-- Summary stats -->
      <div class="px-lg mb-lg">
        <div class="stat-row" style="grid-template-columns: repeat(2, 1fr);">
          <div class="stat-card">
            <div class="stat-card__value">{{ registeredCount }}</div>
            <div class="stat-card__label">Kamper</div>
          </div>
          <div class="stat-card">
            <div class="stat-card__value">{{ totalAmount }}</div>
            <div class="stat-card__label">Totalt kr</div>
          </div>
        </div>
      </div>

      <!-- Settled banner -->
      <div v-if="isSettled" class="px-lg mb-lg">
        <div class="ds-alert ds-alert--success">
          Denne sesongen er avsluttet. Oppgjøret ble gjort {{ new Date(activeSeason.settled_at).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' }) }}.
        </div>
      </div>

      <!-- Expense summary per coach -->
      <div class="px-lg mb-lg">
        <div class="ds-card">
          <div class="ds-flex ds-flex--between" style="align-items: flex-start; margin-bottom: 16px;">
            <h3 style="font-family: var(--ds-font-heading); font-size: 1rem; font-weight: 500;">Utlegg per trener</h3>
            <img src="/illustrations/accounting.png" alt="" class="section-illustration" />
          </div>

          <table class="settlement-table">
            <thead>
              <tr>
                <th>Trener</th>
                <th style="text-align: right;">Kamper</th>
                <th style="text-align: right;">Lagt ut</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in settlement" :key="s.coach.id" :class="{ 'settlement-row--me': s.coach.id === currentCoach?.id }">
                <td>
                  <span :style="s.coach.id === currentCoach?.id ? 'font-weight: 600;' : ''">{{ s.coach.name }}</span>
                </td>
                <td style="text-align: right;">
                  <span style="color: var(--ds-color-text-tertiary);">{{ s.matchesPaid }}</span>
                </td>
                <td style="text-align: right;">
                  <span class="settlement-amount">{{ s.paid }} kr</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Export button -->
      <div class="px-lg mb-lg">
        <button class="ds-btn ds-btn--secondary" style="width: 100%;" @click="handleExport">
          <svg style="width: 18px; height: 18px; margin-right: 6px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Eksporter til Excel
        </button>
      </div>

      <!-- Settle button -->
      <div v-if="!isSettled" class="px-lg mb-lg">
        <button class="ds-btn ds-btn--confirm" @click="showSettleDialog = true">
          Avslutt sesong
        </button>
      </div>

      <!-- Previous settled seasons -->
      <div v-if="seasons.filter(s => s.status === 'settled' && s.id !== activeSeason?.id).length > 0" class="px-lg mb-lg">
        <h3 style="font-family: var(--ds-font-heading); font-size: 1rem; font-weight: 500; margin-bottom: 12px; color: var(--ds-color-text-secondary);">Tidligere sesonger</h3>
        <div class="ds-stack--sm">
          <div v-for="s in seasons.filter(s => s.status === 'settled' && s.id !== activeSeason?.id)" :key="s.id" class="ds-card ds-card--compact">
            <div class="ds-flex ds-flex--between">
              <span style="font-weight: 500;">{{ s.name }}</span>
              <span class="ds-badge ds-badge--success">Avsluttet</span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <ConfirmDialog
      :show="showSettleDialog"
      title="Avslutt sesong?"
      :message="`Er du sikker på at du vil avslutte ${activeSeason?.name}? Oppgjøret låses og kan ikke endres etterpå.`"
      confirm-label="Ja, avslutt"
      variant="warning"
      @confirm="confirmSettle"
      @cancel="showSettleDialog = false"
    />
  </div>
</template>
