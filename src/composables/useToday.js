// Aggregator for hjem-skjermen («I dag») — komponerer eksisterende singletons
// og avleder dagens hendelser, prep-status og påminnelser.
import { ref, computed } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { useAuth } from '../stores/auth'
import { useFeatures } from './useFeatures'
import { useSeasons } from './useSeasons'
import { useMatches } from './useMatches'
import { useCoaches } from './useCoaches'
import { useExpenses } from './useExpenses'
import { useCups } from './useCups'
import { useCupMatches } from './useCupMatches'
import { useTrainingWeek } from './useTrainingWeek'
import { useSeasonTeams } from './useSeasonTeams'
import { useMatchMode } from './useMatchMode'
import { localISODate, isoWeekday, daysUntil } from '../lib/dateLabels'
import { isOurMatch, isHomeMatch, teamColorsForMatch } from '../lib/matchMeta'
import { buildWeekAhead } from '../lib/weekAhead'
import { buildReminders } from '../lib/reminders'
import { useDismissedReminders } from './useDismissedReminders'
import { useCupTeams } from './useCupTeams'
import { useCupFirst } from './useCupFirst'
import { registerReset } from '../stores/dataReset'

// Egen modul-state. NB: ikke gjenbruk useMatchMode.fetchSession her —
// den holder én singleton-session og knekker når to Halsen-lag spiller samme dag.
const prepSessions = ref([])
const loading = ref(false)

registerReset(() => { prepSessions.value = []; loading.value = false })

