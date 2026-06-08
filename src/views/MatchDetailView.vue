<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMatches } from '../composables/useMatches'
import { useExpenses } from '../composables/useExpenses'
import { useCoaches } from '../composables/useCoaches'
import { useReferees } from '../composables/useReferees'
import { usePlayers } from '../composables/usePlayers'
import { useMatchGoals } from '../composables/useMatchGoals'
import { useAuth } from '../stores/auth'
import { useToast } from '../composables/useToast'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import Sheet from '../components/Sheet.vue'
import Skeleton from '../components/Skeleton.vue'
import DisclosureSection from '../components/DisclosureSection.vue'
import { relativeDateLabel, isPast } from '../lib/dateLabels'
import { colorFromName, teamColorsForMatch, isHomeMatch as computeIsHomeMatch, isPlayed, TEAM_LABELS } from '../lib/matchMeta'
import { formatPhone, phoneE164, parsePhone } from '../lib/phone'

const route = useRoute()
const router = useRouter()
const { matches, matchPlayers, getMatch, fetchMatches, updateMatch, setMatchCoaches, fetchMatchCoaches, setMatchPlayers, fetchMatchPlayers, fetchAllMatchPlayers, fetchMatchAbsences, toggleAbsence, deleteMatch } = useMatches()
const { expenses, fetchExpenses, registerExpense, getExpenseForMatch, removeExpense } = useExpenses()
const { coaches, fetchCoaches } = useCoaches()
const { referees, fetchReferees, getRefereeByName, addReferee, updateReferee } = useReferees()
const { players, fetchPlayers, addPlayer, getPlayerById } = usePlayers()
const { goals: allGoals, fetchMatchGoals, addGoal, removeGoal } = useMatchGoals()
const { coach: currentCoach } = useAuth()
const { show: showToast } = useToast()

// Try cache first — instant render when arriving from Dashboard.
// Skeleton only on direct-URL load when matches haven't been fetched yet.
const cachedMatch = matches.value.find(m => m.id === route.params.id)
const match = ref(cachedMatch || null)
const loading = ref(!cachedMatch)
const matchCoachIds = ref([])
const matchPlayerIds = ref([])
const matchAbsenceIds = ref([])
const showDeleteDialog = ref(false)
const showMatchMenu = ref(false)
const customReferee = ref(false)
const refereeInput = ref('')
const newPhone = ref('')
const homeScoreInput = ref('')
const awayScoreInput = ref('')
const showEditDateTime = ref(false)
const editDateInput = ref('')
const editTimeInput = ref('')

// Disclosure open-state — 3 grouped sections.
// Smart-open settes i onMounted basert på kamp-state.
const open = ref({
  logistics: false,  // Dommer + Hvem la ut
  team: false,       // Lånespillere + Trenere
  summary: false     // Resultat + Scorere + Kampreferat
})

// Scorer sheet state — tap-to-increment-flow
const showScorerSheet = ref(false)
const lastTappedPlayerId = ref('')   // siste tappet spiller — fjern-knapp i bunn refererer til denne
const showNewPlayerForm = ref(false)
const newPlayerName = ref('')
const newPlayerTeam = ref('')

// Kampreferat — eksplisitt Lagre-knapp + read/edit-modus
const reportInput = ref('')
const reportSavedAt = ref(null)
const isEditingReport = ref(false)

onMounted(async () => {
  await Promise.all([fetchCoaches(), fetchReferees(), fetchPlayers(), fetchAllMatchPlayers()])
  match.value = await getMatch(route.params.id)
  if (match.value) {
    // Hent sesongens kamper — grunnlag for ekstra-kamp-tall og konflikt-/uke-sjekk.
    if (match.value.season_id) await fetchMatches(match.value.season_id)
    await Promise.all([
      fetchExpenses([match.value.id]),
      fetchMatchGoals(match.value.id)
    ])
    refereeInput.value = match.value.referee || ''
    matchCoachIds.value = await fetchMatchCoaches(match.value.id)
    matchPlayerIds.value = await fetchMatchPlayers(match.value.id)
    matchAbsenceIds.value = await fetchMatchAbsences(match.value.id)
    homeScoreInput.value = match.value.home_score ?? ''
    awayScoreInput.value = match.value.away_score ?? ''
    reportInput.value = match.value.report || ''
    // Tomt referat → edit-modus direkte; lagret referat → lese-modus med "Rediger"
    isEditingReport.value = !match.value.report
    // Show custom input if current referee is not in known list
    if (match.value.referee && !referees.value.some(r => r.name === match.value.referee)) {
      customReferee.value = true
    }
    applySmartOpen()
  }
  loading.value = false
})

function applySmartOpen() {
  if (!match.value) return
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const matchDate = new Date((match.value.match_date || '') + 'T12:00:00')
  const isPast = !Number.isNaN(matchDate.getTime()) && matchDate < today

  if (isPast) {
    // Spilt eller skulle vært spilt — coach kom sannsynligvis for å se eller logge resultat
    open.value.summary = true
  } else if (isHomeMatch.value) {
    // Fremtidig hjemmekamp — coach setter dommer/utlegg
    open.value.logistics = true
  } else {
    // Fremtidig bortekamp — dommer er ikke vårt ansvar, fokus på lag
    open.value.team = true
  }
}

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

  // Auto-registrer Vipps-tapper som utlegger hvis ingen er satt fra før.
  // Antagelse: den som åpner Vipps er den som faktisk betaler.
  if (!expense.value && currentCoach.value?.id && match.value) {
    await registerExpense(
      match.value.id,
      currentCoach.value.id,
      match.value.fee_amount || 200
    )
    showToast(`${currentCoach.value.name} satt som utlegger`, 'success')
  }

  try {
    await navigator.clipboard.writeText(phoneE164(p))
    showToast('Telefonnummer kopiert — lim inn i Vipps', 'success')
  } catch {
    // Clipboard may fail silently on old browsers / insecure contexts
  }
  window.location.href = 'vipps://'
}

const expense = computed(() => getExpenseForMatch(route.params.id))

const isHomeMatch = computed(() => computeIsHomeMatch(match.value))

const teamColors = computed(() => teamColorsForMatch(match.value))

