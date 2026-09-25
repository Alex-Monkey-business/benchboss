<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMatches } from '../composables/useMatches'
import { useFeatures } from '../composables/useFeatures'
import { useExpenses } from '../composables/useExpenses'
import { useCoaches } from '../composables/useCoaches'
import { useReferees } from '../composables/useReferees'
import { usePlayers } from '../composables/usePlayers'
import { usePlayerSeasonTeams } from '../composables/usePlayerSeasonTeams'
import { useMatchGoals } from '../composables/useMatchGoals'
import { useMatchMode } from '../composables/useMatchMode'
import { useSeasons } from '../composables/useSeasons'
import { useAuth } from '../stores/auth'
import { useToast } from '../composables/useToast'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import Sheet from '../components/Sheet.vue'
import Skeleton from '../components/Skeleton.vue'
import DisclosureSection from '../components/DisclosureSection.vue'
import MatchPlayingTime from '../components/MatchPlayingTime.vue'
import TeamCrest from '../components/TeamCrest.vue'
import { useKlubbmerke } from '../composables/useKlubbmerke'
import { relativeDateLabel, isPast, trimAbbrevDots } from '../lib/dateLabels'
import { matchCta } from '../lib/matchCta'
import { teamSlugFromName, teamColorsForMatch, isHomeMatch as computeIsHomeMatch, isPlayed, teamLabel, isOurs } from '../lib/matchMeta'
import { formatPhone, phoneE164, parsePhone } from '../lib/phone'
import { meldEvent } from '../lib/sporing'
import { lanegrense } from '../lib/lanegrense'
import { ageClass, spillformFraKamper } from '../lib/fiks'
import { useSeasonTeams } from '../composables/useSeasonTeams'

const route = useRoute()
const router = useRouter()
const { matches, matchPlayers, getMatch, fetchMatches, updateMatch, setMatchCoaches, fetchMatchCoaches, setMatchPlayers, fetchMatchPlayers, fetchAllMatchPlayers, fetchMatchAbsences, fetchAllMatchAbsences, getAbsencesForMatch, toggleAbsence, deleteMatch } = useMatches()
const { expenses, fetchExpenses, registerExpense, getExpenseForMatch, removeExpense } = useExpenses()
const { coaches, fetchCoaches } = useCoaches()
const { referees, fetchReferees, getRefereeByName, addReferee, updateReferee } = useReferees()
const { players, fetchPlayers, addPlayer, getPlayerById } = usePlayers()
const { fetchPlayerSeasonTeams, isLoanEligible, teamForSeason } = usePlayerSeasonTeams()
const { seasonTeams } = useSeasonTeams()
const { goals: allGoals, fetchMatchGoals, addGoal, removeGoal } = useMatchGoals()
const { session: mmSession, fetchSession: fetchMmSession, fetchStints: fetchMmStints } = useMatchMode()
const { seasons, fetchSeasons } = useSeasons()
const { coach: currentCoach, activeCohort } = useAuth()
const { usesReferees } = useFeatures()
const { show: showToast } = useToast()
const { merkeFor } = useKlubbmerke()

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
const showRefereePicker = ref(false)
const showPayerPicker = ref(false)
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
  summary: false,    // Resultat + Scorere — bare når det er jobben, eller du redigerer
  report: false,     // Kampreferat — bare når det finnes, eller du skriver
  playtime: false    // Spilletid — kun når kampen er kjørt i match mode
})

// Har kampen vært i match mode? Uten stints er det ingen spilletid å vise,
// og seksjonen skal ikke stå der som en tom lovnad.
const hasPlayingTime = ref(false)

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
// En spilt kamp åpnes for å leses. Tallfeltene ligger bak «Rediger» — eller
// bak trykk på resultatet i toppkortet, som går rett i skrivemodus.
const editingResult = ref(false)
// Resultatet og scorerne står i toppen. Seksjonen under finnes bare når den
// er jobben (spilt kamp uten resultat) eller du har valgt Rediger i menyen.
const played = computed(() => isPlayed(match.value))
const showResultSection = computed(() =>
  !isLocked.value && (played.value || hasResult.value) && (!hasResult.value || editingResult.value)
)

