<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMatches } from '../composables/useMatches'
import { useExpenses } from '../composables/useExpenses'
import { useCoaches } from '../composables/useCoaches'
import { useReferees } from '../composables/useReferees'
import { usePlayers } from '../composables/usePlayers'
import { useToast } from '../composables/useToast'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import Sheet from '../components/Sheet.vue'
import Skeleton from '../components/Skeleton.vue'
import { relativeDateLabel } from '../lib/dateLabels'
import { formatPhone, phoneE164, parsePhone } from '../lib/phone'

const route = useRoute()
const router = useRouter()
const { matches, matchPlayers, getMatch, updateMatch, setMatchCoaches, fetchMatchCoaches, setMatchPlayers, fetchMatchPlayers, fetchAllMatchPlayers, deleteMatch } = useMatches()
const { expenses, fetchExpenses, registerExpense, getExpenseForMatch, removeExpense } = useExpenses()
const { coaches, fetchCoaches } = useCoaches()
const { referees, fetchReferees, getRefereeByName, addReferee, updateReferee } = useReferees()
const { players, fetchPlayers } = usePlayers()
const { show: showToast } = useToast()

// Try cache first — instant render when arriving from Dashboard.
// Skeleton only on direct-URL load when matches haven't been fetched yet.
const cachedMatch = matches.value.find(m => m.id === route.params.id)
const match = ref(cachedMatch || null)
const loading = ref(!cachedMatch)
const matchCoachIds = ref([])
const matchPlayerIds = ref([])
const showDeleteDialog = ref(false)
const customReferee = ref(false)
const refereeInput = ref('')
const newPhone = ref('')
const homeScoreInput = ref('')
const awayScoreInput = ref('')
const showEditDateTime = ref(false)
const editDateInput = ref('')
const editTimeInput = ref('')

onMounted(async () => {
  await Promise.all([fetchCoaches(), fetchReferees(), fetchPlayers(), fetchAllMatchPlayers()])
  match.value = await getMatch(route.params.id)
  if (match.value) {
    await fetchExpenses([match.value.id])
    refereeInput.value = match.value.referee || ''
    matchCoachIds.value = await fetchMatchCoaches(match.value.id)
    matchPlayerIds.value = await fetchMatchPlayers(match.value.id)
    homeScoreInput.value = match.value.home_score ?? ''
    awayScoreInput.value = match.value.away_score ?? ''
    // Show custom input if current referee is not in known list
    if (match.value.referee && !referees.value.some(r => r.name === match.value.referee)) {
      customReferee.value = true
    }
  }
  loading.value = false
})

const selectedReferee = computed(() => {
  if (!match.value?.referee) return null
  return getRefereeByName(match.value.referee)
})

const isValidNewPhone = computed(() => parsePhone(newPhone.value).length === 8)

watch(() => selectedReferee.value?.id, () => {
  newPhone.value = ''
})

async function saveNewPhone() {
  if (!isValidNewPhone.value || !selectedReferee.value) return
  const result = await updateReferee(selectedReferee.value.id, { phone: newPhone.value })
  if (result) {
    showToast(`Telefon lagret for ${selectedReferee.value.name}`, 'success')
    newPhone.value = ''
  }
}

const vippsMessage = computed(() => {
  if (!match.value?.match_date) return 'Dommerhonorar'
  const d = new Date(match.value.match_date + 'T12:00:00')
  const dateStr = d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'numeric', year: 'numeric' })
  return `Dommerhonorar ${dateStr}`
})

const telHref = computed(() => {
  const p = selectedReferee.value?.phone
  return p ? `tel:${phoneE164(p)}` : ''
})

const smsHref = computed(() => {
  const p = selectedReferee.value?.phone
  return p ? `sms:${phoneE164(p)}` : ''
})

async function openVipps() {
  const p = selectedReferee.value?.phone
  if (!p) return
  try {
    await navigator.clipboard.writeText(phoneE164(p))
    showToast('Telefonnummer kopiert — lim inn i Vipps', 'success')
  } catch {
    // Clipboard may fail silently on old browsers / insecure contexts
  }
  window.location.href = 'vipps://'
}

const expense = computed(() => getExpenseForMatch(route.params.id))