// Rekkefølge på de tre seksjonene styres av kampens livssyklus:
// spilt kamp leder med resultat, kommende leder med prep. Flex-order på
// .detail-disclosures gjør omrokeringen uten å endre DOM-en.
const sectionOrder = computed(() => {
  if (isPast(match.value?.match_date)) {
    return { summary: 1, team: 2, logistics: 3 }
  }
  if (isHomeMatch.value) {
    return { logistics: 1, team: 2, summary: 3 }
  }
  // Kommende bortekamp — ingen dommer-ansvar, lag øverst
  return { team: 1, summary: 2, logistics: 3 }
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

// ─── Laget: basistropp for kampens Halsen-lag, med frafall ────────────────────
// Spillere med primary_team ∈ kampens lagfarger utgjør laget. Frafall (absences)
// tar dem ut av kamptroppen uten å slette dem.
const teamSquad = computed(() => {
  const colors = teamColors.value
  return players.value
    .filter(p => p.primary_team && colors.includes(p.primary_team))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'no'))
})
const availableCount = computed(() =>
  teamSquad.value.filter(p => !matchAbsenceIds.value.includes(p.id)).length
)

async function handleToggleAbsence(playerId) {
  await toggleAbsence(match.value.id, playerId)
  matchAbsenceIds.value = matchAbsenceIds.value.includes(playerId)
    ? matchAbsenceIds.value.filter(id => id !== playerId)
    : [...matchAbsenceIds.value, playerId]
}

// ─── Ekstra-kamper per spiller (rettferdighetshint på lånespillere) ────────────
const playedMatchIds = computed(() => {
  const ids = new Set()
  for (const m of matches.value) if (isPlayed(m)) ids.add(m.id)
  return ids
})
const extraCountByPlayer = computed(() => {
  const counts = {}
  for (const mp of matchPlayers.value) {
    if (playedMatchIds.value.has(mp.match_id)) {
      counts[mp.player_id] = (counts[mp.player_id] || 0) + 1
    }
  }
  return counts
})
function extraCount(playerId) {
  return extraCountByPlayer.value[playerId] || 0
}

// Spillere som allerede er lånt ut i en ANNEN kamp samme uke — skal ikke
// anbefales på nytt (sprer ekstra-kamper i stedet for å belaste de samme).
function mondayOf(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const day = (d.getDay() + 6) % 7 // 0 = mandag
  d.setDate(d.getDate() - day)
  return d.toISOString().slice(0, 10)
}
const loanedElsewhereThisWeek = computed(() => {
  const out = new Set()
  const date = match.value?.match_date
  if (!date) return out
  const wk = mondayOf(date)
  for (const mp of matchPlayers.value) {
    if (mp.match_id === match.value.id) continue
    const m = matches.value.find(x => x.id === mp.match_id)
    if (m?.match_date && mondayOf(m.match_date) === wk) out.add(mp.player_id)
  }
  return out
})

// Lånespillere i tre grupper: Valgt (allerede på kampen), Anbefalt (egnet,
// uten konflikt, ikke allerede lånt denne uka — færrest ekstra først), Andre.
const selectedLoans = computed(() =>
  availablePlayers.value.filter(p => matchPlayerIds.value.includes(p.id))
)
const recommendedLoans = computed(() =>
  availablePlayers.value
    .filter(p =>
      !matchPlayerIds.value.includes(p.id) &&
      p.loan_eligible &&
      !playerConflicts.value[p.id] &&
      !loanedElsewhereThisWeek.value.has(p.id)
    )
    .sort((a, b) => extraCount(a.id) - extraCount(b.id) || a.name.localeCompare(b.name, 'no'))
)
const otherLoans = computed(() => {
  const shown = new Set([...selectedLoans.value, ...recommendedLoans.value].map(p => p.id))
  return availablePlayers.value.filter(p => !shown.has(p.id))
})

const teamLabels = TEAM_LABELS

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
        ? colorFromName(m.home_team) : null
      const awayColor = (m.away_team || '').toLowerCase().includes('halsen')
        ? colorFromName(m.away_team) : null
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

// ─── Målscorere ──────────────────────────────────────────────────────────────
const matchGoals = computed(() => {
  if (!match.value) return []
  return allGoals.value
    .filter(g => g.match_id === match.value.id)
    .slice()
    .sort((a, b) => a.position - b.position)
})

// Aggregert per spiller: { player_id, player, count, goalIds, firstPosition }
const aggregatedScorers = computed(() => {
  const groups = new Map()
  for (const g of matchGoals.value) {
    if (!groups.has(g.player_id)) {
      groups.set(g.player_id, {
        player_id: g.player_id,
        player: getPlayerById(g.player_id),
        count: 0,
        goalIds: [],
        firstPosition: g.position
      })
    }
    const entry = groups.get(g.player_id)
    entry.count++
    entry.goalIds.push(g.id)
  }
  return Array.from(groups.values()).sort((a, b) => a.firstPosition - b.firstPosition)
})

function goalCountForPlayer(playerId) {
  return matchGoals.value.filter(g => g.player_id === playerId).length
}

// Halsens mål — home_score hvis vi er hjemme, away_score hvis vi er borte
const halsenGoalCount = computed(() => {
  if (!match.value) return null
  return isHomeMatch.value ? match.value.home_score : match.value.away_score
})

const goalCountMismatch = computed(() => {
  const halsen = halsenGoalCount.value
  if (halsen === null || halsen === undefined) return false
  return matchGoals.value.length > 0 && matchGoals.value.length !== halsen
})

function openScorerSheet(preselectPlayerId = '') {
  lastTappedPlayerId.value = preselectPlayerId
  showNewPlayerForm.value = false
  newPlayerName.value = ''
  newPlayerTeam.value = ''
  showScorerSheet.value = true
}

function closeScorerSheet() {
  showScorerSheet.value = false
  lastTappedPlayerId.value = ''
}

async function tapPlayerInPicker(playerId) {
  lastTappedPlayerId.value = playerId
  await addGoal(match.value.id, { player_id: playerId })
}

const lastTappedScorerEntry = computed(() => {
  if (!lastTappedPlayerId.value) return null
  return aggregatedScorers.value.find(s => s.player_id === lastTappedPlayerId.value) || null
})

async function removeLastGoalForActivePlayer() {
  const entry = lastTappedScorerEntry.value
  if (!entry || entry.goalIds.length === 0) return
  const goalId = entry.goalIds[entry.goalIds.length - 1]
  await removeGoal(goalId)
}