onMounted(async () => {
  await Promise.all([fetchSeasons(), fetchCoaches(), fetchReferees(), fetchPlayers(), fetchPlayerSeasonTeams(), fetchAllMatchPlayers(), fetchAllMatchAbsences()])
  match.value = await getMatch(route.params.id)
  if (match.value) {
    // Hent sesongens kamper — grunnlag for ekstra-kamp-tall og konflikt-/uke-sjekk.
    if (match.value.season_id) await fetchMatches(match.value.season_id)
    const [, , , mmStints] = await Promise.all([
      fetchExpenses([match.value.id]),
      fetchMatchGoals(match.value.id),
      fetchMmSession(match.value.id),
      fetchMmStints(match.value.id)
    ])
    hasPlayingTime.value = (mmStints || []).length > 0
    refereeInput.value = match.value.referee || ''
    matchCoachIds.value = await fetchMatchCoaches(match.value.id)
    matchPlayerIds.value = await fetchMatchPlayers(match.value.id)
    matchAbsenceIds.value = await fetchMatchAbsences(match.value.id)
    homeScoreInput.value = match.value.home_score ?? ''
    awayScoreInput.value = match.value.away_score ?? ''
    reportInput.value = match.value.report || ''
    // Tomt referat → edit-modus direkte; lagret referat → lese-modus med "Rediger"
    // Feltet står ikke framme før noen vil skrive. Få skriver referat, og
    // et tomt tekstfelt på hver spilte kamp var det mest plasskrevende på sida.
    isEditingReport.value = false
    // Show custom input if current referee is not in known list
    if (match.value.referee && !referees.value.some(r => r.name === match.value.referee) && !isLocked.value) {
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
  const hasResult = match.value.home_score != null && match.value.away_score != null
  // Dommer satt + utlegg registrert → logistikken er gjort, ikke relevant å åpne.
  //
  // Skaffer laget ikke dommer selv, finnes ikke logistikken. Da må denne være
  // SANN — ellers ville hver kommende hjemmekamp åpnet en seksjon som ikke
  // vises, og laget aldri fått fokus.
  const logisticsDone = !usesReferees.value || (!!match.value.referee && !!expense.value)

  if (isPast || hasResult) {
    // Spilt (resultat ført) eller skulle vært spilt — coach kom sannsynligvis
    // for å se eller logge resultat. Gjelder også dagens kamp som alt er spilt.
    open.value.summary = true
  } else if (isHomeMatch.value && !logisticsDone) {
    // Fremtidig hjemmekamp der dommer/utlegg gjenstår
    open.value.logistics = true
  } else {
    // Bortekamp, eller hjemmekamp der dommer + utlegg alt er på plass — fokus på lag
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
  if (!expense.value && currentCoach.value?.id && match.value && !isLocked.value) {
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

// Avsluttet (settled) sesong = arkivert: kampen er låst for all redigering.
const matchSeason = computed(() => seasons.value.find(s => s.id === match.value?.season_id))
const isLocked = computed(() => matchSeason.value?.status === 'settled')

const teamColors = computed(() => teamColorsForMatch(match.value))

// Rekkefølge på de tre seksjonene styres av kampens livssyklus:
// spilt kamp leder med resultat, kommende leder med prep. Flex-order på
// .detail-disclosures gjør omrokeringen uten å endre DOM-en.
const sectionOrder = computed(() => {
  if (isPast(match.value?.match_date)) {
    // Spilt kamp leses før den endres: spilletid er det match mode faktisk
    // målte, mens Resultat-seksjonen er tallfeltene og referatet. Resultatet
    // og scorerne står uansett i toppkortet.
    return { playtime: 1, summary: 2, report: 3, team: 4, logistics: 5 }
  }
  if (isHomeMatch.value) {
    return { logistics: 1, team: 2, summary: 3, report: 4, playtime: 5 }
  }
  // Kommende bortekamp — ingen dommer-ansvar, lag øverst
  return { team: 1, summary: 2, report: 3, playtime: 4, logistics: 5 }
})

const formattedDate = computed(() => relativeDateLabel(match.value?.match_date))

// Midtkolonnen i heroen er smal. «I dag» og «Onsdag» får stå; «Lørdag 28.
// februar» blir «lør 28. feb».
const heroDate = computed(() => {
  const label = formattedDate.value
  if (!match.value?.match_date || label.length <= 12) return label
  const d = new Date(match.value.match_date + 'T12:00:00')
  return trimAbbrevDots(d.toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short' }))
})

const heroTime = computed(() => {
  const t = (match.value?.match_time || '').slice(0, 5)
  return t && t !== '00:00' ? t : ''
})

async function selectReferee(name) {
  if (isLocked.value) return
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
    showRefereePicker.value = false
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
  if (isLocked.value) return
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
  showRefereePicker.value = false
  refereeInput.value = name
  newPhone.value = ''
  showToast('Dommer lagret', 'success')
}

async function selectPayer(coachId) {
  if (isLocked.value) return
  if (expense.value?.paid_by === coachId) {
    await removeExpense(match.value.id)
    showToast('Utlegg fjernet', 'success')
  } else {
    await registerExpense(match.value.id, coachId, match.value.fee_amount || 200)
    const name = coaches.value.find(c => c.id === coachId)?.name
    showPayerPicker.value = false
    showToast(`${name} la ut ${match.value.fee_amount || 200} kr`, 'success')
  }
}

async function toggleCoach(coachId) {
  if (isLocked.value) return
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
  if (isLocked.value) return
  const current = [...matchPlayerIds.value]
  const idx = current.indexOf(playerId)
  if (idx > -1) {
    current.splice(idx, 1)
  } else {
    current.push(playerId)
  }
  await setMatchPlayers(match.value.id, current)
  matchPlayerIds.value = current
  meldEvent('laguttak_endret', { type: 'hospitant', antall: current.length })
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
  if (isLocked.value) return
  await toggleAbsence(match.value.id, playerId)
  meldEvent('laguttak_endret', {
    type: 'frafall',
    meldt: !matchAbsenceIds.value.includes(playerId),
  })
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

// ─── Lånegrensa (BR § 2-12, 13–19 år) ──────────────────────────────────────
// Et lavere rangert lag kan bruke et begrenset antall spillere som var med i
// siste obligatoriske kamp til laget over. Regelen og rangen bor i
// lib/lanegrense; her kobles den til troppene slik de står i basen.
function troppFor(m, slug) {
  const ut = new Set(getAbsencesForMatch(m.id))
  const ids = new Set()
  for (const p of players.value) {
    if (teamForSeason(p, m.season_id) === slug && !ut.has(p.id)) ids.add(p.id)
  }
  for (const mp of matchPlayers.value) if (mp.match_id === m.id) ids.add(mp.player_id)
  return ids
}
function spillformFor(slug) {
  const egne = matches.value.filter(m => teamColorsForMatch(m).includes(slug))
  return spillformFraKamper(egne) || activeCohort.value?.players_on_pitch || null
}
const grense = computed(() => {
  const m = match.value
  if (!m || teamColors.value.length !== 1) return null
  return lanegrense(m, teamColors.value[0], {
    teams: seasonTeams.value,
    matches: matches.value,
    alder: ageClass(activeCohort.value?.birth_year, Number(m.match_date.slice(0, 4))),
    lagForKamp: teamColorsForMatch,
    troppFor,
    spillformFor,
  })
})
const giverNavn = computed(() => (grense.value?.fra || []).map(f => teamLabel(f.slug)).join(' og '))
// Hvem i dagens tropp som var med i giverlagets forrige kamp.
function medSist(playerId) {
  return !!grense.value?.spillere.has(playerId)
}
// Blant lånespillerne fra laget over er det unntaket som er verdt å se:
// de som ikke var med sist, og derfor ikke teller mot grensa.
function tellerIkke(p) {
  if (!grense.value || medSist(p.id)) return false
  return grense.value.fra.some(f => f.slug === p.primary_team)
}
const brukteFraGiver = computed(() => {
  if (!grense.value) return 0
  const ut = new Set(matchAbsenceIds.value)
  const tropp = new Set([...teamSquad.value.filter(p => !ut.has(p.id)).map(p => p.id), ...matchPlayerIds.value])
  let n = 0
  for (const id of tropp) if (grense.value.spillere.has(id)) n++
  return n
})
const overGrensa = computed(() => !!grense.value && brukteFraGiver.value > grense.value.grense)
const grenseKamp = computed(() => {
  const f = grense.value?.fra?.[0]
  if (!f) return ''
  const d = new Date(f.kamp.match_date + 'T12:00:00')
  const dato = trimAbbrevDots(d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }))
  const mot = isOurs(f.kamp.home_team) ? f.kamp.away_team : f.kamp.home_team
  return mot ? `mot ${mot} ${dato}` : dato
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
      // Kampens egen sesong, ikke aktiv sesong — gamle kamper er fortsatt nåbare.
      isLoanEligible(p, match.value?.season_id) &&
      !playerConflicts.value[p.id] &&
      !loanedElsewhereThisWeek.value.has(p.id) &&
      // Er grensa nådd, anbefales ingen som ville gått over den.
      !(grense.value && brukteFraGiver.value >= grense.value.grense && medSist(p.id))
    )
    .sort((a, b) => extraCount(a.id) - extraCount(b.id) || a.name.localeCompare(b.name, 'no'))
)
const otherLoans = computed(() => {
  const shown = new Set([...selectedLoans.value, ...recommendedLoans.value].map(p => p.id))
  return availablePlayers.value.filter(p => !shown.has(p.id))
})


// Detect a same-day conflict for one player. Returns { time, opponent } or null.
function getConflictForPlayer(p, currentMatchId, currentDate) {
  if (!currentDate) return null

  function describeMatch(m) {
    const time = m.match_time?.slice(0, 5)
    const opponentRaw = isOurs(m.home_team)
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

  // 2. Implicit: player's primary team plays same day
  if (p.primary_team) {
    const primaryMatch = matches.value.find(m => {
      if (m.id === currentMatchId) return false
      if (m.match_date !== currentDate) return false
      const homeColor = isOurs(m.home_team) ? teamSlugFromName(m.home_team) : null
      const awayColor = isOurs(m.away_team) ? teamSlugFromName(m.away_team) : null
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

// ─── Match mode-CTA ──────────────────────────────────────────────────────────
// Regelen bor i lib/matchCta.js fordi Hjem-kortet bruker den samme. En kopi
// her ville blitt en andre sannhet om samme kamp.
const hasLineup = computed(() => {
  const l = mmSession.value?.lineup
  return !!l && Object.keys(l).length > 0
})

const matchModeCta = computed(() => matchCta({
  status: mmSession.value?.status,
  hasLineup: hasLineup.value,
  hasResult: hasResult.value,
  matchDate: match.value?.match_date,
  matchTime: match.value?.match_time
}))

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
  if (isLocked.value || !isResultValid.value || !isResultChanged.value) return
  const home = Number(homeScoreInput.value)
  const away = Number(awayScoreInput.value)
  await updateMatch(match.value.id, { home_score: home, away_score: away })
  match.value.home_score = home
  match.value.away_score = away
  showToast(`Resultat lagret: ${home}–${away}`, 'success')
}

async function clearResult() {
  if (isLocked.value) return
  await updateMatch(match.value.id, { home_score: null, away_score: null })
  match.value.home_score = null
  match.value.away_score = null
  homeScoreInput.value = ''
  awayScoreInput.value = ''
  showToast('Resultat fjernet', 'success')
}

async function handleDelete() {
  showDeleteDialog.value = false
  if (isLocked.value) return
  await deleteMatch(match.value.id)
  showToast('Kamp slettet', 'success')
  router.push('/kamper')
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
  if (isLocked.value || !editDateInput.value || !isDateTimeChanged.value) return
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

// Aggregert per spiller: { player_id, player, count, goalIds, firstPosition, timing }
const aggregatedScorers = computed(() => {
  const groups = new Map()
  for (const g of matchGoals.value) {
    if (!groups.has(g.player_id)) {
      groups.set(g.player_id, {
        player_id: g.player_id,
        player: getPlayerById(g.player_id),
        count: 0,
        goalIds: [],
        minutes: [],
        firstPosition: g.position
      })
    }
    const entry = groups.get(g.player_id)
    entry.count++
    entry.goalIds.push(g.id)
    if (g.clock_seconds != null) entry.minutes.push(Math.floor(g.clock_seconds / 60))
  }
  return Array.from(groups.values())
    .map(e => ({ ...e, timing: scorerTiming(e) }))
    .sort((a, b) => a.firstPosition - b.firstPosition)
})

// Minuttet er den eneste nye opplysninga vi faktisk har, så den skal fram.
// Men den finnes bare på mål ført i match mode — resten er lagt inn etterpå
// og har ingen klokke. Da er antallet det eneste sanne vi kan si, og et mål
// uten tid skal ikke låne et minutt fra naboen: «4′ · 29′ + 1».
function scorerTiming(entry) {
  const mins = entry.minutes.slice().sort((a, b) => a - b)
  if (mins.length === 0) return entry.count > 1 ? `${entry.count} mål` : ''
  const shown = mins.map(m => `${m}′`).join(' · ')
  const rest = entry.count - mins.length
  return rest > 0 ? `${shown} + ${rest}` : shown
}

function goalCountForPlayer(playerId) {
  return matchGoals.value.filter(g => g.player_id === playerId).length
}

// player_id → antall mål, for spilletid-lista.
const goalCountByPlayer = computed(() => {
  const out = {}
  for (const g of matchGoals.value) out[g.player_id] = (out[g.player_id] || 0) + 1
  return out
})

// Kamplengda i den lukkede seksjonen. Det er tallet spilletidene summerer mot,
// så en klokke som stoppet i pausen står som «30 min» og røper seg selv.
const playingTimeSummary = computed(() => {
  if (mmSession.value?.match_id !== match.value?.id) return ''
  const sec = mmSession.value?.clock_base_seconds || 0
  return sec ? `${Math.round(sec / 60)} min` : ''
})

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
  if (isLocked.value) return
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
  if (isLocked.value || !isReportChanged.value || !match.value) return
  await updateMatch(match.value.id, { report: reportInput.value })
  match.value.report = reportInput.value
  reportSavedAt.value = new Date()
  // Etter lagring: gå til lese-modus hvis det er noe innhold
  if (reportInput.value.trim()) isEditingReport.value = false
  showToast('Referat lagret', 'success')
}

function startEditingReport() {
  if (isLocked.value) return
  isEditingReport.value = true
  open.value.report = true
  setTimeout(() => {
    document.querySelector('[data-section="report"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, 60)
}

function cancelEditingReport() {
  // Tilbakestill input til lagret versjon, gå til lese-modus
  reportInput.value = match.value.report || ''
  isEditingReport.value = false
  if (!match.value.report) open.value.report = false
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

function focusSummaryGroup() {
  open.value.summary = true
  editingResult.value = true
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
      <div class="md-skel__card">
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
    <div class="px-lg md-top">
      <button class="md-icon-btn" aria-label="Tilbake" @click="router.back()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
        </svg>
      </button>
      <button
        v-if="!isLocked"
        type="button"
        class="md-icon-btn"
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

    <!-- Kampen som overskrift, sentrert rundt midtaksen: hjemmelag til
         venstre, tid eller resultat i midten, bortelag til høyre. Ingen
         ramme, ingen brikker. Hvor vi spiller sier plassen. -->
    <header class="px-lg hero">
      <div class="hero__grid">
        <div class="hero__side">
          <TeamCrest :name="match.home_team" :src="merkeFor(match.home_team)" :size="56" />
          <span class="hero__team">{{ match.home_team }}</span>
        </div>
        <component
          :is="hasResult && !isLocked ? 'button' : 'div'"
          :type="hasResult && !isLocked ? 'button' : undefined"
          class="hero__mid"
          :class="{ 'hero__mid--tappable': hasResult && !isLocked }"
          :aria-label="hasResult && !isLocked ? 'Rediger resultat' : undefined"
          @click="hasResult && !isLocked && focusSummaryGroup()"
        >
          <span v-if="hasResult" class="hero__big">{{ match.home_score }} – {{ match.away_score }}</span>
          <span v-else-if="heroTime" class="hero__big">{{ heroTime }}</span>
          <span v-else class="hero__big hero__big--tba">–</span>
          <span class="hero__sub">{{ heroDate }}</span>
        </component>
        <div class="hero__side">
          <TeamCrest :name="match.away_team" :src="merkeFor(match.away_team)" :size="56" />
          <span class="hero__team">{{ match.away_team }}</span>
        </div>
      </div>

      <!-- Scorerne står under laget de scoret for. -->
      <div v-if="aggregatedScorers.length" class="hero__grid hero__scorers">
        <div class="hero__side">
          <template v-if="isHomeMatch">
            <span v-for="s in aggregatedScorers" :key="s.player_id" class="hero__scorer">{{ s.player?.name || 'Ukjent' }} <span v-if="s.timing" class="hero__timing">{{ s.timing }}</span></span>
          </template>
        </div>
        <div class="hero__mid" aria-hidden="true"></div>
        <div class="hero__side">
          <template v-if="!isHomeMatch">
            <span v-for="s in aggregatedScorers" :key="s.player_id" class="hero__scorer">{{ s.player?.name || 'Ukjent' }} <span v-if="s.timing" class="hero__timing">{{ s.timing }}</span></span>
          </template>
        </div>
      </div>
    </header>

    <!-- Låst kamp — sesongen er gjort opp -->
    <div v-if="isLocked" class="px-lg mt-lg">
      <p class="locked-note">Sesongen er avsluttet — kampen er låst.</p>
    </div>

    <!-- Match mode — label + tyngde følger kampens livsløp. Er kampen ferdig,
         finnes knappen ikke: da er dette en leseflate, ikke en klokke. -->
    <div v-if="!isLocked && matchModeCta" class="px-lg mt-lg">
      <button
        type="button"
        class="match-mode-cta"
        :class="`match-mode-cta--${matchModeCta.tone}`"
        @click="router.push(`/kamp/${match.id}/live`)"
      >
        <span v-if="matchModeCta.icon === 'live'" class="match-mode-cta__dot" aria-hidden="true"></span>
        <svg v-else-if="matchModeCta.icon === 'play'" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <polygon points="6 4 20 12 6 20 6 4"/>
        </svg>
        <svg v-else-if="matchModeCta.icon === 'clock'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>
        </svg>
        <svg v-else-if="matchModeCta.icon === 'grid'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="6" y1="20" x2="6" y2="14"/><line x1="12" y1="20" x2="12" y2="8"/><line x1="18" y1="20" x2="18" y2="11"/>
        </svg>
        {{ matchModeCta.label }}
      </button>
    </div>

    <!-- Action sections — 3 grouped disclosures (collapsed = lese, expanded = edit) -->
    <div class="px-lg mt-lg detail-disclosures">

      <!-- Gruppe 1: Dommer & utlegg (kun på hjemmekamper — vi har ikke dommer-ansvar borte) -->
      <DisclosureSection
        v-if="isHomeMatch && usesReferees"
        v-model="open.logistics"
        :style="{ order: sectionOrder.logistics }"
        label="Dommer og utlegg"
        empty-text="Ikke satt"
        :has-content="!!(refereeSummary || payerSummary)"
      >
        <template #summary>
          <span v-if="refereeSummary" class="sum-chip sum-chip--referee">{{ refereeSummary }}</span>
          <span v-if="payerSummary" class="sum-chip sum-chip--payer">{{ payerSummary }}</span>
        </template>

        <!-- Dommer -->
        <div class="sub-section">
          <!-- Valgt dommer — kompakt, med kontakt under -->
          <template v-if="match.referee && !showRefereePicker">
            <button type="button" class="picker-result" @click="!isLocked && (showRefereePicker = true)">
              <span class="picker-result__name">{{ match.referee }}</span>
              <span v-if="!isLocked" class="picker-result__change">Bytt</span>
            </button>
          </template>

          <!-- Picker åpen — velg blant dommere -->
          <div v-else-if="showRefereePicker" class="referee-pills">
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

          <!-- Mangler dommer — én knapp -->
          <button v-else-if="!isLocked" type="button" class="picker-trigger" @click="showRefereePicker = true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Velg dommer
          </button>

          <div v-if="selectedReferee && !showRefereePicker" class="referee-contact">
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
            <template v-else-if="!isLocked">
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

          <!-- Valgt utlegger — kompakt -->
          <button
            v-if="expense && !showPayerPicker"
            type="button"
            class="picker-result"
            @click="!isLocked && (showPayerPicker = true)"
          >
            <span class="picker-result__name">{{ payerSummary }}</span>
            <span v-if="!isLocked" class="picker-result__change">Bytt</span>
          </button>

          <!-- Picker åpen — velg trener -->
          <div v-else-if="showPayerPicker" class="payer-grid">
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

          <!-- Ingen utlegger — én knapp -->
          <button v-else-if="!isLocked" type="button" class="picker-trigger" @click="showPayerPicker = true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Velg hvem som la ut
          </button>
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
          <span v-if="selectedLanespillere.length" class="sum-chip sum-chip--more">{{ selectedLanespillere.length }} lån</span>
          <span v-if="overGrensa" class="sum-chip sum-chip--over">{{ brukteFraGiver }} av {{ grense.grense }} fra {{ giverNavn }}</span>
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

        <!-- Lånegrensa: bare der regelen gjelder (13 år og eldre, seriekamp) -->
        <div v-if="grense" class="lanegrense" :class="{ 'lanegrense--over': overGrensa }">
          <div class="lanegrense__tall">
            <strong>{{ brukteFraGiver }} av {{ grense.grense }}</strong> fra {{ giverNavn }}s siste kamp
          </div>
          <p class="lanegrense__tekst">
            <template v-if="overGrensa">{{ brukteFraGiver - grense.grense }} for mange. {{ teamLabel(teamColors[0]) }} kan bruke maks {{ grense.grense }} spillere som var med i {{ giverNavn }}s siste seriekamp ({{ grenseKamp }}).</template>
            <template v-else>Spillere som var med {{ grenseKamp }} er merket «Med {{ giverNavn }}».</template>
          </p>
        </div>

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
              <span v-else-if="medSist(p.id)" class="med-sist">Med {{ giverNavn }}</span>
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
                  {{ p.name }}<span v-if="p.primary_team" class="hospitant-pill__team"> · {{ teamLabel(p.primary_team) }}</span>
                  <span v-if="tellerIkke(p)" class="med-sist">Teller ikke</span>
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
                  {{ p.name }}<span v-if="p.primary_team" class="hospitant-pill__team"> · {{ teamLabel(p.primary_team) }}</span>
                  <span v-if="tellerIkke(p)" class="med-sist">Teller ikke</span>
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
                  {{ p.name }}<span v-if="p.primary_team" class="hospitant-pill__team"> · {{ teamLabel(p.primary_team) }}</span>
                  <span v-if="tellerIkke(p)" class="med-sist">Teller ikke</span>
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

      <!-- Gruppe 3: Resultat og scorere. Finnes bare når den er jobben. -->
      <DisclosureSection
        v-if="showResultSection"
        v-model="open.summary"
        data-section="summary"
        :style="{ order: sectionOrder.summary }"
        :label="hasResult ? 'Rediger resultat' : 'Resultat'"
        empty-text="Mangler"
        :has-content="false"
      >

        <!-- Resultat: score + scorere som én enhet -->
        <div class="sub-section">
          <div v-if="hasResult && !isLocked" class="sub-section__label sub-section__label--hoyre">
            <button type="button" class="report-edit-link" @click="editingResult = false">Ferdig</button>
          </div>
          <div class="score-edit">
            <div class="score-edit__side">
              <input
                v-model="homeScoreInput"
                type="number"
                min="0"
                max="99"
                inputmode="numeric"
                class="ds-input score-edit__input"
                :disabled="isLocked"
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
                :disabled="isLocked"
                :aria-label="`Mål for ${match.away_team}`"
                @blur="saveResult"
                @keydown.enter="$event.target.blur()"
              />
              <span class="score-edit__team">{{ match.away_team }}</span>
            </div>
          </div>
          <button
            v-if="hasResult && !isLocked"
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
              v-if="!isLocked"
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

      </DisclosureSection>

      <!-- Gruppe 3b: Kampreferat. Få skriver det, så rada finnes bare når det
           er noe å lese, eller du har valgt Skriv referat i menyen. -->
      <DisclosureSection
        v-if="match.report || isEditingReport"
        v-model="open.report"
        data-section="report"
        :style="{ order: sectionOrder.report }"
        label="Kampreferat"
        :has-content="false"
        empty-text=""
      >
        <div class="sub-section">
          <!-- LESE-MODUS: vis lagret referat som tekst -->
          <template v-if="!isEditingReport && match.report">
            <div class="report-read">{{ match.report }}</div>
            <div v-if="!isLocked" class="sub-section__label sub-section__label--hoyre" style="margin-top: 10px;">
              <button type="button" class="report-edit-link" @click="startEditingReport">Rediger</button>
            </div>
          </template>

          <!-- EDIT-MODUS: textarea + Lagre/Avbryt -->
          <template v-else-if="isEditingReport && !isLocked">
            <textarea
              v-model="reportInput"
              class="ds-input report-textarea"
              rows="6"
              maxlength="1000"
              placeholder="Skriv kort om kampen — taktikk, høydepunkter, læring …"
            ></textarea>
            <div v-if="reportInput.length > 900 || (reportSavedLabel && !isReportChanged)" class="report-meta">
              <span v-if="reportInput.length > 900" class="report-meta__count">{{ reportInput.length }} / 1000</span>
              <span v-if="reportSavedLabel && !isReportChanged" class="report-meta__saved">{{ reportSavedLabel }}</span>
            </div>
            <!-- Knappene finnes bare når det er noe å gjøre. En grå «Lagret»
                 som ikke kan trykkes var det tyngste på sida. -->
            <div class="report-edit-actions">
              <button
                type="button"
                class="ds-btn ds-btn--secondary report-cancel-btn"
                @click="cancelEditingReport"
              >
                Avbryt
              </button>
              <button
                v-if="isReportChanged"
                type="button"
                class="ds-btn ds-btn--primary report-save-btn"
                @click="saveReport"
              >
                Lagre referat
              </button>
            </div>
          </template>
        </div>
      </DisclosureSection>

      <!-- Gruppe 4: Spilletid — hva match mode faktisk målte.
           Lå før bare bak live-modus, der ingen andre enn treneren kom. -->
      <DisclosureSection
        v-if="hasPlayingTime"
        v-model="open.playtime"
        data-section="playtime"
        :style="{ order: sectionOrder.playtime }"
        label="Spilletid"
        empty-text="Ikke målt"
        :has-content="!!playingTimeSummary"
      >
        <template #summary>
          <span class="sum-chip sum-chip--squad">{{ playingTimeSummary }}</span>
        </template>

        <div class="sub-section">
          <MatchPlayingTime :match-id="match.id" :goals-by-player="goalCountByPlayer" :locked="isLocked" />
        </div>
      </DisclosureSection>
    </div>

    <!-- Match-meny (⋯-ikon på match-card) — endre tidspunkt + slett -->
    <Sheet :show="showMatchMenu" title="Mer" @close="showMatchMenu = false">
      <div class="match-menu">
        <button
          v-if="played || hasResult"
          type="button"
          class="match-menu__item"
          @click="showMatchMenu = false; focusSummaryGroup()"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9"/><path d="M12 7l4.5 3.3-1.7 5.3H9.2L7.5 10.3z"/>
          </svg>
          {{ hasResult ? 'Rediger resultat og scorere' : 'Legg inn resultat' }}
        </button>
        <button
          v-if="played || hasResult"
          type="button"
          class="match-menu__item"
          @click="showMatchMenu = false; startEditingReport()"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>
          </svg>
          {{ match.report ? 'Rediger referat' : 'Skriv referat' }}
        </button>
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
                  {{ team === 'other' ? 'Uten lag' : teamLabel(team) }}
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
              {{ teamLabel(team) }}
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

/* Låst kamp (avsluttet sesong) */
.locked-note {
  font-size: var(--ds-text-xs);
  font-weight: 500;
  color: var(--ds-color-text-tertiary);
  text-align: center;
  margin: 0;
}

/* ─── Toppen: to ikonknapper, så kampen som overskrift ────────────────── */
.md-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: var(--ds-space-sm);
}

.md-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  margin-left: -8px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--ds-color-text-primary);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.md-icon-btn + .md-icon-btn { margin-left: 0; margin-right: -8px; }
.md-icon-btn svg { width: 22px; height: 22px; }
.md-icon-btn:active { background: var(--ds-color-bg-subtle); }

.hero {
  margin-top: var(--ds-space-md);
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-md);
}

.hero__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  column-gap: var(--ds-space-md);
  align-items: start;
}

.hero__side {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  min-width: 0;
  text-align: center;
}

.hero__team {
  font-size: var(--ds-text-sm);
  overflow-wrap: break-word;
  font-weight: var(--ds-weight-semibold);
  line-height: 1.25;
  color: var(--ds-color-text-primary);
}

.hero__mid {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-width: 84px;
  padding: 8px 0 0;
  margin: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
}

.hero__mid--tappable { cursor: pointer; -webkit-tap-highlight-color: transparent; }
.hero__mid--tappable:active .hero__big { color: var(--ds-color-text-secondary); }

.hero__big {
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-2xl);
  font-weight: var(--ds-weight-bold);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  line-height: 1;
  color: var(--ds-color-text-primary);
  white-space: nowrap;
}

.hero__big--tba { color: var(--ds-color-text-tertiary); }

.hero__sub {
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-secondary);
  text-align: center;
}

.hero__scorers { margin-top: calc(-1 * var(--ds-space-xs)); }
.hero__scorers .hero__side { gap: 2px; }

.hero__scorer {
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-secondary);
  line-height: 1.4;
}

.hero__timing { color: var(--ds-color-text-tertiary); font-variant-numeric: tabular-nums; }

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

/* Tone: live + start = full tyngde (arver accent). prep = outline. quiet = nøytral. */
.match-mode-cta--prep {
  background: var(--ds-color-bg-elevated);
  color: var(--ds-color-accent);
}

.match-mode-cta--quiet {
  background: var(--ds-color-bg-subtle);
  color: var(--ds-color-text-secondary);
  border-color: transparent;
  font-weight: var(--ds-weight-semibold);
}

.match-mode-cta__dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: currentColor;
  animation: cta-dot-pulse 1.5s ease-out infinite;
}

@keyframes cta-dot-pulse {
  0% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.55); }
  70% { box-shadow: 0 0 0 7px rgba(255, 255, 255, 0); }
  100% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0); }
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



/* Score-blokk på match-card (tappbar — åpner Resultat-seksjonen) */








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

/* Progressive picker — trigger-knapp når tomt, kompakt resultat når valgt */
.picker-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1.5px dashed var(--ds-color-border);
  border-radius: var(--ds-radius-full);
  background: transparent;
  font-family: var(--ds-font-body);
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--ds-color-text-secondary);
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease, transform 0.13s cubic-bezier(0.23, 1, 0.32, 1);
  -webkit-tap-highlight-color: transparent;
}

.picker-trigger:hover {
  border-color: var(--ds-color-text-tertiary);
  color: var(--ds-color-text-primary);
}

.picker-trigger:active,
.picker-result:active {
  transform: scale(0.97);
}

.picker-trigger svg {
  width: 14px;
  height: 14px;
}

.picker-result {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 7px 8px 7px 14px;
  border: 1px solid var(--ds-color-border-light);
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-elevated);
  font-family: var(--ds-font-body);
  cursor: pointer;
  transition: border-color 0.15s ease, transform 0.13s cubic-bezier(0.23, 1, 0.32, 1);
  -webkit-tap-highlight-color: transparent;
}

.picker-result:hover {
  border-color: var(--ds-color-text-tertiary);
}

.picker-result__name {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--ds-color-text-primary);
}

