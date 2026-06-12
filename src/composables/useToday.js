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
import { localISODate, isoWeekday } from '../lib/dateLabels'
import { isHalsenMatch, isHomeMatch } from '../lib/matchMeta'
import { buildReminders } from '../lib/reminders'
import { cupTeam } from '../lib/cupTeams'

// Egen modul-state. NB: ikke gjenbruk useMatchMode.fetchSession her —
// den holder én singleton-session og knekker når to Halsen-lag spiller samme dag.
const prepSessions = ref([])
const loading = ref(false)

export function useToday() {
  const { coach } = useAuth()
  const { activeSeason, fetchSeasons } = useSeasons()
  const { matches, fetchMatches, getCoachesForMatch, getPlayersForMatch } = useMatches()
  const { fetchCoaches } = useCoaches()
  const { fetchExpenses, getExpenseForMatch } = useExpenses()
  const { activeCup, fetchCups } = useCups()
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

  const todayCupMatches = computed(() => {
    const today = localISODate()
    return cupMatches.value
      .filter(m => m.match_date === today)
      .sort((a, b) => (a.match_time || '').localeCompare(b.match_time || ''))
  })

  // Aktiv treningsperiode: dagens dato innenfor start/slutt, lavest position vinner.
  const activePeriod = computed(() => {
    const today = localISODate()
    return periods.value
      .filter(p => p.start_date && p.end_date && p.start_date <= today && today <= p.end_date)
      .sort((a, b) => a.position - b.position)[0] || null
  })

  const todayTraining = computed(() => {
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
    excludeMatchIds: todayMatches.value.map(m => m.id)
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

  // Teaser når dagen er tom: tidligste av neste seriekamp, cupkamp og treningsøkt.
  const nextEvent = computed(() => {
    const today = localISODate()
    const candidates = []

    const nextMatch = matches.value
      .filter(m => isHalsenMatch(m) && m.match_date > today)
      .sort((a, b) => a.match_date.localeCompare(b.match_date) || (a.match_time || '').localeCompare(b.match_time || ''))[0]
    if (nextMatch) {
      const opponent = isHomeMatch(nextMatch) ? nextMatch.away_team : nextMatch.home_team
      candidates.push({
        type: 'match',
        date: nextMatch.match_date,
        time: nextMatch.match_time || '',
        label: `Kamp mot ${opponent}`,
        sublabel: isHomeMatch(nextMatch) ? 'Hjemme' : 'Borte',
        to: `/kamp/${nextMatch.id}`
      })
    }

    const nextCup = cupMatches.value
      .filter(m => m.match_date > today)
      .sort((a, b) => a.match_date.localeCompare(b.match_date) || (a.match_time || '').localeCompare(b.match_time || ''))[0]
    if (nextCup) {
      const team = cupTeam(nextCup.our_team)
      candidates.push({
        type: 'cup',
        date: nextCup.match_date,
        time: nextCup.match_time || '',
        label: `Cupkamp mot ${nextCup.opponent}`,
        sublabel: team?.name || '',
        to: `/cup/kamp/${nextCup.id}`
      })
    }

    const period = activePeriod.value
    if (period) {
      const trainingDates = sessions.value
        .filter(s => s.period_id === period.id && s.weekday)
        .map(s => ({ s, date: nextDateForWeekday(s.weekday, today, period.end_date) }))
        .filter(x => x.date)
        .sort((a, b) => a.date.localeCompare(b.date))
      if (trainingDates.length > 0) {
        const { s, date } = trainingDates[0]
        candidates.push({
          type: 'training',
          date,
          time: '',
          label: `Trening — ${s.title}`,
          sublabel: period.title || '',
          to: `/trening/${period.id}/okt/${s.id}`
        })
      }
    }

    candidates.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
    return candidates[0] || null
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
    if (activeCup.value) jobs.push(fetchCupMatches(activeCup.value.id))
    if (activePeriod.value) jobs.push(fetchSessions(activePeriod.value.id))
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
    prepFor, reminders, nextEvent
  }
}