async function quickAddPlayer() {
  const name = newPlayerName.value.trim()
  if (!name) return
  const p = await addPlayer(name, newPlayerTeam.value)
  if (p) {
    // Hvis spilleren har et lag som ikke er en av Halsens lag i kampen,
    // er de en lånespiller → registrer dem automatisk slik.
    if (p.primary_team && !teamColors.value.includes(p.primary_team)) {
      const currentIds = [...matchPlayerIds.value]
      if (!currentIds.includes(p.id)) {
        currentIds.push(p.id)
        await setMatchPlayers(match.value.id, currentIds)
        matchPlayerIds.value = currentIds
      }
    }
    // Registrer mål med en gang
    await addGoal(match.value.id, { player_id: p.id })
    lastTappedPlayerId.value = p.id
    showNewPlayerForm.value = false
    newPlayerName.value = ''
    newPlayerTeam.value = ''
    showToast(`Mål til ${p.name}`, 'success')
  }
}

// Eligible scorers: spillere fra Halsen-laget(ene) i denne kampen + lånespillere.
// Spillere uten lag er alltid inkludert (ukategoriserte kan brukes overalt).
const eligiblePlayers = computed(() => {
  const matchTeams = teamColors.value
  const guestIds = new Set(matchPlayerIds.value)
  return players.value.filter(p => {
    if (guestIds.has(p.id)) return true
    if (!p.primary_team) return true
    return matchTeams.includes(p.primary_team)
  })
})

const playersByTeam = computed(() => {
  const groups = { gronn: [], rod: [], hvit: [], other: [] }
  for (const p of [...eligiblePlayers.value].sort((a, b) => a.name.localeCompare(b.name))) {
    const t = p.primary_team || 'other'
    if (groups[t]) groups[t].push(p)
    else groups.other.push(p)
  }
  return groups
})

// ─── Kampreferat — eksplisitt lagring ────────────────────────────────────────
const isReportChanged = computed(() => {
  if (!match.value) return false
  return reportInput.value !== (match.value.report || '')
})

async function saveReport() {
  if (!isReportChanged.value || !match.value) return
  await updateMatch(match.value.id, { report: reportInput.value })
  match.value.report = reportInput.value
  reportSavedAt.value = new Date()
  // Etter lagring: gå til lese-modus hvis det er noe innhold
  if (reportInput.value.trim()) isEditingReport.value = false
  showToast('Referat lagret', 'success')
}

function startEditingReport() {
  isEditingReport.value = true
}

function cancelEditingReport() {
  // Tilbakestill input til lagret versjon, gå til lese-modus
  reportInput.value = match.value.report || ''
  isEditingReport.value = false
}

const reportSavedLabel = computed(() => {
  if (!reportSavedAt.value) return ''
  const d = reportSavedAt.value
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `Lagret kl ${hh}:${mm}`
})

// ─── Summary-chips for collapsed disclosure-headere (lese-modus) ──────────────
const refereeSummary = computed(() => match.value?.referee || '')

const payerSummary = computed(() => {
  if (!expense.value) return ''
  const c = coaches.value.find(c => c.id === expense.value.paid_by)
  if (!c) return ''
  const amt = expense.value.amount || match.value?.fee_amount || 200
  return `${c.name} · ${amt} kr`
})

// Chips i collapsed summary (lese-modus)
const selectedLanespillere = computed(() => {
  return matchPlayerIds.value
    .map(id => players.value.find(p => p.id === id))
    .filter(Boolean)
})

const selectedCoaches = computed(() => {
  return matchCoachIds.value
    .map(id => coaches.value.find(c => c.id === id))
    .filter(Boolean)
})

// Begrens chip-rader i summary: vis maks `max`, resten som "+N".
function cappedList(list, max = 3) {
  return { shown: list.slice(0, max), extra: Math.max(0, list.length - max) }
}