function getColorFromName(name) {
  const n = (name || '').toLowerCase()
  if (n.includes('grønn') || n.includes('gronn')) return 'gronn'
  if (n.includes('rød') || n.includes('rod')) return 'rod'
  if (n.includes('hvit')) return 'hvit'
  return ''
}

const teamColors = computed(() => {
  if (!match.value) return []
  const colors = []
  const home = (match.value.home_team || '').toLowerCase()
  const away = (match.value.away_team || '').toLowerCase()
  if (home.includes('halsen')) {
    const c = getColorFromName(match.value.home_team)
    if (c) colors.push(c)
  }
  if (away.includes('halsen')) {
    const c = getColorFromName(match.value.away_team)
    if (c && !colors.includes(c)) colors.push(c)
  }
  return colors
})

const formattedDate = computed(() => relativeDateLabel(match.value?.match_date))

async function selectReferee(name) {
  customReferee.value = false
  if (match.value.referee === name) {
    // Deselect
    await updateMatch(match.value.id, { referee: '' })
    match.value.referee = ''
    refereeInput.value = ''
    showToast('Dommer fjernet', 'success')
  } else {
    await updateMatch(match.value.id, { referee: name })
    match.value.referee = name
    refereeInput.value = name
    showToast('Dommer oppdatert', 'success')
  }
}

function showCustomReferee() {
  customReferee.value = true
  const isKnown = referees.value.some(r => r.name === match.value.referee)
  refereeInput.value = isKnown ? '' : (match.value.referee || '')
  newPhone.value = ''
}

function cancelCustomReferee() {
  customReferee.value = false
  refereeInput.value = match.value.referee || ''
  newPhone.value = ''
}

async function saveCustomReferee() {
  const name = refereeInput.value.trim()
  if (!name) {
    customReferee.value = false
    return
  }
  if (newPhone.value && !isValidNewPhone.value) return

  const phone = newPhone.value
  const existing = referees.value.find(r => r.name === name)
  if (!existing) {
    await addReferee(name, phone)
  } else if (phone && !existing.phone) {
    await updateReferee(existing.id, { phone })
  }
  if (name !== match.value.referee) {
    await updateMatch(match.value.id, { referee: name })
    match.value.referee = name
  }
  customReferee.value = false
  refereeInput.value = name
  newPhone.value = ''
  showToast('Dommer lagret', 'success')
}

async function selectPayer(coachId) {
  if (expense.value?.paid_by === coachId) {
    await removeExpense(match.value.id)
    showToast('Utlegg fjernet', 'success')
  } else {
    await registerExpense(match.value.id, coachId, match.value.fee_amount || 200)
    const name = coaches.value.find(c => c.id === coachId)?.name
    showToast(`${name} la ut ${match.value.fee_amount || 200} kr`, 'success')
  }
}

async function toggleCoach(coachId) {
  const current = [...matchCoachIds.value]
  const idx = current.indexOf(coachId)
  if (idx > -1) {
    current.splice(idx, 1)
  } else {
    current.push(coachId)
  }
  await setMatchCoaches(match.value.id, current)
  matchCoachIds.value = current
  showToast('Trenere oppdatert', 'success')
}

async function togglePlayer(playerId) {
  const current = [...matchPlayerIds.value]
  const idx = current.indexOf(playerId)
  if (idx > -1) {
    current.splice(idx, 1)
  } else {
    current.push(playerId)
  }
  await setMatchPlayers(match.value.id, current)
  matchPlayerIds.value = current
  showToast('Lånespillere oppdatert', 'success')
}

const teamLabels = { gronn: 'Grønn', rod: 'Rød', hvit: 'Hvit' }

