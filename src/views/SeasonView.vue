<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useAuth } from '../stores/auth'
import { useSeasons } from '../composables/useSeasons'
import { useFeatures } from '../composables/useFeatures'
import { useMatches } from '../composables/useMatches'
import { useExpenses } from '../composables/useExpenses'
import { useCoaches } from '../composables/useCoaches'
import { useToast } from '../composables/useToast'
import { supabase } from '../supabase'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import Skeleton from '../components/Skeleton.vue'
import AnimatedNumber from '../components/AnimatedNumber.vue'
import SeasonPicker from '../components/SeasonPicker.vue'
import { PLAYERS_ON_PITCH_OPTIONS } from '../lib/formations'
import { periodsFor } from '../lib/spillform'
import { useKullFormat } from '../composables/useKullFormat'
import BackLink from '../components/BackLink.vue'

const { coach: currentCoach, activeCohort, isAdmin, isCoach, isPlatformAdmin, refreshMember } = useAuth()
const { usesReferees } = useFeatures()
const clubShort = computed(() => activeCohort.value?.club_name?.split(' ')[0] || 'Klubben')
const { seasons, viewingSeason, ensureSeasons, settleSeason } = useSeasons()
const { matches, ensureMatches, getCoachesForMatch } = useMatches()
const { expenses, getSettlement } = useExpenses()
const { coaches, fetchCoaches } = useCoaches()
const { show: showToast } = useToast()

// Skeleton only on the very first load. Data persists across navigation.
const loading = ref(matches.value.length === 0)
const showSettleDialog = ref(false)

onMounted(async () => {
  // Utleggene kommer med sesongens kamper (én rundtur), så de hentes ikke
  // for seg. Svar under 30 s gamle gjenbrukes; hver skriving gjør dem gamle.
  const kjent = viewingSeason.value?.id || null
  await Promise.all([ensureSeasons(), fetchCoaches(), kjent ? ensureMatches(kjent) : null])
  if (viewingSeason.value && viewingSeason.value.id !== kjent) await ensureMatches(viewingSeason.value.id)
  loading.value = false
})

watch(viewingSeason, async (s) => {
  if (s) await ensureMatches(s.id)
})

const settlement = computed(() => {
  if (coaches.value.length === 0) return []
  return getSettlement(coaches.value).sort((a, b) => b.paid - a.paid)
})

const totalAmount = computed(() => expenses.value.reduce((s, e) => s + e.amount, 0))
const registeredCount = computed(() => expenses.value.length)
const isSettled = computed(() => viewingSeason.value?.status === 'settled')

// Bryteren for dommere bor her, ikke på Admin-forsida: det er dette
// oppgjøret den slår av og på. Kun admin — RLS sier det samme
// (admin_cohort_update), så en vanlig trener ville uansett fått 403.
const kanStyreKullet = computed(() => isAdmin.value || isPlatformAdmin.value)
const lagrerDommere = ref(false)

async function settDommere(pa) {
  const id = activeCohort.value?.id
  if (!id || pa === usesReferees.value || lagrerDommere.value) return
  lagrerDommere.value = true
  const { data, error } = await supabase
    .from('cohorts').update({ uses_referees: pa }).eq('id', id).select('id')
  lagrerDommere.value = false
  if (error || !data?.length) { showToast('Kunne ikke lagre', 'error'); return }
  await refreshMember()
  showToast(pa ? 'Dommere er på' : 'Dommere er av', 'success')
}

// Spillform og kamplengde. Satt på kullet, lest av kampmodus. Enhver trener
// kan endre den (bb_cohort_set_format); før migrasjonen er kjørt går det bare
// for admin, og da sier vi det i stedet for å late som det ble lagret.
const kanEndreFormat = computed(() => isCoach.value || isPlatformAdmin.value)
const { lagreFormat } = useKullFormat()
const format = ref({ players_on_pitch: 7, period_count: 2, period_minutes: 30 })
const lagrerFormat = ref(false)

function formatFraKullet() {
  const c = activeCohort.value
  format.value = {
    players_on_pitch: c?.players_on_pitch || 7,
    period_count: c?.period_count || 2,
    period_minutes: c?.period_minutes || 30
  }
}
watch(() => [activeCohort.value?.id, activeCohort.value?.players_on_pitch, activeCohort.value?.period_count, activeCohort.value?.period_minutes], formatFraKullet, { immediate: true })

const formatEndret = computed(() => {
  const c = activeCohort.value
  if (!c) return false
  return format.value.players_on_pitch !== (c.players_on_pitch || 7)
    || format.value.period_count !== (c.period_count || 2)
    || format.value.period_minutes !== (c.period_minutes || 30)
})