function focusSummaryGroup() {
  open.value.summary = true
  setTimeout(() => {
    const el = document.querySelector('[data-section="summary"]')
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, 60)
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
            >{{ teamLabels[color] }}</span>
            {{ formattedDate }}<template v-if="match.match_time && match.match_time.substring(0, 5) !== '00:00'"> · {{ match.match_time.substring(0, 5) }}</template><template v-if="match.round"> · Runde {{ match.round }}</template>
          </span>
          <button
            type="button"
            class="match-card__edit-btn"
            aria-label="Mer"
            @click="showMatchMenu = true"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="5" cy="12" r="1"/>
              <circle cx="12" cy="12" r="1"/>
              <circle cx="19" cy="12" r="1"/>
            </svg>
          </button>
        </div>
        <div class="match-card__teams match-detail-teams">
          <span class="match-card__team">{{ match.home_team }}</span>
          <button
            v-if="hasResult"
            type="button"
            class="match-detail-score"
            aria-label="Rediger resultat"
            @click="focusSummaryGroup"
          >
            <span class="match-detail-score__num">{{ match.home_score }}</span>
            <span class="match-detail-score__dash">—</span>
            <span class="match-detail-score__num">{{ match.away_score }}</span>
          </button>
          <span v-else class="match-card__vs">vs</span>
          <span class="match-card__team">{{ match.away_team }}</span>
        </div>
      </div>
    </div>

    <!-- Match mode — live spilletid & bytter -->
    <div class="px-lg mt-lg">
      <button type="button" class="match-mode-cta" @click="router.push(`/kamp/${match.id}/live`)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>
        </svg>
        Match mode
      </button>
    </div>

    <!-- Action sections — 3 grouped disclosures (collapsed = lese, expanded = edit) -->
    <div class="px-lg mt-lg detail-disclosures">

      <!-- Gruppe 1: Dommer & utlegg (kun på hjemmekamper — vi har ikke dommer-ansvar borte) -->
      <DisclosureSection
        v-if="isHomeMatch"
        v-model="open.logistics"
        :style="{ order: sectionOrder.logistics }"
        label="Dommer & utlegg"
        empty-text="Ikke satt"
        :has-content="!!(refereeSummary || payerSummary)"
      >
        <template #summary>
          <span v-if="refereeSummary" class="sum-chip sum-chip--referee">{{ refereeSummary }}</span>
          <span v-if="payerSummary" class="sum-chip sum-chip--payer">{{ payerSummary }}</span>
        </template>

        <!-- Dommer -->
        <div class="sub-section">
          <div class="referee-pills">
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

        <!-- Hvem la ut -->
        <div class="sub-section">
          <div class="sub-section__label sub-section__label--soft">Hvem la ut?</div>
          <div class="payer-grid">
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
      </DisclosureSection>

      <!-- Gruppe 2: Kamptropp — laget, lånespillere og trenere -->
      <DisclosureSection
        v-model="open.team"
        data-section="team"
        :style="{ order: sectionOrder.team }"
        label="Tropp"
        empty-text="Ingen"
        :has-content="!!(teamSquad.length || selectedLanespillere.length || selectedCoaches.length)"
      >
        <template #summary>
          <span v-if="teamSquad.length" class="sum-chip sum-chip--squad">{{ availableCount }} på laget</span>
          <span
            v-for="p in cappedList(selectedLanespillere, 2).shown"
            :key="p.id"
            :class="['lanespiller-chip', p.primary_team ? `lanespiller-chip--${p.primary_team}` : '']"
          >{{ p.name }}</span>
          <span v-if="cappedList(selectedLanespillere, 2).extra" class="sum-chip sum-chip--more">+{{ cappedList(selectedLanespillere, 2).extra }} lån</span>
          <span v-if="selectedCoaches.length" class="coach-avatar-pile">
            <span
              v-for="c in selectedCoaches"
              :key="c.id"
              :data-coach="c.name.toLowerCase()"
              class="coach-face"
              :title="c.name"
            >
              <img v-if="c.image" :src="c.image" :alt="c.name" />
              <span v-else>{{ c.name.charAt(0) }}</span>
            </span>
          </span>
        </template>

        <!-- Laget — basistropp med frafall -->
        <div v-if="teamSquad.length" class="sub-section">
          <div class="sub-section__label">
            Laget
            <span class="sub-section__count">{{ availableCount }} av {{ teamSquad.length }} tilgjengelig</span>
          </div>
          <div class="referee-pills">
            <button
              v-for="p in teamSquad"
              :key="p.id"
              :data-team="p.primary_team"
              :class="['squad-pill', { 'squad-pill--out': matchAbsenceIds.includes(p.id) }]"
              :title="matchAbsenceIds.includes(p.id) ? 'Frafall — trykk for å ta tilbake' : 'Trykk for å melde frafall'"
              @click="handleToggleAbsence(p.id)"
            >
              {{ p.name }}
              <span v-if="matchAbsenceIds.includes(p.id)" class="squad-pill__out-tag">ute</span>
            </button>
          </div>
        </div>

        <!-- Lånespillere -->
        <div class="sub-section">
          <div class="sub-section__label sub-section__label--soft">Lånespillere</div>
          <div v-if="players.length === 0" class="hospitant-empty" style="margin: 0;">
            Ingen spillere i poolen.
          </div>
          <template v-else>
            <!-- Valgt -->
            <div v-if="selectedLoans.length" class="loan-group">
              <div class="loan-group__label">Valgt</div>
              <div class="referee-pills">
                <button
                  v-for="p in selectedLoans"
                  :key="p.id"
                  class="referee-pill loan-pill referee-pill--selected"
                  @click="togglePlayer(p.id)"
                >
                  {{ p.name }}<span v-if="p.primary_team" class="hospitant-pill__team"> · {{ teamLabels[p.primary_team] }}</span>
                  <span class="extra-badge" :class="{ 'extra-badge--zero': !extraCount(p.id) }" :title="`${extraCount(p.id)} ekstra kamper i sesongen`">{{ extraCount(p.id) }}</span>
                </button>
              </div>
            </div>

            <!-- Anbefalt -->
            <div v-if="recommendedLoans.length" class="loan-group">
              <div class="loan-group__label"><span class="loan-group__star">★</span> Anbefalt</div>
              <div class="referee-pills">
                <button
                  v-for="p in recommendedLoans"
                  :key="p.id"
                  :class="['referee-pill loan-pill', { 'referee-pill--selected': matchPlayerIds.includes(p.id) }]"
                  @click="togglePlayer(p.id)"
                >
                  {{ p.name }}<span v-if="p.primary_team" class="hospitant-pill__team"> · {{ teamLabels[p.primary_team] }}</span>
                  <span class="extra-badge" :class="{ 'extra-badge--zero': !extraCount(p.id) }" :title="`${extraCount(p.id)} ekstra kamper i sesongen`">{{ extraCount(p.id) }}</span>
                </button>
              </div>
            </div>

            <!-- Andre -->
            <div v-if="otherLoans.length" class="loan-group">
              <div v-if="selectedLoans.length || recommendedLoans.length" class="loan-group__label loan-group__label--muted">Andre</div>
              <div class="referee-pills">
                <button
                  v-for="p in otherLoans"
                  :key="p.id"
                  :class="[
                    'referee-pill loan-pill',
                    {
                      'referee-pill--selected': matchPlayerIds.includes(p.id),
                      'referee-pill--conflict': playerConflicts[p.id]
                    }
                  ]"
                  @click="togglePlayer(p.id)"
                >
                  {{ p.name }}<span v-if="p.primary_team" class="hospitant-pill__team"> · {{ teamLabels[p.primary_team] }}</span>
                  <span v-if="!playerConflicts[p.id]" class="extra-badge" :class="{ 'extra-badge--zero': !extraCount(p.id) }" :title="`${extraCount(p.id)} ekstra kamper i sesongen`">{{ extraCount(p.id) }}</span>
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

            <div v-if="!availablePlayers.length" class="hospitant-empty" style="margin: 0;">
              Ingen tilgjengelige lånespillere for denne kampen.
            </div>
          </template>
        </div>

        <!-- Trenere -->
        <div class="sub-section">
          <div class="sub-section__label sub-section__label--soft">Trenere</div>
          <div class="coach-pills">
            <button
              v-for="c in coaches"
              :key="c.id"
              type="button"
              :data-coach="c.name.toLowerCase()"
              :class="['coach-pill', { 'coach-pill--selected': matchCoachIds.includes(c.id) }]"
              @click="toggleCoach(c.id)"
            >
              <span class="coach-pill__avatar">
                <img v-if="c.image" :src="c.image" :alt="c.name" />
                <span v-else>{{ c.name.charAt(0) }}</span>
              </span>
              <span class="coach-pill__name">{{ c.name }}</span>
            </button>
          </div>
        </div>
      </DisclosureSection>

      <!-- Gruppe 3: Resultat, scorere & kampreferat (bunn) -->
      <DisclosureSection
        v-model="open.summary"
        data-section="summary"
        :style="{ order: sectionOrder.summary }"
        label="Resultat"
        empty-text="Ikke spilt"
        :has-content="!!(hasResult || match.report)"
      >
        <template #summary>
          <span v-if="hasResult" class="sum-chip sum-chip--score">{{ match.home_score }}–{{ match.away_score }}</span>
          <span v-if="match.report" class="sum-chip sum-chip--more">Referat</span>
        </template>

        <!-- Resultat: score + scorere som én enhet -->
        <div class="sub-section">
          <div class="score-edit">
            <div class="score-edit__side">
              <input
                v-model="homeScoreInput"
                type="number"
                min="0"
                max="99"
                inputmode="numeric"
                class="ds-input score-edit__input"
                :aria-label="`Mål for ${match.home_team}`"
                @blur="saveResult"
                @keydown.enter="$event.target.blur()"
              />
              <span class="score-edit__team">{{ match.home_team }}</span>
            </div>
            <span class="score-edit__dash">–</span>
            <div class="score-edit__side">
              <input
                v-model="awayScoreInput"
                type="number"
                min="0"
                max="99"
                inputmode="numeric"
                class="ds-input score-edit__input"
                :aria-label="`Mål for ${match.away_team}`"
                @blur="saveResult"
                @keydown.enter="$event.target.blur()"
              />
              <span class="score-edit__team">{{ match.away_team }}</span>
            </div>
          </div>
          <button
            v-if="hasResult"
            type="button"
            class="ds-btn ds-btn--ghost ds-btn--sm result-clear-btn"
            @click="clearResult"
          >
            Fjern resultat
          </button>

          <div class="sub-section__label scorers-label">Scorere</div>
          <div class="referee-pills scorer-pills">
            <button
              v-for="s in aggregatedScorers"
              :key="s.player_id"
              type="button"
              :class="[
                'referee-pill scorer-pill',
                s.player?.primary_team ? `scorer-pill--${s.player.primary_team}` : ''
              ]"
              @click="openScorerSheet(s.player_id)"
            >
              {{ s.player?.name || 'Ukjent' }}<span
                v-if="s.count > 1"
                class="scorer-pill__count"
              > ×{{ s.count }}</span>
            </button>
            <button
              type="button"
              class="referee-pill referee-pill--other"
              @click="openScorerSheet()"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Scorer
            </button>
          </div>
          <div v-if="goalCountMismatch" class="scorers-block__hint">
            Antall scorere ({{ matchGoals.length }}) matcher ikke Halsen-mål ({{ halsenGoalCount }}).
          </div>
        </div>

        <!-- Kampreferat -->
        <div class="sub-section">
          <div class="sub-section__label">
            Kampreferat
            <button
              v-if="!isEditingReport && match.report"
              type="button"
              class="report-edit-link"
              @click="startEditingReport"
            >
              Rediger
            </button>
          </div>

          <!-- LESE-MODUS: vis lagret referat som tekst -->
          <div v-if="!isEditingReport && match.report" class="report-read">
            {{ match.report }}
          </div>

          <!-- EDIT-MODUS: textarea + Lagre/Avbryt -->
          <template v-else>
            <textarea
              v-model="reportInput"
              class="ds-input report-textarea"
              rows="6"
              maxlength="1000"
              placeholder="Skriv kort om kampen — taktikk, høydepunkter, læring …"
            ></textarea>
            <div class="report-meta">
              <span class="report-meta__count">{{ reportInput.length }} / 1000</span>
              <span v-if="reportSavedLabel && !isReportChanged" class="report-meta__saved">{{ reportSavedLabel }}</span>
            </div>
            <div class="report-edit-actions">
              <button
                v-if="match.report"
                type="button"
                class="ds-btn ds-btn--secondary report-cancel-btn"
                @click="cancelEditingReport"
              >
                Avbryt
              </button>
              <button
                type="button"
                class="ds-btn ds-btn--primary report-save-btn"
                :disabled="!isReportChanged"
                @click="saveReport"
              >
                {{ isReportChanged ? 'Lagre referat' : 'Lagret' }}
              </button>
            </div>
          </template>
        </div>
      </DisclosureSection>
    </div>

    <!-- Match-meny (⋯-ikon på match-card) — endre tidspunkt + slett -->
    <Sheet :show="showMatchMenu" title="Mer" @close="showMatchMenu = false">
      <div class="match-menu">
        <button
          type="button"
          class="match-menu__item"
          @click="showMatchMenu = false; openEditDateTime()"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          Endre tidspunkt
        </button>
        <button
          type="button"
          class="match-menu__item match-menu__item--danger"
          @click="showMatchMenu = false; showDeleteDialog = true"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
            <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
          </svg>
          Slett kamp
        </button>
      </div>
    </Sheet>

    <!-- Ny dommer sheet (mounted at root so disclosure-toggle ikke unmounter input-state) -->
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

    <!-- Målscorer sheet — tap-to-increment-flow -->
    <Sheet :show="showScorerSheet" title="Mål" @close="closeScorerSheet">
      <div class="scorer-form">
        <div v-if="players.length === 0 && !showNewPlayerForm" class="hospitant-empty" style="margin: 0;">
          Ingen spillere i poolen ennå — legg til en spiller for å registrere mål.
        </div>

        <div v-else-if="!eligiblePlayers.length && !showNewPlayerForm" class="hospitant-empty" style="margin: 0;">
          Ingen aktuelle spillere for dette laget — opprett en ny spiller eller legg til en lånespiller først.
        </div>

        <template v-else>
          <p class="scorer-form__hint">Trykk på spiller for å registrere mål. Trykk flere ganger for flere mål.</p>
          <div class="scorer-picker">
            <template v-for="team in ['gronn', 'rod', 'hvit', 'other']" :key="team">
              <div
                v-if="playersByTeam[team].length"
                class="scorer-picker__group"
              >
                <div class="scorer-picker__group-label">
                  {{ team === 'other' ? 'Uten lag' : teamLabels[team] }}
                </div>
                <div class="scorer-picker__row">
                  <button
                    v-for="p in playersByTeam[team]"
                    :key="p.id"
                    type="button"
                    :class="[
                      'scorer-picker__chip',
                      p.primary_team ? `scorer-picker__chip--${p.primary_team}` : '',
                      { 'scorer-picker__chip--active': lastTappedPlayerId === p.id },
                      { 'scorer-picker__chip--has-goals': goalCountForPlayer(p.id) > 0 }
                    ]"
                    @click="tapPlayerInPicker(p.id)"
                  >
                    {{ p.name }}<span
                      v-if="goalCountForPlayer(p.id) > 0"
                      class="scorer-picker__chip-count"
                    > ×{{ goalCountForPlayer(p.id) }}</span>
                  </button>
                </div>
              </div>
            </template>
          </div>
        </template>

        <button
          v-if="!showNewPlayerForm"
          type="button"
          class="ds-btn ds-btn--ghost scorer-form__newplayer-btn"
          @click="showNewPlayerForm = true"
        >
          + Ny spiller
        </button>

        <div v-else class="scorer-form__newplayer">
          <input
            v-model="newPlayerName"
            class="ds-input"
            placeholder="Navn"
            @keydown.enter="quickAddPlayer"
          />
          <div class="scorer-form__team-row">
            <button
              v-for="team in ['gronn', 'rod', 'hvit']"
              :key="team"
              type="button"
              :class="[
                'scorer-picker__chip',
                `scorer-picker__chip--${team}`,
                { 'scorer-picker__chip--selected': newPlayerTeam === team }
              ]"
              @click="newPlayerTeam = newPlayerTeam === team ? '' : team"
            >
              {{ teamLabels[team] }}
            </button>
          </div>
          <div class="scorer-form__newplayer-actions">
            <button
              type="button"
              class="ds-btn ds-btn--secondary"
              @click="showNewPlayerForm = false"
            >
              Avbryt
            </button>
            <button
              type="button"
              class="ds-btn ds-btn--primary"
              :disabled="!newPlayerName.trim()"
              @click="quickAddPlayer"
            >
              Lagre + 1 mål
            </button>
          </div>
        </div>

        <!-- Bunn-actions: fjern fra siste tappet (når den har mål) + Ferdig -->
        <div class="scorer-form__bottom">
          <button
            v-if="lastTappedScorerEntry && lastTappedScorerEntry.count > 0"
            type="button"
            class="ds-btn ds-btn--secondary scorer-form__remove"
            @click="removeLastGoalForActivePlayer"
          >
            − Fjern mål fra {{ lastTappedScorerEntry.player?.name || 'spiller' }}
          </button>
          <button
            type="button"
            class="ds-btn ds-btn--primary scorer-form__done"
            @click="closeScorerSheet"
          >
            Ferdig
          </button>
        </div>
      </div>
    </Sheet>

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