// Detect a same-day conflict for one player. Returns { time, opponent } or null.
function getConflictForPlayer(p, currentMatchId, currentDate) {
  if (!currentDate) return null

  function describeMatch(m) {
    const time = m.match_time?.slice(0, 5)
    const opponentRaw = (m.home_team || '').toLowerCase().includes('halsen')
      ? m.away_team
      : m.home_team
    return {
      time: time && time !== '00:00' ? time : null,
      opponent: opponentRaw || ''
    }
  }

  // 1. Explicit: booked as guest elsewhere same day
  const guestMatch = matchPlayers.value
    .filter(mp => mp.player_id === p.id && mp.match_id !== currentMatchId)
    .map(mp => matches.value.find(m => m.id === mp.match_id))
    .find(m => m && m.match_date === currentDate)
  if (guestMatch) return describeMatch(guestMatch)

  // 2. Implicit: player's primary Halsen team plays same day
  if (p.primary_team) {
    const primaryMatch = matches.value.find(m => {
      if (m.id === currentMatchId) return false
      if (m.match_date !== currentDate) return false
      const homeColor = (m.home_team || '').toLowerCase().includes('halsen')
        ? getColorFromName(m.home_team) : null
      const awayColor = (m.away_team || '').toLowerCase().includes('halsen')
        ? getColorFromName(m.away_team) : null
      return homeColor === p.primary_team || awayColor === p.primary_team
    })
    if (primaryMatch) return describeMatch(primaryMatch)
  }

  return null
}

const availablePlayers = computed(() => {
  const matchTeams = teamColors.value
  const currentMatchId = match.value?.id
  const currentDate = match.value?.match_date

  const filtered = players.value.filter(p => {
    // Always show players already selected on this match (so they can be removed)
    if (matchPlayerIds.value.includes(p.id)) return true
    // Players without a primary team can hospitate anywhere
    if (!p.primary_team) return true
    // Hide if the player's primary team is one of the Halsen teams playing this match
    return !matchTeams.includes(p.primary_team)
  })

  // Sort: non-conflict first, then conflict; tiebreaker alphabetical
  return filtered.slice().sort((a, b) => {
    const aConflict = !!getConflictForPlayer(a, currentMatchId, currentDate)
    const bConflict = !!getConflictForPlayer(b, currentMatchId, currentDate)
    if (aConflict !== bConflict) return aConflict ? 1 : -1
    return a.name.localeCompare(b.name)
  })
})

const playerConflicts = computed(() => {
  if (!match.value) return {}
  const out = {}
  for (const p of availablePlayers.value) {
    const c = getConflictForPlayer(p, match.value.id, match.value.match_date)
    if (c) out[p.id] = c
  }
  return out
})

const hasResult = computed(() => {
  return match.value?.home_score !== null && match.value?.home_score !== undefined
    && match.value?.away_score !== null && match.value?.away_score !== undefined
})

function isValidScore(v) {
  if (v === '' || v === null || v === undefined) return false
  const n = Number(v)
  return Number.isInteger(n) && n >= 0 && n <= 99
}

const isResultValid = computed(() =>
  isValidScore(homeScoreInput.value) && isValidScore(awayScoreInput.value)
)

const isResultChanged = computed(() => {
  const h = homeScoreInput.value === '' ? null : Number(homeScoreInput.value)
  const a = awayScoreInput.value === '' ? null : Number(awayScoreInput.value)
  return h !== (match.value?.home_score ?? null) || a !== (match.value?.away_score ?? null)
})

async function saveResult() {
  if (!isResultValid.value || !isResultChanged.value) return
  const home = Number(homeScoreInput.value)
  const away = Number(awayScoreInput.value)
  await updateMatch(match.value.id, { home_score: home, away_score: away })
  match.value.home_score = home
  match.value.away_score = away
  showToast(`Resultat lagret: ${home}–${away}`, 'success')
}

async function clearResult() {
  await updateMatch(match.value.id, { home_score: null, away_score: null })
  match.value.home_score = null
  match.value.away_score = null
  homeScoreInput.value = ''
  awayScoreInput.value = ''
  showToast('Resultat fjernet', 'success')
}

async function handleDelete() {
  showDeleteDialog.value = false
  await deleteMatch(match.value.id)
  showToast('Kamp slettet', 'success')
  router.push('/')
}

function openEditDateTime() {
  editDateInput.value = match.value.match_date || ''
  editTimeInput.value = (match.value.match_time || '').substring(0, 5)
  showEditDateTime.value = true
}

function cancelEditDateTime() {
  showEditDateTime.value = false
}

const isDateTimeChanged = computed(() => {
  if (!match.value) return false
  const currentDate = match.value.match_date || ''
  const currentTime = (match.value.match_time || '').substring(0, 5)
  return editDateInput.value !== currentDate || editTimeInput.value !== currentTime
})

