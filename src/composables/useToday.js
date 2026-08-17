// Aggregator for hjem-skjermen («I dag») — komponerer eksisterende singletons
// og avleder dagens hendelser, prep-status og påminnelser.
import { ref, computed } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { useAuth } from '../stores/auth'
import { useSeasons } from './useSeasons'
import { useMatches } from './useMatches'
import { useCoaches } from './useCoaches'
import { useExpenses } from './useExpenses'
import { useCups } from './useCups'
import { useCupMatches } from './useCupMatches'
import { useTrainingPeriods } from './useTrainingPeriods'
import { useTrainingSessions } from './useTrainingSessions'
import { useMatchMode } from './useMatchMode'
import { localISODate, isoWeekday, daysUntil } from '../lib/dateLabels'
import { isHalsenMatch, isHomeMatch, teamColorsForMatch } from '../lib/matchMeta'
import { resolveUpcomingPeriod, buildWeekAhead } from '../lib/weekAhead'
import { buildReminders } from '../lib/reminders'
import { useDismissedReminders } from './useDismissedReminders'
import { CUP_TEAMS } from '../lib/cupTeams'
import { registerReset } from '../stores/dataReset'

// Egen modul-state. NB: ikke gjenbruk useMatchMode.fetchSession her —
// den holder én singleton-session og knekker når to Halsen-lag spiller samme dag.
const prepSessions = ref([])
const loading = ref(false)

registerReset(() => { prepSessions.value = []; loading.value = false })