/* Match mode CTA */
.match-mode-cta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 14px;
  border: 1.5px solid var(--ds-color-accent);
  border-radius: var(--ds-radius-lg);
  background: var(--ds-color-accent);
  color: var(--ds-color-accent-text);
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-md);
  font-weight: var(--ds-weight-bold);
  cursor: pointer;
  transition: transform 160ms var(--ds-ease-pop, ease), filter 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}

.match-mode-cta svg {
  width: 18px;
  height: 18px;
}

.match-mode-cta:active {
  transform: scale(0.98);
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
  gap: 14px;
}

.match-detail-card .match-card__team {
  flex: none;
}

.match-detail-card .match-card__team:last-child {
  text-align: left;
}

/* Score-blokk på match-card (tappbar — åpner Resultat-seksjonen) */
.match-detail-score {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  padding: 6px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  font-family: var(--ds-font-body);
  font-size: 1.75rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--ds-color-text-primary);
  letter-spacing: -0.01em;
  line-height: 1;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1), background 0.15s ease;
}

.match-detail-score:active {
  transform: scale(0.96);
}

@media (hover: hover) and (pointer: fine) {
  .match-detail-score:hover {
    background: var(--ds-color-bg-elevated);
  }
}

.match-detail-score__dash {
  font-weight: 500;
  color: var(--ds-color-text-tertiary);
  font-size: 1.25rem;
}