async function saveDateTime() {
  if (!editDateInput.value || !isDateTimeChanged.value) return
  const newDate = editDateInput.value
  const newTime = editTimeInput.value || null
  const weekday = new Date(newDate + 'T12:00:00').toLocaleDateString('nb-NO', { weekday: 'long' })
  const updates = {
    match_date: newDate,
    match_time: newTime,
    match_day: weekday,
  }
  await updateMatch(match.value.id, updates)
  match.value.match_date = newDate
  match.value.match_time = newTime
  match.value.match_day = weekday
  showEditDateTime.value = false
  showToast('Tidspunkt oppdatert', 'success')
}
</script>

<template>
  <div v-if="loading" class="desktop-container md-skel" aria-hidden="true">
    <div class="px-lg" style="padding-top: var(--ds-space-md);">
      <Skeleton :width="80" :height="14" />
    </div>
    <div class="px-lg" style="margin-top: var(--ds-space-lg);">
      <div class="ds-card md-skel__card">
        <div class="md-skel__top">
          <Skeleton :width="80" :height="13" />
          <Skeleton :width="40" :height="13" />
        </div>
        <div class="md-skel__teams">
          <Skeleton :width="'70%'" :height="22" />
          <Skeleton :width="36" :height="22" />
          <Skeleton :width="'60%'" :height="22" />
        </div>
        <div class="md-skel__meta">
          <Skeleton :width="80" :height="12" />
          <Skeleton :width="100" :height="12" />
        </div>
      </div>
    </div>
    <div class="px-lg" style="margin-top: var(--ds-space-lg);">
      <Skeleton :width="120" :height="14" />
      <div class="md-skel__list" style="margin-top: var(--ds-space-md);">
        <Skeleton v-for="i in 3" :key="i" :width="'100%'" :height="44" radius="10px" />
      </div>
    </div>
  </div>

  <div v-else-if="match" class="desktop-container">
    <div class="px-lg" style="padding-top: var(--ds-space-md);">
      <button class="back-btn" @click="router.back()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Tilbake
      </button>
    </div>

    <!-- Match Header — same visual language as dashboard MatchCard -->
    <div class="px-lg mt-lg">
      <div class="ds-card match-card match-detail-card">
        <div class="match-card__top">
          <span class="match-card__datetime">
            <span
              v-for="color in teamColors"
              :key="color"
              class="match-card__team-tag"
              :class="`match-card__team-tag--${color}`"
            >{{ color === 'gronn' ? 'Grønn' : color === 'rod' ? 'Rød' : 'Hvit' }}</span>
            {{ formattedDate }}<template v-if="match.match_time && match.match_time.substring(0, 5) !== '00:00'"> · {{ match.match_time.substring(0, 5) }}</template>
          </span>
          <button
            type="button"
            class="match-card__edit-btn"
            aria-label="Endre tidspunkt"
            @click="openEditDateTime"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
            </svg>
          </button>
        </div>
        <div class="match-card__teams">
          <span class="match-card__team">{{ match.home_team }}</span>
          <span class="match-card__vs">vs</span>
          <span class="match-card__team">{{ match.away_team }}</span>
        </div>
        <div class="match-card__meta" v-if="match.division || match.round">
          <span v-if="match.division" class="match-card__meta-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
            {{ match.division }}
          </span>
          <span v-if="match.round" class="match-card__meta-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            Runde {{ match.round }}
          </span>
        </div>
      </div>
    </div>

    <!-- Action sections — two-column on desktop -->
    <div class="px-lg mt-lg detail-desktop-grid">
      <div>
        <!-- Dommer - pill buttons -->
        <div class="detail-section">
          <div class="detail-section__header">
            <span class="detail-section__label">Dommer</span>
          </div>
          <div class="referee-pills" style="margin-top: 10px;">
            <button
              v-for="r in referees"
              :key="r.id"
              :class="['referee-pill', { 'referee-pill--selected': match.referee === r.name && !customReferee }]"
              @click="selectReferee(r.name)"
            >
              {{ r.name }}
            </button>
            <button
              :class="['referee-pill referee-pill--other', { 'referee-pill--selected': customReferee }]"
              @click="showCustomReferee"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Ny dommer
            </button>
          </div>
          <!-- Custom referee sheet: navn + telefon -->
          <Sheet :show="customReferee" title="Ny dommer" @close="cancelCustomReferee">
            <div class="custom-referee-form">
              <input
                v-model="refereeInput"
                class="ds-input"
                placeholder="Dommerens navn"
                @keydown.enter="saveCustomReferee"
              />
              <input
                v-model="newPhone"
                class="ds-input"
                type="tel"
                inputmode="numeric"
                autocomplete="off"
                placeholder="Telefon (valgfritt, 8 siffer)"
                @keydown.enter="saveCustomReferee"
              />
              <div class="custom-referee-form__actions">
                <button
                  type="button"
                  class="ds-btn ds-btn--secondary ds-btn--sm"
                  @click="cancelCustomReferee"
                >
                  Avbryt
                </button>
                <button
                  type="button"
                  class="ds-btn ds-btn--primary ds-btn--sm"
                  :disabled="!refereeInput.trim() || (newPhone && !isValidNewPhone)"
                  @click="saveCustomReferee"
                >
                  Legg til
                </button>
              </div>
            </div>
          </Sheet>

          <!-- Kontaktkort: vises når en dommer er valgt — telefon eller empty state -->
          <div v-if="selectedReferee" class="referee-contact">
            <template v-if="selectedReferee.phone">
              <div class="referee-contact__phone">{{ formatPhone(selectedReferee.phone) }}</div>
              <div class="referee-contact__actions">
                <a :href="telHref" class="contact-btn contact-btn--neutral">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>
                  </svg>
                  Ring
                </a>
                <a :href="smsHref" class="contact-btn contact-btn--neutral">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                  </svg>
                  SMS
                </a>
                <button type="button" class="contact-btn contact-btn--vipps" @click="openVipps">
                  <svg class="vipps-icon" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#FF5B24"/><g transform="translate(-60, -20) scale(2)"><path d="M57.3,40.7c3.7,0,5.8-1.8,7.8-4.4c1.1-1.4,2.5-1.7,3.5-0.9s1.1,2.3,0,3.7c-2.9,3.8-6.6,6.1-11.3,6.1c-5.1,0-9.6-2.8-12.7-7.7c-0.9-1.3-0.7-2.7,0.3-3.4s2.5-0.4,3.4,1C50.5,38.4,53.5,40.7,57.3,40.7z M64.2,28.4c0,1.8-1.4,3-3,3s-3-1.2-3-3s1.4-3,3-3S64.2,26.7,64.2,28.4z" fill="white"/></g></svg>
                  Åpne Vipps
                </button>
              </div>
              <div class="referee-contact__hint-amount">Lim inn i Vipps · send {{ match.fee_amount || 200 }} kr</div>
            </template>
            <template v-else>
              <div class="referee-contact__empty-title">Ingen telefon registrert</div>
              <div class="referee-contact__empty-subtitle">Legg til nummer for å aktivere Ring, SMS og Vipps</div>
              <div class="referee-add-phone__row">
                <input
                  v-model="newPhone"
                  class="ds-input"
                  type="tel"
                  inputmode="numeric"
                  autocomplete="off"
                  placeholder="8 siffer"
                  @keydown.enter="saveNewPhone"
                />
                <button
                  type="button"
                  class="ds-btn ds-btn--primary ds-btn--sm"
                  :disabled="!isValidNewPhone"
                  @click="saveNewPhone"
                >
                  Lagre
                </button>
              </div>
            </template>
          </div>
        </div>

        <!-- Expense / Hvem la ut — co-located with Dommer (you Vipps the ref) -->
        <div class="detail-section">
          <div class="detail-section__header">
            <span class="detail-section__label">Hvem la ut?</span>
          </div>
          <div class="payer-grid" style="margin-top: 12px;">
            <button
              v-for="c in coaches"
              :key="c.id"
              :class="['payer-btn', { 'payer-btn--selected': expense?.paid_by === c.id }]"
              @click="selectPayer(c.id)"
            >
              <span class="payer-btn__name">{{ c.name }}</span>
              <svg v-if="expense?.paid_by === c.id" style="width: 14px; height: 14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Lånespillere / Guest players -->
        <div class="detail-section">
          <div class="detail-section__header">
            <span class="detail-section__label">Lånespillere</span>
          </div>
          <div v-if="players.length === 0" class="hospitant-empty">
            Ingen spillere i poolen — legg til under Admin → Lånespillere
          </div>
          <div v-else-if="availablePlayers.length === 0" class="hospitant-empty">
            Ingen tilgjengelige lånespillere for denne kampen.
          </div>
          <div v-else class="referee-pills" style="margin-top: 10px;">
            <button
              v-for="p in availablePlayers"
              :key="p.id"
              :class="[
                'referee-pill',
                {
                  'referee-pill--selected': matchPlayerIds.includes(p.id),
                  'referee-pill--conflict': playerConflicts[p.id]
                }
              ]"
              @click="togglePlayer(p.id)"
            >
              {{ p.name }}<span v-if="p.primary_team" class="hospitant-pill__team"> · {{ teamLabels[p.primary_team] }}</span>
              <span v-if="playerConflicts[p.id]" class="hospitant-pill__conflict" :title="`Også kamp ${playerConflicts[p.id].time || 'samme dag'} mot ${playerConflicts[p.id].opponent}`">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="9"/>
                  <polyline points="12 7 12 12 15 14"/>
                </svg>
                {{ playerConflicts[p.id].time || 'samme dag' }}
              </span>
            </button>
          </div>
        </div>
      </div>

      <div>
        <!-- Resultat -->
        <div class="detail-section">
          <div class="detail-section__header">
            <span class="detail-section__label">Resultat</span>
          </div>
          <div class="result-form">
            <input
              v-model="homeScoreInput"
              type="number"
              min="0"
              max="99"
              inputmode="numeric"
              class="ds-input result-input"
              :aria-label="`Mål for ${match.home_team}`"
              @keydown.enter="saveResult"
            />
            <span class="result-dash">–</span>
            <input
              v-model="awayScoreInput"
              type="number"
              min="0"
              max="99"
              inputmode="numeric"
              class="ds-input result-input"
              :aria-label="`Mål for ${match.away_team}`"
              @keydown.enter="saveResult"
            />
            <button
              type="button"
              class="ds-btn ds-btn--primary ds-btn--sm"
              :disabled="!isResultValid || !isResultChanged"
              @click="saveResult"
            >
              Lagre
            </button>
          </div>
          <button
            v-if="hasResult"
            type="button"
            class="ds-btn ds-btn--ghost ds-btn--sm result-clear-btn"
            @click="clearResult"
          >
            Fjern resultat
          </button>
        </div>

        <!-- Trenere — least urgent, last -->
        <div class="detail-section">
          <div class="detail-section__header">
            <span class="detail-section__label">Trenere</span>
          </div>
          <div class="coach-grid" style="margin-top: 12px;">
            <button
              v-for="c in coaches"
              :key="c.id"
              :data-coach="c.name.toLowerCase()"
              :class="['coach-btn', { 'coach-btn--selected': matchCoachIds.includes(c.id) }]"
              @click="toggleCoach(c.id)"
            >
              <div class="coach-btn__avatar">
                <img v-if="c.image" :src="c.image" :alt="c.name" class="coach-btn__avatar-img" />
                <span v-else class="coach-btn__initial">{{ c.name.charAt(0) }}</span>
              </div>
              <span class="coach-btn__name">{{ c.name }}</span>
              <span v-if="matchCoachIds.includes(c.id)" class="coach-btn__check" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Delete Match -->
    <div class="px-lg mt-lg mb-lg" style="padding-top: var(--ds-space-lg); border-top: 1px solid var(--ds-color-border-light);">
      <button
        class="ds-btn ds-btn--ghost ds-btn--sm"
        style="color: var(--ds-color-error);"
        @click="showDeleteDialog = true"
      >
        Slett kamp
      </button>
    </div>

    <Sheet :show="showEditDateTime" title="Endre tidspunkt" @close="cancelEditDateTime">
      <div class="edit-datetime-form">
        <div class="edit-datetime-form__row">
          <div class="edit-datetime-form__group">
            <label class="ds-label">Dato</label>
            <input v-model="editDateInput" type="date" class="ds-input" />
          </div>
          <div class="edit-datetime-form__group">
            <label class="ds-label">Tid</label>
            <input v-model="editTimeInput" type="time" class="ds-input" />
          </div>
        </div>
        <div class="edit-datetime-form__actions">
          <button
            type="button"
            class="ds-btn ds-btn--secondary ds-btn--sm"
            @click="cancelEditDateTime"
          >
            Avbryt
          </button>
          <button
            type="button"
            class="ds-btn ds-btn--primary ds-btn--sm"
            :disabled="!editDateInput || !isDateTimeChanged"
            @click="saveDateTime"
          >
            Lagre
          </button>
        </div>
      </div>
    </Sheet>

    <ConfirmDialog
      :show="showDeleteDialog"
      title="Slett kamp?"
      :message="`Er du sikker på at du vil slette ${match.home_team} vs ${match.away_team}?`"
      confirm-label="Slett"
      variant="warning"
      @confirm="handleDelete"
      @cancel="showDeleteDialog = false"
    />
  </div>