// Ny spillform tar med seg NFF-lengden for den. Justeres etterpå om kretsen
// eller turneringen sier noe annet.
function velgSpillform(n) {
  const [period_count, period_minutes] = periodsFor(n)
  format.value = { players_on_pitch: n, period_count, period_minutes }
}

function endreOmganger(d) {
  const v = format.value.period_count + d
  if (v >= 1 && v <= 4) format.value = { ...format.value, period_count: v }
}

function endreMinutter(d) {
  const v = format.value.period_minutes + d
  if (v >= 5 && v <= 45) format.value = { ...format.value, period_minutes: v }
}

async function lagreSpillform() {
  if (!formatEndret.value || lagrerFormat.value) return
  lagrerFormat.value = true
  const res = await lagreFormat(format.value)
  lagrerFormat.value = false
  if (!res.ok) {
    showToast(res.kunAdmin ? 'Bare admin kan endre dette ennå' : 'Kunne ikke lagre', 'error')
    return
  }
  showToast(`${format.value.players_on_pitch}er, ${format.value.period_count} × ${format.value.period_minutes} min`, 'success')
}

// My own owed-by-the-club balance for the active season
const myOwed = computed(() => {
  if (!currentCoach.value) return 0
  const me = settlement.value.find(s => s.coach.id === currentCoach.value.id)
  return me?.paid || 0
})

const myMatchesPaid = computed(() => {
  if (!currentCoach.value) return 0
  const me = settlement.value.find(s => s.coach.id === currentCoach.value.id)
  return me?.matchesPaid || 0
})

async function confirmSettle() {
  showSettleDialog.value = false
  if (viewingSeason.value) {
    await settleSeason(viewingSeason.value.id)
    showToast('Sesongen er avsluttet', 'success')
  }
}