.match-detail-card .match-card__team-tag {
  display: inline-block;
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: var(--ds-radius-sm);
  letter-spacing: 0.02em;
  margin-right: 4px;
}

.match-detail-card .match-card__team-tag--gronn {
  background: var(--ds-team-gronn-bg);
  color: var(--ds-team-gronn);
}

.match-detail-card .match-card__team-tag--rod {
  background: var(--ds-team-rod-bg);
  color: var(--ds-team-rod);
}

.match-detail-card .match-card__team-tag--hvit {
  background: var(--ds-team-hvit-bg);
  color: var(--ds-team-hvit);
  border: 1px solid var(--ds-team-hvit-border);
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
  border-radius: var(--ds-radius-full);
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
  border-radius: var(--ds-radius-md);
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
  border-radius: var(--ds-radius-md);
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
  border-radius: var(--ds-radius-full);
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
/* Score som helten — ekko-er kort-scoren, lagnavn som caption */
.score-edit {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: var(--ds-space-md);
  margin-top: var(--ds-space-xs);
}

.score-edit__side {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
  max-width: 120px;
}

.score-edit__input {
  width: 72px;
  height: 60px;
  padding: 0;
  text-align: center;
  font-family: var(--ds-font-display-sans, var(--ds-font-body));
  font-size: 1.75rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
  -moz-appearance: textfield;
}

.score-edit__input::-webkit-outer-spin-button,
.score-edit__input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.score-edit__dash {
  font-size: 1.5rem;
  font-weight: 500;
  color: var(--ds-color-text-tertiary);
  margin-top: 16px;
}

.score-edit__team {
  font-size: 0.75rem;
  color: var(--ds-color-text-tertiary);
  text-align: center;
  line-height: 1.25;
}

.result-clear-btn {
  display: block;
  margin: var(--ds-space-sm) auto 0;
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

/* ─── Kamptropp: laget (frafall) + lånespiller-grupper ──────────────── */
.sub-section__count {
  margin-left: 8px;
  font-weight: var(--ds-weight-regular);
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-tertiary);
}

/* Laget-chips — lagfarget (egen tropp), trykk veksler frafall */
.squad-pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 14px;
  border: 1.5px solid transparent; border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-subtle); color: var(--ds-color-text-secondary);
  font-family: var(--ds-font-body); font-size: 0.8125rem; font-weight: var(--ds-weight-semibold);
  cursor: pointer; transition: all 0.15s ease; -webkit-tap-highlight-color: transparent;
}
.squad-pill[data-team="gronn"] { background: var(--ds-team-gronn-bg); color: var(--ds-team-gronn); }
.squad-pill[data-team="rod"]   { background: var(--ds-team-rod-bg);   color: var(--ds-team-rod); }
.squad-pill[data-team="hvit"]  { background: var(--ds-team-hvit-bg);  color: var(--ds-team-hvit); border-color: var(--ds-team-hvit-border); }
.squad-pill--out {
  text-decoration: line-through;
  opacity: 0.45;
  border-style: dashed;
  background: var(--ds-color-bg-subtle) !important;
  color: var(--ds-color-text-tertiary) !important;
}
.squad-pill__out-tag {
  text-decoration: none;
  font-size: 0.625rem;
  font-weight: var(--ds-weight-bold);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ds-color-error);
}