</template>

<style scoped>
.md-skel__card {
  padding: var(--ds-space-xl);
}

.md-skel__top {
  display: flex;
  justify-content: space-between;
  margin-bottom: var(--ds-space-md);
}

.md-skel__teams {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  column-gap: var(--ds-space-md);
  margin-bottom: var(--ds-space-md);
}

.md-skel__teams > :last-child { justify-self: end; }

.md-skel__meta {
  display: flex;
  gap: var(--ds-space-md);
  padding-top: var(--ds-space-md);
  border-top: 1px solid var(--ds-color-border-light);
}

.md-skel__list {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
}

/* Match detail card — reuses global .match-card classes, adds team tag locally */
.match-detail-card {
  padding: var(--ds-space-lg);
}

.match-detail-card .match-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.match-card__edit-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--ds-color-text-tertiary);
  cursor: pointer;
  transition: all 0.15s ease;
  -webkit-tap-highlight-color: transparent;
  flex-shrink: 0;
}

.match-card__edit-btn:hover {
  background: var(--ds-color-bg-elevated);
  color: var(--ds-color-text-primary);
}

.match-card__edit-btn svg {
  width: 14px;
  height: 14px;
}

.edit-datetime-form {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.edit-datetime-form__row {
  display: flex;
  gap: 12px;
}

.edit-datetime-form__group {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.edit-datetime-form__actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

/* Override the flex:1 spread — center teams compactly in detail view */
.match-detail-card .match-card__teams {
  justify-content: center;
}

.match-detail-card .match-card__team {
  flex: none;
}

.match-detail-card .match-card__team:last-child {
  text-align: left;
}

.match-detail-card .match-card__team-tag {
  display: inline-block;
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  letter-spacing: 0.02em;
  margin-right: 4px;
}

.match-detail-card .match-card__team-tag--gronn {
  background: var(--ds-color-success-light);
  color: var(--ds-color-success);
}

.match-detail-card .match-card__team-tag--rod {
  background: var(--ds-color-error-light);
  color: var(--ds-color-error);
}

.match-detail-card .match-card__team-tag--hvit {
  background: var(--ds-color-bg-elevated);
  color: var(--ds-color-text-tertiary);
  border: 1px solid var(--ds-color-border-light);
}

/* Referee pill buttons - compact horizontal chips */
.referee-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.referee-pill {
  padding: 6px 14px;
  border: 1.5px solid var(--ds-color-border);
  border-radius: 20px;
  background: var(--ds-color-bg-elevated);
  font-family: var(--ds-font-body);
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--ds-color-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}

.referee-pill:hover {
  border-color: var(--ds-color-text-tertiary);
  color: var(--ds-color-text-primary);
}

.referee-pill--selected {
  border-color: var(--ds-color-accent);
  background: var(--ds-color-accent);
  color: var(--ds-color-accent-text);
}

.referee-pill--selected:hover {
  background: var(--ds-color-accent);
  border-color: var(--ds-color-accent);
  color: var(--ds-color-accent-text);
}

.referee-pill--other {
  border-style: dashed;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.referee-pill--other svg {
  width: 14px;
  height: 14px;
}

/* Referee contact block (phone + Ring/SMS/Vipps) */
.referee-contact {
  margin-top: 16px;
  padding: 12px 14px;
  border: 1px solid var(--ds-color-border-light);
  border-radius: 12px;
  background: var(--ds-color-bg-elevated);
}

.referee-contact__phone {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--ds-color-text-primary);
  margin-bottom: 10px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}

.referee-contact__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.referee-contact__hint {
  margin-top: 12px;
  font-size: 0.8125rem;
  color: var(--ds-color-text-tertiary);
  font-style: italic;
}

.custom-referee-form {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.custom-referee-form__actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.referee-contact__empty-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--ds-color-text-primary);
  margin-bottom: 2px;
}

.referee-contact__empty-subtitle {
  font-size: 0.75rem;
  color: var(--ds-color-text-tertiary);
  margin-bottom: 10px;
}

.referee-add-phone__row {
  display: flex;
  gap: 8px;
  align-items: stretch;
}

.referee-add-phone__row .ds-input {
  flex: 1;
  min-width: 0;
}

.referee-contact__hint-amount {
  margin-top: 8px;
  font-size: 0.75rem;
  color: var(--ds-color-text-tertiary);
}

.contact-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 10px;
  font-family: var(--ds-font-body);
  font-size: 0.8125rem;
  font-weight: 600;
  text-decoration: none;
  border: 1.5px solid transparent;
  cursor: pointer;
  transition: all 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}