export function useToday() {
  const { coach, preferredCupTeam } = useAuth()
  const { dismissed } = useDismissedReminders()
  const { activeSeason, fetchSeasons } = useSeasons()
  const { matches, fetchMatches, getCoachesForMatch, getPlayersForMatch } = useMatches()
  const { fetchCoaches } = useCoaches()
  const { fetchExpenses, getExpenseForMatch } = useExpenses()
  const { activeCup, cupInProgress, fetchCups } = useCups()
  const { cupMatches, fetchCupMatches } = useCupMatches()
  const { periods, fetchPeriods } = useTrainingPeriods()
  const { sessions, fetchSessions } = useTrainingSessions()
  const matchMode = useMatchMode()

  const greeting = computed(() => {
    const h = new Date().getHours()
    const word = h < 10 ? 'God morgen' : h < 17 ? 'God dag' : 'God kveld'
    const first = (coach.value?.name || '').split(' ')[0]
    return first ? `${word}, ${first}` : word
  })

  const todayMatches = computed(() => {
    const today = localISODate()
    return matches.value
      .filter(m => isHalsenMatch(m) && m.match_date === today)
      .sort((a, b) => (a.match_time || '').localeCompare(b.match_time || ''))
  })

  // Cupkamper for MITT cup-lag. Med to lag i samme cup blir alle kampene støy
  // — trenere uten eget cup-lag ser alt.
  //
  // Preferansen ligger nå på medlemsraden. Den må VALIDERES mot CUP_TEAMS før
  // bruk: slugene roterer mellom cuper, og en lagret preferanse fra forrige
  // cup ville ellers filtrert lista til null kamper og gitt en tom-tilstand
  // som ser ut som en feil.
  const myCupMatches = computed(() => {
    const preferred = preferredCupTeam.value
    if (preferred && CUP_TEAMS.some(t => t.slug === preferred)) {
      return cupMatches.value.filter(m => m.our_team === preferred)
    }

    // Fallback for PIN-broen, som ikke har noen medlemsrad å hente den fra.
    const first = (coach.value?.name || '').split(' ')[0].toLowerCase()
    const mine = CUP_TEAMS.find(t => (t.trainers || []).some(n => n.toLowerCase() === first))
    return mine ? cupMatches.value.filter(m => m.our_team === mine.slug) : cupMatches.value
  })

  const todayCupMatches = computed(() => {
    const today = localISODate()
    return myCupMatches.value
      .filter(m => m.match_date === today)
      .sort((a, b) => (a.match_time || '').localeCompare(b.match_time || ''))
  })

  // Aktiv treningsperiode: dagens dato innenfor start/slutt (åpen slutt teller), lavest position vinner.
  const activePeriod = computed(() => {
    const today = localISODate()
    return periods.value
      .filter(p => p.start_date && p.start_date <= today && (!p.end_date || today <= p.end_date))
      .sort((a, b) => a.position - b.position)[0] || null
  })

  // Perioden «neste trening» hentes fra: den som dekker i dag, ellers den
  // nærmeste som starter frem i tid (så en periode som starter i morgen synes).
  const upcomingPeriod = computed(() => resolveUpcomingPeriod(periods.value))

  // Cup-dager demper trening: laget står på cup, ikke på feltet.
  const cupCoversToday = computed(() => {
    const cup = activeCup.value
    if (cup?.status !== 'active' || !cup.start_date || !cup.end_date) return false
    const today = localISODate()
    return cup.start_date <= today && today <= cup.end_date
  })

  const todayTraining = computed(() => {
    if (cupCoversToday.value) return null
    const period = activePeriod.value
    if (!period) return null
    const wd = isoWeekday()
    const session = sessions.value
      .filter(s => s.period_id === period.id && s.weekday === wd)
      .sort((a, b) => a.position - b.position)[0]
    return session ? { period, session } : null
  })

  // Prep-status for én av dagens kamper. referee er null for bortekamper (ikke vår jobb).
  function prepFor(matchId) {
    const match = matches.value.find(m => m.id === matchId)
    if (!match) return null
    const s = prepSessions.value.find(p => p.match_id === matchId)
    const home = isHomeMatch(match)
    return {
      isHome: home,
      referee: home ? !!(match.referee || '').trim() : null,
      lineup: !!s && Object.keys(s.lineup || {}).length > 0,
      squad: getPlayersForMatch(matchId).length > 0,
      status: s?.status || null
    }
  }

  const reminders = computed(() => buildReminders({
    matches: matches.value,
    coachId: coach.value?.id,
    getCoachesForMatch,
    getExpenseForMatch,
    periods: periods.value,
    excludeMatchIds: todayMatches.value.map(m => m.id),
    // Kampen som står i kortet øverst — påminnelsen om den slipper å gjenta
    // motstanderen.
    primaryMatchId: nextMatch.value?.id || null,
    dismissedKeys: dismissed.value
  }))

  // Neste forekomst av en ukedag etter `after`, klippet til periodens slutt.
  function nextDateForWeekday(weekday, after, endIso) {
    const d = new Date(after + 'T12:00:00')
    for (let i = 0; i < 7; i++) {
      d.setDate(d.getDate() + 1)
      if (isoWeekday(d) === weekday) {
        const iso = localISODate(d)
        return (!endIso || iso <= endIso) ? iso : null
      }
    }
    return null
  }

  // Neste treningsøkt: nærmeste forekomst av en økt med ukedag i aktuell periode.
  // For en fremtidig periode søkes det fra periodens start, ikke fra i dag.
  const nextTraining = computed(() => {
    const today = localISODate()
    const period = upcomingPeriod.value
    if (!period) return null
    let after = today
    if (period.start_date > today) {
      const d = new Date(period.start_date + 'T12:00:00')
      d.setDate(d.getDate() - 1)
      after = localISODate(d)
    }
    const candidates = sessions.value
      .filter(s => s.period_id === period.id && s.weekday)
      .map(s => ({ session: s, date: nextDateForWeekday(s.weekday, after, period.end_date) }))
      .filter(x => x.date)
      .sort((a, b) => a.date.localeCompare(b.date))
    if (!candidates.length) return null
    return { period, session: candidates[0].session, date: candidates[0].date }
  })

  // Sesongstart: vises i opptakten til sesongens aller første kamp, og
  // forsvinner av seg selv så snart den kampen er spilt. Lagene rulleres
  // mellom sesongene, så dette er også varselet om nye tropper og trenere.
  const KICKOFF_WINDOW_DAYS = 21

  const seasonKickoff = computed(() => {
    const today = localISODate()
    const dates = matches.value
      .filter(m => isHalsenMatch(m) && m.match_date)
      .map(m => m.match_date)
      .sort()
    const first = dates[0]
    if (!first || first <= today) return null

    const days = daysUntil(first)
    if (days > KICKOFF_WINDOW_DAYS) return null

    return { season: activeSeason.value?.name || '', date: first, days }
  })

  // MINE kamper — grunnlaget for både uka og «neste kamp», så de to aldri
  // kan bli uenige om hva som er mitt. Uten tilordninger vet vi ikke hvilket
  // lag som er mitt, og da er alle Halsen-kamper mine.
  const halsenMatches = computed(() => matches.value.filter(isHalsenMatch))

  const hasOwnAssignments = computed(() =>
    !!coach.value?.id && halsenMatches.value.some(m => getCoachesForMatch(m.id).includes(coach.value.id))
  )

  const myMatches = computed(() =>
    hasOwnAssignments.value
      ? halsenMatches.value.filter(m => getCoachesForMatch(m.id).includes(coach.value.id))
      : halsenMatches.value
  )

  // Resten av uka (i morgen → søndag): treninger fra ukerytmen + MINE seriekamper.
  // De andre lagenes kamper hører hjemme under «Andre lag» — sto de begge
  // steder, leste Hjem som om det skjedde dobbelt så mye.
  // Cup-kamper ramses IKKE opp her — cup-widgeten på Hjem er inngangen,
  // og aktiv cup demper treninger på cup-dagene (via cup-parameteren).
  const weekAhead = computed(() => buildWeekAhead({
    period: upcomingPeriod.value,
    sessions: sessions.value,
    matches: myMatches.value,
    cup: activeCup.value
  }))

  // Neste kamp = MIN neste seriekamp. Cup dekkes av widgeten.
  const nextMatch = computed(() => {
    const today = localISODate()
    const byDateTime = (a, b) => a.match_date.localeCompare(b.match_date) || (a.match_time || '').localeCompare(b.match_time || '')

    const league = myMatches.value.filter(m => m.match_date > today).sort(byDateTime)[0]

    if (!league) return null
    return {
      type: 'match',
      id: league.id,
      date: league.match_date,
      time: league.match_time || '',
      opponent: isHomeMatch(league) ? league.away_team : league.home_team,
      teams: teamColorsForMatch(league),
      isHome: isHomeMatch(league),
      to: `/kamp/${league.id}`
    }
  })

  // De andre Halsen-lagenes neste kamp. Egen trening er hovedsaken på Hjem,
  // men klubben spiller uansett — dette gir oversikten uten å ta fokus.
  //
  // ÉN RAD PER KAMP. Møter to Halsen-lag hverandre, gir teamColorsForMatch to
  // farger — og før ble den ene kampen listet to ganger, speilvendt («Hvit mot
  // Halsen Blå» og «Blå mot Halsen Hvit»). Det er én kamp, og den skal telles én gang.
  const MAX_OTHER_TEAMS = 3

  const myColors = computed(() => new Set(myMatches.value.flatMap(teamColorsForMatch)))

  const otherTeamsNext = computed(() => {
    const today = localISODate()
    const byDateTime = (a, b) => a.match_date.localeCompare(b.match_date) || (a.match_time || '').localeCompare(b.match_time || '')

    // Mine egne lag er dekket av uka og neste-kamp-kortet.
    const seen = new Set(myColors.value)
    const out = []

    for (const m of halsenMatches.value.filter(x => x.match_date > today).sort(byDateTime)) {
      const fresh = teamColorsForMatch(m).filter(c => !seen.has(c))
      if (!fresh.length) continue
      fresh.forEach(c => seen.add(c))
      out.push({
        colors: fresh,
        color: fresh[0], // nøkkel + fallback for eldre markup
        date: m.match_date,
        time: (m.match_time || '').slice(0, 5),
        opponent: isHomeMatch(m) ? m.away_team : m.home_team,
        isHome: isHomeMatch(m),
        to: `/kamp/${m.id}`
      })
      if (out.length === MAX_OTHER_TEAMS) break
    }
    return out
  })

  async function fetchPrepSessions(matchIds) {
    if (!matchIds.length) {
      prepSessions.value = []
      return
    }

    if (!isSupabaseConfigured) {
      // Demo: useMatchMode holder maks én session i minnet.
      const s = matchMode.session.value
      prepSessions.value = s && matchIds.includes(s.match_id) ? [s] : []
      return
    }

    const { data } = await supabase
      .from('match_sessions')
      .select('match_id, status, lineup')
      .in('match_id', matchIds)
    prepSessions.value = data || []
  }

  async function refresh() {
    loading.value = matches.value.length === 0
    await Promise.all([fetchSeasons(), fetchCoaches(), fetchCups(), fetchPeriods()])

    const jobs = []
    if (activeSeason.value) jobs.push(fetchMatches(activeSeason.value.id))
    // Ferdig cup trenger ikke lastes på Hjem — cup-sidene henter selv for historikken.
    if (cupInProgress.value) jobs.push(fetchCupMatches(activeCup.value.id))
    if (upcomingPeriod.value) jobs.push(fetchSessions(upcomingPeriod.value.id))
    await Promise.all(jobs)

    await Promise.all([
      fetchExpenses(matches.value.map(m => m.id)),
      fetchPrepSessions(todayMatches.value.map(m => m.id))
    ])
    loading.value = false
  }

  return {
    loading, refresh, greeting,
    todayMatches, todayCupMatches, todayTraining,
    prepFor, reminders, nextTraining, nextMatch, otherTeamsNext, weekAhead, seasonKickoff
  }
}