/* Lånespiller-grupper */
.loan-group { margin-top: var(--ds-space-sm); }
.loan-group:first-child { margin-top: 0; }
.loan-group__label {
  display: flex; align-items: center; gap: 5px;
  font-size: var(--ds-text-xs); font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-secondary);
  margin-bottom: var(--ds-space-sm);
}
.loan-group__label--muted { color: var(--ds-color-text-tertiary); }
.loan-group__star { color: var(--ds-color-warning); font-size: 12px; }

/* Ekstra-kamper-badge på lånespiller-chip */
.extra-badge {
  display: inline-grid; place-items: center;
  min-width: 18px; height: 18px; padding: 0 5px; margin-left: 2px;
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-subtle); color: var(--ds-color-text-secondary);
  font-size: 0.6875rem; font-weight: var(--ds-weight-bold); font-variant-numeric: tabular-nums;
}
.extra-badge--zero { opacity: 0.5; }
.referee-pill--selected .extra-badge { background: rgba(255,255,255,0.22); color: #fff; }

.loan-hint {
  margin: var(--ds-space-sm) 0 0;
  font-size: var(--ds-text-xs); color: var(--ds-color-text-tertiary);
}

.sum-chip--squad {
  background: var(--ds-color-bg-subtle);
  color: var(--ds-color-text-secondary);
  font-weight: var(--ds-weight-semibold);
}

/* ─── Match-meny (⋯-sheet) ──────────────────────────────────────────── */
.match-menu {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 0;
}

.match-menu__item {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 14px 4px;
  background: transparent;
  border: none;
  border-radius: 10px;
  font-family: var(--ds-font-body);
  font-size: 0.9375rem;
  font-weight: 500;
  color: var(--ds-color-text-primary);
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  min-height: 48px;
  transition: background 0.15s ease, transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
}

.match-menu__item:active {
  transform: scale(0.99);
}

@media (hover: hover) and (pointer: fine) {
  .match-menu__item:hover {
    background: var(--ds-color-bg-elevated);
  }
}

.match-menu__item--danger {
  color: var(--ds-color-error);
}

.match-menu__item svg {
  flex-shrink: 0;
}

/* ─── Summary-chips i collapsed disclosure-headere (lese-modus) ───────── */
.sum-chip {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg);
  border: 1px solid var(--ds-color-border-light);
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--ds-color-text-primary);
  white-space: nowrap;
}

.sum-chip--score {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}

.sum-chip--more {
  color: var(--ds-color-text-tertiary);
  font-weight: 600;
}

.lanespiller-chip {
  display: inline-flex;
  align-items: center;
  padding: 3px 9px 3px 18px;
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg);
  border: 1px solid var(--ds-color-border-light);
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--ds-color-text-primary);
  position: relative;
}

.lanespiller-chip::before {
  content: '';
  position: absolute;
  left: 7px;
  top: 50%;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  transform: translateY(-50%);
  background: var(--ds-color-text-tertiary);
}

.lanespiller-chip--gronn::before { background: var(--ds-team-gronn); }
.lanespiller-chip--rod::before { background: var(--ds-team-rod); }
.lanespiller-chip--hvit::before {
  background: var(--ds-team-hvit-bg);
  border: 1px solid var(--ds-team-hvit-border);
}

/* ─── Sub-sections inni grupperte disclosures ─────────────────────────── */
.detail-disclosures {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sub-section {
  padding-top: 16px;
}

.sub-section:first-child {
  padding-top: 4px;
}

.sub-section + .sub-section {
  margin-top: 20px;
  padding-top: 4px;
}

.sub-section__label {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
  color: var(--ds-color-text-secondary);
  margin-bottom: 8px;
}

.sub-section__hint {
  font-size: 0.6875rem;
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
  color: var(--ds-color-success, var(--ds-color-text-tertiary));
  margin-left: auto;
}

.sub-section__label--soft {
  font-size: 0.75rem;
  letter-spacing: 0;
  font-weight: 500;
  color: var(--ds-color-text-tertiary);
  margin-bottom: 8px;
}

/* ─── Målscorere ──────────────────────────────────────────────────────── */
.scorer-pills {
  margin-bottom: 10px;
}

.scorer-pill {
  position: relative;
  padding-left: 18px;
}

.scorer-pill__count {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  margin-left: 4px;
}

/* Scorer-edit-sheet ─ vis spillerinfo + fjern-knapper */
.scorer-edit-summary {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: 16px 14px;
  border: 1px solid var(--ds-color-border-light);
  border-radius: var(--ds-radius-md);
  background: var(--ds-color-bg-elevated);
}

.scorer-edit-summary__chip {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px 4px 22px;
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg);
  border: 1px solid var(--ds-color-border);
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--ds-color-text-primary);
  position: relative;
}

.scorer-edit-summary__chip::before {
  content: '';
  position: absolute;
  left: 9px;
  top: 50%;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  transform: translateY(-50%);
  background: var(--ds-color-text-tertiary);
}

.scorer-edit-summary__chip.scorer-picker__chip--gronn::before { background: var(--ds-team-gronn); }
.scorer-edit-summary__chip.scorer-picker__chip--rod::before { background: var(--ds-team-rod); }
.scorer-edit-summary__chip.scorer-picker__chip--hvit::before {
  background: var(--ds-team-hvit-bg);
  border: 1px solid var(--ds-team-hvit-border);
}