.contact-btn svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.contact-btn--neutral {
  background: var(--ds-color-bg);
  border-color: var(--ds-color-border);
  color: var(--ds-color-text-primary);
}

.contact-btn--neutral:hover {
  border-color: var(--ds-color-text-tertiary);
}

.contact-btn--vipps {
  background: #FF5B24;
  color: white;
}

.contact-btn--vipps:hover {
  background: #E85419;
}

.contact-btn .vipps-icon {
  width: 18px;
  height: 18px;
  border-radius: 4px;
}

/* Payer buttons - compact name-only row */
.payer-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.payer-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-md);
  background: var(--ds-color-bg-elevated);
  cursor: pointer;
  transition:
    border-color var(--ds-duration-fast) var(--ds-ease-out),
    background-color var(--ds-duration-fast) var(--ds-ease-out);
  font-family: var(--ds-font-body);
  -webkit-tap-highlight-color: transparent;
}

@media (hover: hover) and (pointer: fine) {
  .payer-btn:hover {
    border-color: var(--ds-color-border-strong);
  }
}

.payer-btn:active {
  transform: scale(0.98);
}

.payer-btn__name {
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-primary);
}

.payer-btn--selected {
  border-color: var(--ds-color-accent);
  background: var(--ds-color-accent);
  color: var(--ds-color-accent-text);
}