.picker-result__change {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--ds-color-text-tertiary);
  padding: 4px 10px;
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-subtle, var(--ds-color-border-light));
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

/* Scorerne under resultatet i toppkortet. Én rad per spiller, minuttene
   høyrestilt i tabular-nums så de danner en kolonne uansett navnelengde.
   Ingen farget prikk: den viste primary_team, altså hvilket lag spilleren
   tilhører — i en kamprapport for ett lag betydde den i praksis «lånt inn». */






.sub-section__label--hoyre { justify-content: flex-end; }

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

.sum-chip--squad { color: var(--ds-color-text-secondary); }
.sum-chip--over { color: var(--ds-color-warm-text); font-weight: 600; }

/* Lånegrensa: nøytral når den holder, varm når den er passert. Ingen rød —
   det er et varsel, ikke en feil, og treneren kan ha grunn. */
.lanegrense {
  margin-bottom: var(--ds-space-md);
  padding: var(--ds-space-sm) var(--ds-space-md);
  border-radius: var(--ds-radius-lg);
  background: var(--ds-color-bg-subtle);
}
.lanegrense--over { background: var(--ds-color-warm-bg); }
.lanegrense__tall {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
}
.lanegrense__tall strong {
  color: var(--ds-color-text-primary);
  font-variant-numeric: tabular-nums;
}
.lanegrense--over .lanegrense__tall strong { color: var(--ds-color-warm-text); }
.lanegrense__tekst {
  margin: 2px 0 0;
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-tertiary);
  text-wrap: pretty;
}
.lanegrense--over .lanegrense__tekst { color: var(--ds-color-text-secondary); }
.med-sist {
  margin-left: 4px;
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ds-color-text-tertiary);
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
/* Sammendraget er tekst, ikke brikker. */
.sum-chip {
  display: inline-flex;
  align-items: center;
  font-size: var(--ds-text-xs);
  font-weight: 500;
  color: var(--ds-color-text-secondary);
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




/* ─── Seksjonene: myke grupper, som dagene i kamplista ─────────────────── */
.detail-disclosures {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.detail-disclosures :deep(.disclosure) {
  border: none;
  border-radius: var(--ds-radius-lg);
  background: var(--ds-color-bg-subtle);
  box-shadow: none;
}

.detail-disclosures :deep(.disclosure--open) {
  box-shadow: none;
  background: var(--ds-color-bg-subtle);
}

.detail-disclosures :deep(.disclosure__header) {
  padding: 16px var(--ds-space-md);
  min-height: 56px;
}

@media (hover: hover) and (pointer: fine) {
  .detail-disclosures :deep(.disclosure__header:hover) { background: transparent; }
}

.detail-disclosures :deep(.disclosure__label) {
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: 0;
  text-transform: none;
  color: var(--ds-color-text-primary);
}

.detail-disclosures :deep(.disclosure__summary) {
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-secondary);
}

.detail-disclosures :deep(.disclosure__summary--rich) { gap: 8px; }

.detail-disclosures :deep(.disclosure--open .disclosure__inner) {
  padding: 0 var(--ds-space-md) var(--ds-space-lg);
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