.scorer-edit-summary__text {
  font-size: 0.875rem;
  color: var(--ds-color-text-secondary);
  line-height: 1.4;
}

.scorer-edit-summary__text strong {
  color: var(--ds-color-text-primary);
  font-weight: 700;
}

.scorer-pill::before {
  content: '';
  position: absolute;
  left: 6px;
  top: 50%;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  transform: translateY(-50%);
  background: var(--ds-color-text-tertiary);
}

.scorer-pill--gronn::before { background: var(--ds-team-gronn); }
.scorer-pill--rod::before { background: var(--ds-team-rod); }
.scorer-pill--hvit::before {
  background: var(--ds-team-hvit-bg);
  border: 1px solid var(--ds-team-hvit-border);
}

.scorers-label {
  margin-top: var(--ds-space-lg);
}

.scorers-block__hint {
  margin-top: 10px;
  font-size: 0.75rem;
  color: var(--ds-color-warm-text, var(--ds-color-text-tertiary));
  font-style: italic;
}

/* Scorer-Sheet */
.scorer-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 12px;
}

.scorer-form__label {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
}

.scorer-picker {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.scorer-picker__group-label {
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
  margin-bottom: 6px;
}

.scorer-picker__row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.scorer-picker__chip {
  padding: 10px 16px 10px 26px;
  min-height: 44px;
  border: 1.5px solid var(--ds-color-border);
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-elevated);
  font-family: var(--ds-font-body);
  font-size: 0.9375rem;
  font-weight: 500;
  color: var(--ds-color-text-secondary);
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
  -webkit-tap-highlight-color: transparent;
  position: relative;
}

.scorer-picker__chip--has-goals {
  border-color: var(--ds-color-accent);
  color: var(--ds-color-text-primary);
  font-weight: 600;
}

.scorer-picker__chip--active {
  background: var(--ds-color-accent);
  border-color: var(--ds-color-accent);
  color: var(--ds-color-accent-text);
}

.scorer-picker__chip--active::before {
  /* prikken er fortsatt fargestripe, sikre kontrast på mørk accent */
  outline: 2px solid var(--ds-color-accent-text);
  outline-offset: -1px;
}

.scorer-picker__chip-count {
  font-weight: 700;
  margin-left: 4px;
  font-variant-numeric: tabular-nums;
}

.scorer-picker__chip:active {
  transform: scale(0.97);
}

.scorer-picker__chip::before {
  content: '';
  position: absolute;
  left: 8px;
  top: 50%;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  transform: translateY(-50%);
  background: var(--ds-color-text-tertiary);
}

.scorer-picker__chip--gronn::before { background: var(--ds-team-gronn); }
.scorer-picker__chip--rod::before { background: var(--ds-team-rod); }
.scorer-picker__chip--hvit::before {
  background: var(--ds-team-hvit-bg);
  border: 1px solid var(--ds-team-hvit-border);
}

.scorer-picker__chip--selected {
  border-color: var(--ds-color-accent);
  background: var(--ds-color-accent);
  color: var(--ds-color-accent-text);
}

.scorer-form__newplayer-btn {
  align-self: flex-start;
  color: var(--ds-color-accent);
  min-height: 44px;
  padding: 10px 16px;
  font-size: 0.9375rem;
}

.scorer-form__hint {
  margin: 0 0 4px;
  font-size: 0.8125rem;
  color: var(--ds-color-text-tertiary);
  line-height: 1.4;
}

.scorer-form__bottom {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
  padding-top: 14px;
  border-top: 1px solid var(--ds-color-border-light);
}

.scorer-form__remove {
  min-height: 48px;
  font-size: 0.9375rem;
  font-weight: 600;
  padding: 12px 20px;
  border-radius: var(--ds-radius-md);
  width: 100%;
  color: var(--ds-color-error);
  border-color: var(--ds-color-error-light, var(--ds-color-border));
}

.scorer-form__done {
  min-height: 52px;
  font-size: 1rem;
  font-weight: 600;
  padding: 14px 20px;
  border-radius: var(--ds-radius-md);
  width: 100%;
}

.scorer-form__newplayer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px dashed var(--ds-color-border);
  border-radius: 10px;
  background: var(--ds-color-bg-elevated);
}

.scorer-form__team-row {
  display: flex;
  gap: 6px;
}

.scorer-form__newplayer-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.scorer-form__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.scorer-form__spacer { flex: 1; }

.scorer-form__delete {
  color: var(--ds-color-error);
}

/* ─── Kampreferat ─────────────────────────────────────────────────────── */
.report-textarea {
  width: 100%;
  resize: vertical;
  min-height: 120px;
  line-height: 1.5;
  font-family: var(--ds-font-body);
}

.report-meta {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 0.75rem;
  color: var(--ds-color-text-tertiary);
  font-variant-numeric: tabular-nums;
}

.report-meta__saved {
  color: var(--ds-color-success, var(--ds-color-text-tertiary));
}

.report-save-btn {
  flex: 1;
  min-height: 48px;
  font-size: 0.9375rem;
  font-weight: 600;
  padding: 12px 20px;
  border-radius: var(--ds-radius-md);
}

.report-cancel-btn {
  min-height: 48px;
  font-size: 0.9375rem;
  font-weight: 500;
  padding: 12px 20px;
  border-radius: var(--ds-radius-md);
}

.report-edit-actions {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}

.report-edit-link {
  margin-left: auto;
  background: transparent;
  border: none;
  padding: 4px 8px;
  font-family: var(--ds-font-body);
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--ds-color-accent);
  cursor: pointer;
  letter-spacing: 0;
  text-transform: none;
  border-radius: 6px;
  -webkit-tap-highlight-color: transparent;
}

.report-edit-link:active {
  opacity: 0.6;
}

@media (hover: hover) and (pointer: fine) {
  .report-edit-link:hover {
    background: var(--ds-color-bg-elevated);
  }
}

.report-read {
  margin: 0;
  padding: 14px 16px;
  border-radius: var(--ds-radius-md);
  background: var(--ds-color-bg, var(--ds-color-bg-elevated));
  border: 1px solid var(--ds-color-border-light);
  font-size: 0.9375rem;
  line-height: 1.55;
  color: var(--ds-color-text-primary);
  white-space: pre-wrap;
  word-wrap: break-word;
}
</style>