.payer-btn--selected .payer-btn__name {
  color: var(--ds-color-accent-text);
}

.payer-btn--selected svg {
  color: var(--ds-color-accent-text);
}

/* Resultat-form */
.result-form {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}

.result-input {
  width: 64px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  font-size: 1rem;
  -moz-appearance: textfield;
}

.result-input::-webkit-outer-spin-button,
.result-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.result-dash {
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--ds-color-text-tertiary);
}

.result-clear-btn {
  margin-top: 8px;
  color: var(--ds-color-text-tertiary);
}

/* Hospitanter */
.hospitant-empty {
  margin-top: 10px;
  font-size: 0.8125rem;
  color: var(--ds-color-text-tertiary);
  font-style: italic;
}

.hospitant-pill__team {
  font-weight: 400;
  opacity: 0.8;
}

/* Same-day conflict annotation on lånespiller pill */
.hospitant-pill__conflict {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: 6px;
  padding: 1px 6px 1px 4px;
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-warm-bg);
  color: var(--ds-color-warm-text);
  font-size: 0.6875rem;
  font-weight: var(--ds-weight-medium);
  letter-spacing: -0.005em;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.hospitant-pill__conflict svg {
  width: 11px;
  height: 11px;
  flex-shrink: 0;
}

.referee-pill--conflict {
  border-color: var(--ds-color-warm);
}

.referee-pill--selected .hospitant-pill__conflict {
  background: rgba(255, 255, 255, 0.18);
  color: var(--ds-color-warm-bg);
}
</style>