async function handleExport() {
  // xlsx er 419 KB og trengs bare her. Lastes når knappen trykkes, ikke når sida åpnes.
  const { exportSeasonToExcel } = await import('../lib/excelExport')
  exportSeasonToExcel({
    seasonName: viewingSeason.value?.name,
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
    <div class="px-lg" style="padding-top: var(--ds-space-md);">
      <BackLink to="/admin" label="Admin" />
    </div>
    <div class="page-header">
      <h1 class="page-header__title">{{ usesReferees ? 'Sesongoppgjør' : 'Sesong' }}</h1>
      <SeasonPicker />
    </div>

    <div v-if="loading" class="px-lg season-skel" aria-hidden="true">
      <div class="season-skel__row">
        <div class="ds-card season-skel__card">
          <Skeleton :width="48" :height="28" />
          <Skeleton :width="60" :height="12" />
        </div>
        <div class="ds-card season-skel__card">
          <Skeleton :width="80" :height="28" />
          <Skeleton :width="50" :height="12" />
        </div>
      </div>
      <div class="ds-card season-skel__list">
        <div v-for="i in 4" :key="i" class="season-skel__line">
          <Skeleton :width="120" :height="14" />
          <Skeleton :width="60" :height="14" />
        </div>
      </div>
    </div>

    <template v-else>
      <!-- My balance card (Halsen owes me) -->
      <div v-if="usesReferees && currentCoach && !isSettled" class="px-lg mb-md">
        <div class="ds-card my-balance">
          <div class="my-balance__eyebrow">{{ clubShort }} skylder deg så langt</div>
          <div class="my-balance__amount">
            <AnimatedNumber :value="myOwed" /><span class="my-balance__currency"> kr</span>
          </div>
          <div class="my-balance__meta">
            Fra <AnimatedNumber :value="myMatchesPaid" /> {{ myMatchesPaid === 1 ? 'kamp' : 'kamper' }} denne sesongen
          </div>
        </div>
      </div>

      <!-- Summary stats -->
      <div v-if="usesReferees" class="px-lg mb-lg">
        <div class="stat-row" style="grid-template-columns: repeat(2, 1fr);">
          <div class="stat-card">
            <div class="stat-card__value">{{ registeredCount }}</div>
            <div class="stat-card__label">Kamper</div>
          </div>
          <div class="stat-card">
            <div class="stat-card__value">{{ totalAmount }}</div>
            <div class="stat-card__label">kr totalt</div>
          </div>
        </div>
      </div>

      <!-- Settled banner -->
      <div v-if="isSettled" class="px-lg mb-lg">
        <div class="ds-alert ds-alert--success">
          Denne sesongen er avsluttet. Oppgjøret ble gjort {{ new Date(viewingSeason.settled_at).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' }) }}.
        </div>
      </div>

      <!-- Expense summary per coach -->
      <div v-if="usesReferees" class="px-lg mb-lg">
        <div class="ds-card">
          <h3 style="font-family: var(--ds-font-heading); font-size: 1rem; font-weight: 500; margin-bottom: 16px;">Utlegg per trener</h3>

          <table class="settlement-table">
            <thead>
              <tr>
                <th>Trener</th>
                <th style="text-align: right;">Kamper</th>
                <th style="text-align: right;">Lagt ut</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in settlement" :key="s.coach.id" :class="{ 'settlement-row--me': s.coach.id === currentCoach?.id, 'settlement-row--null': !s.paid }">
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

      <!-- Eksporten er en dommerutlegg-rapport. Uten utlegg er arket tomt. -->
      <div v-if="usesReferees" class="px-lg mb-lg">
        <button class="ds-btn ds-btn--secondary" style="width: 100%;" @click="handleExport">
          <svg style="width: 18px; height: 18px; margin-right: 6px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Eksporter til Excel
        </button>
      </div>


      <!-- Previous settled seasons -->
      <div v-if="seasons.filter(s => s.status === 'settled' && s.id !== viewingSeason?.id).length > 0" class="px-lg mb-lg">
        <h3 style="font-family: var(--ds-font-heading); font-size: 1rem; font-weight: 500; margin-bottom: 12px; color: var(--ds-color-text-secondary);">Tidligere sesonger</h3>
        <div class="ds-stack--sm">
          <div v-for="s in seasons.filter(s => s.status === 'settled' && s.id !== viewingSeason?.id)" :key="s.id" class="ds-card ds-card--compact">
            <div class="ds-flex ds-flex--between">
              <span style="font-weight: 500;">{{ s.name }}</span>
              <span class="ds-badge ds-badge--success">Avsluttet</span>
            </div>
          </div>
        </div>
      </div>
      <div v-if="kanEndreFormat && activeCohort" class="px-lg mb-lg format">
        <h3 class="dommere__tittel">Spillform og kamplengde</h3>
        <div class="ds-pills format__pills" role="group" aria-label="Spillere på banen">
          <button
            v-for="n in PLAYERS_ON_PITCH_OPTIONS"
            :key="n"
            type="button"
            :class="['ds-pill', { 'ds-pill--active': format.players_on_pitch === n }]"
            :aria-pressed="format.players_on_pitch === n ? 'true' : 'false'"
            :disabled="lagrerFormat"
            @click="velgSpillform(n)"
          >{{ n }}er</button>
        </div>

        <!-- Kamplengden leses som én linje («2 × 30 min»). Stepperne står
             hver på sin rad med navn, så det ikke henger løse × og = mellom dem. -->
        <p class="format__oppsum">{{ format.period_count }} × {{ format.period_minutes }} min</p>
        <div class="format__lengde">
          <div class="format__rad">
            <span class="format__navn">Omganger</span>
            <div class="format__steg" role="group" aria-label="Omganger">
              <button type="button" class="format__knapp" aria-label="Færre omganger" :disabled="format.period_count <= 1 || lagrerFormat" @click="endreOmganger(-1)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12" /></svg>
              </button>
              <span class="format__tall"><b>{{ format.period_count }}</b></span>
              <button type="button" class="format__knapp" aria-label="Flere omganger" :disabled="format.period_count >= 4 || lagrerFormat" @click="endreOmganger(1)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              </button>
            </div>
          </div>
          <div class="format__rad">
            <span class="format__navn">Minutter</span>
            <div class="format__steg" role="group" aria-label="Minutter per omgang">
              <button type="button" class="format__knapp" aria-label="Fem minutter mindre" :disabled="format.period_minutes <= 5 || lagrerFormat" @click="endreMinutter(-5)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12" /></svg>
              </button>
              <span class="format__tall"><b>{{ format.period_minutes }}</b></span>
              <button type="button" class="format__knapp" aria-label="Fem minutter mer" :disabled="format.period_minutes >= 45 || lagrerFormat" @click="endreMinutter(5)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              </button>
            </div>
          </div>
        </div>

        <div v-if="formatEndret" class="format__handling">
          <button type="button" class="ds-btn ds-btn--secondary" :disabled="lagrerFormat" @click="formatFraKullet">Angre</button>
          <button type="button" class="ds-btn ds-btn--primary" :disabled="lagrerFormat" @click="lagreSpillform">
            {{ lagrerFormat ? 'Lagrer …' : 'Lagre' }}
          </button>
        </div>
      </div>
      <div v-if="kanStyreKullet" class="px-lg mb-lg dommere">
        <h3 class="dommere__tittel">Dommere</h3>
        <div class="segment" role="radiogroup" aria-label="Skaffer laget dommer selv?">
          <button
            type="button"
            role="radio"
            :aria-checked="usesReferees"
            :disabled="lagrerDommere"
            :class="['segment__valg', { 'segment__valg--aktiv': usesReferees }]"
            @click="settDommere(true)"
          >Vi skaffer dommer</button>
          <button
            type="button"
            role="radio"
            :aria-checked="!usesReferees"
            :disabled="lagrerDommere"
            :class="['segment__valg', { 'segment__valg--aktiv': !usesReferees }]"
            @click="settDommere(false)"
          >Trenger ikke</button>
        </div>
      </div>

      <!-- Avslutt sesong er det mest irreversible på sida, og gjøres én gang i
           halvåret. Den står nederst, under alt annet. -->
      <div v-if="!isSettled" class="px-lg mb-lg season-avslutt">
        <button class="ds-btn ds-btn--ghost" style="width: 100%;" @click="showSettleDialog = true">
          Avslutt sesong
        </button>
      </div>
    </template>

    <ConfirmDialog
      :show="showSettleDialog"
      title="Avslutt sesong?"
      :message="`Er du sikker på at du vil avslutte ${viewingSeason?.name}? Oppgjøret låses og kan ikke endres etterpå.`"
      confirm-label="Ja, avslutt"
      variant="warning"
      @confirm="confirmSettle"
      @cancel="showSettleDialog = false"
    />
  </div>
</template>

<style scoped>
.settlement-row--null td { color: var(--ds-color-text-tertiary); }
.settlement-row--null .settlement-amount { font-weight: var(--ds-weight-regular); color: var(--ds-color-text-tertiary); }

.dommere { margin-top: var(--ds-space-xl); }
.format { margin-top: var(--ds-space-xl); }
.format + .dommere { margin-top: var(--ds-space-lg); }

.season-avslutt { margin-top: var(--ds-space-2xl, 48px); }
.format__pills .ds-pill {
  min-width: 52px;
  min-height: 44px;
  justify-content: center;
  font-variant-numeric: tabular-nums;
}

.format__oppsum {
  margin: var(--ds-space-md) 0 0;
  font-size: var(--ds-text-md);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
  font-variant-numeric: tabular-nums;
}

.format__lengde {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
  margin-top: var(--ds-space-sm);
}

.format__rad {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-md);
}

.format__navn {
  min-width: 0;
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
}

.format__steg {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px;
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-subtle);
}

.format__knapp {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-elevated);
  color: var(--ds-color-text-primary);
  box-shadow: var(--ds-shadow-xs);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.format__knapp svg { width: 16px; height: 16px; }
.format__knapp:disabled { color: var(--ds-color-text-tertiary); box-shadow: none; opacity: .5; cursor: default; }

.format__tall {
  min-width: 36px;
  white-space: nowrap;
  text-align: center;
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
  font-variant-numeric: tabular-nums;
}
.format__tall b {
  font-size: var(--ds-text-md);
  font-weight: var(--ds-weight-bold);
  color: var(--ds-color-text-primary);
}

.format__handling {
  display: flex;
  gap: var(--ds-space-sm);
  margin-top: var(--ds-space-md);
}
.format__handling .ds-btn { flex: 1; min-height: 48px; }

.dommere__tittel {
  margin: 0 0 var(--ds-space-sm);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
}


.segment {
  display: inline-flex;
  padding: 3px;
  background: var(--ds-color-bg-subtle);
  border-radius: var(--ds-radius-full);
  gap: 2px;
}

.segment__valg {
  appearance: none;
  border: 0;
  background: transparent;
  min-height: 44px;
  padding: 0 18px;
  border-radius: var(--ds-radius-full);
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-secondary);
  cursor: pointer;
  letter-spacing: -0.005em;
  -webkit-tap-highlight-color: transparent;
}

.segment__valg--aktiv {
  background: var(--ds-color-accent);
  color: var(--ds-color-accent-text);
  font-weight: var(--ds-weight-semibold);
}

.my-balance {
  padding: var(--ds-space-xl);
  background: var(--ds-color-warm-bg);
  border-color: rgba(185, 96, 63, 0.22);
}

.my-balance__eyebrow {
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-medium);
  letter-spacing: var(--ds-tracking-wider);
  text-transform: uppercase;
  color: var(--ds-color-warm-text);
  margin-bottom: var(--ds-space-sm);
}

.my-balance__amount {
  font-family: var(--ds-font-heading);
  font-size: var(--ds-text-3xl);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-tighter);
  color: var(--ds-color-text-primary);
  line-height: 1;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1, 'ss01' 1;
}

.my-balance__currency {
  font-size: var(--ds-text-xl);
  color: var(--ds-color-text-secondary);
  font-weight: var(--ds-weight-regular);
  margin-left: 4px;
}

.my-balance__meta {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
  margin-top: var(--ds-space-sm);
}

.season-skel {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-md);
}
.season-skel__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--ds-space-md);
}
.season-skel__card {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
  padding: var(--ds-space-lg);
}
.season-skel__list {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-md);
  padding: var(--ds-space-lg);
}
.season-skel__line {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