export function useToday() {
  const { coach, preferredTeam, preferredCupTeam, activeCohort } = useAuth()
  const { usesReferees } = useFeatures()
  const { dismissed } = useDismissedReminders()
  const { activeSeason, fetchSeasons } = useSeasons()
  const { matches, fetchMatches, getCoachesForMatch } = useMatches()
  const { fetchCoaches } = useCoaches()
  const { fetchExpenses, getExpenseForMatch } = useExpenses()
  const { activeCup, cupInProgress, fetchCups } = useCups()
  const { cupMatches, fetchCupMatches } = useCupMatches()
  const { cupTeams } = useCupTeams()
  const { cupFirst, fetchSerieStatus } = useCupFirst()
  const { days: treningsdager, fetchWeek } = useTrainingWeek()
  const { seasonTeams, teamsFromDb, fetchSeasonTeams } = useSeasonTeams()
  const matchMode = useMatchMode()

  // ── Hvilket lag trener JEG? ────────────────────────────────────────────────
  //
  // Hjem spurte før aldri om dette — den utledet «mitt» av per-kamp-tilordninger
  // i `match_coaches`. Det er en annen ting: det sier hvem som STILLER på en
  // kamp, ikke hvilket lag som er ditt. Står du ikke oppført på noen kommende
  // kamp, falt alt tilbake til «alle Halsen-kamper», og da kunne Rød sin kamp
  // lande øverst hos Grønn-treneren.
  //
  // Rekkefølgen under er ikke tilfeldig. `team_coaches` og
  // `cohort_members.preferred_team` settes til det SAMME når et medlem
  // inviteres eller redigeres — men bare den første er per sesong. Roterer
  // lagene til våren, skrives en ny team_coaches-rad, mens preferred_team blir
  // stående på fjorårets lag til noen rører den. Derfor vinner sesongraden.
  const teamByName = list => {
    const name = coach.value?.name
    if (!name) return null
    const hits = list.filter(t => (t.trainers || []).includes(name)).map(t => t.slug)
    return hits.length ? new Set(hits) : null
  }

  const myTeamColors = computed(() => {
    // 1. Sesongens lagkobling fra basen — den eneste kilden som roterer med sesongen.
    if (teamsFromDb.value) {
      const fromSeason = teamByName(seasonTeams.value)
      if (fromSeason) return fromSeason
    }
    // 2. Ditt eget medlemskort. Ikke sesongbevisst, men ekte data om deg.
    if (preferredTeam.value) return new Set([preferredTeam.value])
    // 3. Den statiske lag-configen (lib/seasonTeams.js) — et hardkodet
    //    øyeblikksbilde, siste utvei før vi gjetter på kamptilordninger.
    return teamByName(seasonTeams.value) || new Set()
  })

  const ourMatches = computed(() => matches.value.filter(isOurMatch))

  const assignedToMe = m => !!coach.value?.id && getCoachesForMatch(m.id).includes(coach.value.id)

  const hasOwnAssignments = computed(() => ourMatches.value.some(assignedToMe))

  // Lagkobling først, per-kamp-tilordning som nødløsning, alt som siste utvei.
  const myMatches = computed(() => {
    if (myTeamColors.value.size) {
      return ourMatches.value.filter(m =>
        teamColorsForMatch(m).some(c => myTeamColors.value.has(c))
      )
    }
    if (hasOwnAssignments.value) return ourMatches.value.filter(assignedToMe)
    return ourMatches.value
  })

  const greeting = computed(() => {
    const h = new Date().getHours()
    const word = h < 10 ? 'God morgen' : h < 17 ? 'God dag' : 'God kveld'
    const first = (coach.value?.name || '').split(' ')[0]
    return first ? `${word}, ${first}` : word
  })

  // Hero-kortet er MIN kamp. Klubbens andre kamper i dag hører hjemme under
  // «Andre lag» — de skal ikke være det første og største du ser.
  const todayMatches = computed(() => {
    const today = localISODate()
    return myMatches.value
      .filter(m => m.match_date === today)
      .sort((a, b) => (a.match_time || '').localeCompare(b.match_time || ''))
  })

  // Alle Halsen-kamper i dag — brukes kun til å hindre at «Å ordne» gjentar
  // noe som allerede står som kort. Snevret vi denne inn sammen med hero-kortet,
  // ville påminnelser om andre lags kamper plutselig dukket opp igjen.
  const todayOurMatches = computed(() => {
    const today = localISODate()
    return ourMatches.value.filter(m => m.match_date === today)
  })

  // Cupkamper for MITT cup-lag. Med to lag i samme cup blir alle kampene støy
  // — trenere uten eget cup-lag ser alt.
  //
  // Preferansen ligger nå på medlemsraden. Den må VALIDERES mot lagene i denne
  // cupen før bruk: slugene roterer mellom cuper, og en lagret preferanse fra
  // forrige cup ville ellers filtrert lista til null kamper og gitt en
  // tom-tilstand som ser ut som en feil.
  const myCupMatches = computed(() => {
    const preferred = preferredCupTeam.value
    if (preferred && cupTeams.value.some(t => t.slug === preferred)) {
      return cupMatches.value.filter(m => m.our_team === preferred)
    }

    // Fallback for PIN-broen, som ikke har noen medlemsrad å hente den fra.
    const first = (coach.value?.name || '').split(' ')[0].toLowerCase()
    const mine = cupTeams.value.find(t => (t.trainers || []).some(n => n.toLowerCase() === first))
    return mine ? cupMatches.value.filter(m => m.our_team === mine.slug) : cupMatches.value
  })

  const todayCupMatches = computed(() => {
    const today = localISODate()
    return myCupMatches.value
      .filter(m => m.match_date === today)
      .sort((a, b) => (a.match_time || '').localeCompare(b.match_time || ''))
  })

  // Cup-dager demper trening: laget står på cup, ikke på feltet.
  const cupCoversToday = computed(() => {
    const cup = activeCup.value
    if (cup?.status !== 'active' || !cup.start_date || !cup.end_date) return false
    const today = localISODate()
    return cup.start_date <= today && today <= cup.end_date
  })

  // Trener vi i dag? Ukedagen er hele spørsmålet nå. Før måtte en periode dekke
  // datoen først, og gikk måneden ut i går, svarte dette nei på en tirsdag laget
  // trente.
  const todayTraining = computed(() => {
    if (cupCoversToday.value) return null
    // Spiller mitt lag kamp i dag, er det kampen som fortjener toppen. Treninga
    // er rytme; kampen er dagen. Samme prioritering som cup gjør over.
    if (todayMatches.value.length) return null
    const wd = isoWeekday()
    return treningsdager.value.find(d => d.weekday === wd) || null
  })

  // Prep-status for en kamp. referee er null for bortekamper (ikke vår jobb).
  //
  // «Tropp tatt ut» er BORTE, og det var aldri en ekte sjekk: laget avledes av
  // players.primary_team mot kampens lagfarge — det finnes alltid, det er
  // ingenting å ta ut. Sjekken testet `match_players`, som er hospitanter.
  // Den kunne derfor aldri bli sann, og sto som et evig uløst punkt.
  function prepFor(matchId) {
    const match = matches.value.find(m => m.id === matchId)
    if (!match) return null
    const s = prepSessions.value.find(p => p.match_id === matchId)
    const home = isHomeMatch(match)
    return {
      isHome: home,
      // null betyr «ikke vår jobb» — kortene hopper over punktet. Samme svar
      // for bortekamp og for et kull som ikke skaffer dommer selv.
      referee: home && usesReferees.value ? !!(match.referee || '').trim() : null,
      lineup: !!s && Object.keys(s.lineup || {}).length > 0,
      status: s?.status || null
    }
  }

  // Kampen som står som kort på toppen — dagens, eller neste når det ikke er
  // kamp i dag. Speiler `heroMatch` i HjemView.
  const heroMatchId = computed(() => {
    if (todayMatches.value.length || todayCupMatches.value.length) return null
    return nextMatch.value?.id || null
  })

  const reminders = computed(() => buildReminders({
    matches: matches.value,
    coachId: coach.value?.id,
    getCoachesForMatch,
    getExpenseForMatch,
    trainingDays: treningsdager.value,
    // Alt som allerede står som kort. Kortet sier «Mangler dommer» — da skal
    // ikke «Å ordne» si det samme 30 cm lenger ned. Det var Alex' poeng:
    // «trenger vel nesten ikke Å ordne hvis det blir highlightet under kampen».
    excludeMatchIds: [
      ...todayOurMatches.value.map(m => m.id),
      ...(heroMatchId.value ? [heroMatchId.value] : [])
    ],
    // Kampen som står i kortet øverst — påminnelsen om den slipper å gjenta
    // motstanderen.
    primaryMatchId: nextMatch.value?.id || null,
    dismissedKeys: dismissed.value,
    usesReferees: usesReferees.value,
    // Kampene som ble spilt før kullet fantes i appen er historikk, ikke
    // etterslep.
    sinceIso: (activeCohort.value?.created_at || '').slice(0, 10) || null
  }))

  // Neste forekomst av en ukedag etter i dag. Ingen sluttdato å klippe mot
  // lenger: uka løper til noen endrer den, så det finnes alltid en neste.
  function nesteDatoFor(weekday) {
    const d = new Date(localISODate() + 'T12:00:00')
    for (let i = 0; i < 7; i++) {
      d.setDate(d.getDate() + 1)
      if (isoWeekday(d) === weekday) return localISODate(d)
    }
    return null
  }

  const nextTraining = computed(() => {
    const kandidater = treningsdager.value
      .filter(d => d.weekday)
      .map(d => ({ session: d, date: nesteDatoFor(d.weekday) }))
      .filter(x => x.date)
      .sort((a, b) => a.date.localeCompare(b.date))
    return kandidater[0] || null
  })

  // Sesongstart: vises i opptakten til sesongens aller første kamp, og
  // forsvinner av seg selv så snart den kampen er spilt. Lagene rulleres
  // mellom sesongene, så dette er også varselet om nye tropper og trenere.
  const KICKOFF_WINDOW_DAYS = 21

  const seasonKickoff = computed(() => {
    const today = localISODate()
    const dates = matches.value
      .filter(m => isOurMatch(m) && m.match_date)
      .map(m => m.match_date)
      .sort()
    const first = dates[0]
    if (!first || first <= today) return null

    const days = daysUntil(first)
    if (days > KICKOFF_WINDOW_DAYS) return null

    return { season: activeSeason.value?.name || '', date: first, days }
  })

  // Resten av uka (i morgen → søndag): treninger fra ukerytmen + MINE seriekamper.
  // De andre lagenes kamper hører hjemme under «Andre lag» — sto de begge
  // steder, leste Hjem som om det skjedde dobbelt så mye.
  // Cup-kamper ramses IKKE opp her — cup-widgeten på Hjem er inngangen,
  // og aktiv cup demper treninger på cup-dagene (via cup-parameteren).
  //
  // Uten serie er cup-kampene de eneste kampene som finnes, og da SKAL de i
  // uka. `cupMatches`-parameteren har ligget i buildWeekAhead hele tiden uten
  // en eneste kaller — den var skrevet for dette.
  //
  // Med serie står regelen over: cup-widgeten er inngangen, og en aktiv cup
  // demper treninger på cup-dagene i stedet for å ramse dem opp.
  const weekAhead = computed(() => buildWeekAhead({
    days: treningsdager.value,
    matches: myMatches.value,
    cupMatches: cupFirst.value ? myCupMatches.value : [],
    cup: activeCup.value
  }))

  // Neste kamp = MIN neste seriekamp. Cup dekkes av widgeten.
  //
  // Uten serie finnes det ingen seriekamp å vente på, og da er neste cup-kamp
  // hovedsaken på Hjem. NextMatchCard tar allerede imot `type: 'cup'` og sier
  // «Neste cupkamp» — kortet var forberedt, ingen har bare gitt det noe.
  const nextMatch = computed(() => {
    const today = localISODate()
    const byDateTime = (a, b) => a.match_date.localeCompare(b.match_date) || (a.match_time || '').localeCompare(b.match_time || '')

    const league = myMatches.value.filter(m => m.match_date > today).sort(byDateTime)[0]

    if (!league && cupFirst.value) {
      const cupKamp = myCupMatches.value
        .filter(m => m.match_date && m.match_date > today)
        .sort(byDateTime)[0]
      if (!cupKamp) return null
      return {
        type: 'cup',
        id: cupKamp.id,
        date: cupKamp.match_date,
        time: cupKamp.match_time || '',
        opponent: cupKamp.opponent || 'Motstander kommer',
        teamName: cupTeams.value.find(t => t.slug === cupKamp.our_team)?.name || '',
        pitch: cupKamp.pitch || '',
        round: cupKamp.round || '',
        to: `/cup/kamp/${cupKamp.id}`
      }
    }

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

  const myColors = computed(() =>
    myTeamColors.value.size
      ? new Set(myTeamColors.value)
      : new Set(myMatches.value.flatMap(teamColorsForMatch))
  )

  const otherTeamsNext = computed(() => {
    const today = localISODate()
    const byDateTime = (a, b) => a.match_date.localeCompare(b.match_date) || (a.match_time || '').localeCompare(b.match_time || '')

    // Mine egne lag er dekket av uka og neste-kamp-kortet.
    const seen = new Set(myColors.value)
    const out = []

    // Fra og med i DAG: spiller et annet lag i dag, står det her — ikke som
    // hero-kortet, men det skal ikke forsvinne helt heller.
    for (const m of ourMatches.value.filter(x => x.match_date >= today).sort(byDateTime)) {
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

    // Kampene avhenger av sesongen, og dét ga en ekstra rundtur hver gang.
    // Men sesongen ligger i cachen fra sist. Da går kampene i SAMME bølge som
    // sesongene, og bare hvis den aktive sesongen viser seg å være en annen,
    // hentes de på nytt. Fra seks serielle bølger til to på en varm start.
    const kjentSesong = activeSeason.value?.id || null
    const kjentCup = cupInProgress.value ? activeCup.value?.id : null
    const forste = [fetchSeasons(), fetchCoaches(), fetchCups(), fetchWeek(), fetchSerieStatus()]
    if (kjentSesong) {
      forste.push(fetchMatches(kjentSesong))
      if (activeCohort.value?.id) forste.push(fetchSeasonTeams(activeCohort.value.id, kjentSesong))
    }
    if (kjentCup) forste.push(fetchCupMatches(kjentCup))
    await Promise.all(forste)

    const jobs = []
    if (activeSeason.value && activeSeason.value.id !== kjentSesong) {
      jobs.push(fetchMatches(activeSeason.value.id))
      // Lag-til-trener: uten denne vet ikke Hjem hvilket lag som er mitt, og
      // faller tilbake på den statiske configen i lib/seasonTeams.js.
      if (activeCohort.value?.id) jobs.push(fetchSeasonTeams(activeCohort.value.id, activeSeason.value.id))
    }
    // Ferdig cup trenger ikke lastes på Hjem — cup-sidene henter selv for historikken.
    if (cupInProgress.value && activeCup.value?.id !== kjentCup) jobs.push(fetchCupMatches(activeCup.value.id))
    await Promise.all(jobs)

    // Prep for dagens kamp OG neste kamp — neste-kortet viser nå hva som
    // mangler, og da må dataene faktisk være hentet.
    // Cup-kamper har ingen dommer, ingen utlegg og ingen oppstilling å hente —
    // de lever i sine egne tabeller. Slipper vi en cup-id inn her, spør vi
    // seriekamp-tabellene om en rad som ikke finnes.
    const prepIds = [...new Set([
      ...todayMatches.value.map(m => m.id),
      ...(nextMatch.value && nextMatch.value.type !== 'cup' ? [nextMatch.value.id] : [])
    ])]

    await Promise.all([
      fetchExpenses(matches.value.map(m => m.id)),
      fetchPrepSessions(prepIds)
    ])
    loading.value = false
  }

  return {
    loading, refresh, greeting,
    todayMatches, todayCupMatches, todayTraining,
    prepFor, reminders, nextTraining, nextMatch, otherTeamsNext, weekAhead, seasonKickoff
  }
}
