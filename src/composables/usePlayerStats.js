import { computed } from 'vue'
import { useMatches } from './useMatches'
import { useMatchGoals } from './useMatchGoals'
import { useMatchMode } from './useMatchMode'
import { useSeasons } from './useSeasons'
import { usePlayers } from './usePlayers'
import { usePlayerSeasonTeams } from './usePlayerSeasonTeams'
import { isPlayed, isHalsen, teamColorsForMatch } from '../lib/matchMeta'

// Tallene om én spiller, ett sted.
//
// Regnestykket lå inne i StatistikkView. Da spillerprofilen skulle vise de
// samme tallene sto vi foran to kopier som kunne svare ulikt om samme unge —
// og den slags oppdager man først når en forelder spør. Begge skjermene leser
// herfra nå.
//
// Alt er scoped til sesongen man ser på (`viewingSeason`).
//
// VIKTIG SKILLE, som kostet en feil før den ble oppdaget:
//   `extra`  = rader i `match_players`. Det er HOSPITANTER — spillere lånt inn
//              til en annen kamp enn sitt eget lags. En gutt som spiller alle
//              kampene for sitt eget lag har null rader der.
//   `games`  = kamper spilleren faktisk var med i: lagets kamper i sesongen,
//              minus frafall, pluss innlån. Det er tallet et menneske mener
//              når det spør «hvor mange kamper har han spilt?».

export function usePlayerStats() {
  const { matches, matchPlayers, matchAbsences, fetchMatches, fetchAllMatchPlayers, fetchAllMatchAbsences } = useMatches()
  const { goals, fetchAllGoals } = useMatchGoals()
  const { stints, fetchAllStints } = useMatchMode()
  const { viewingSeason, fetchSeasons } = useSeasons()
  const { players, fetchPlayers } = usePlayers()
  const { fetchPlayerSeasonTeams, teamForSeason } = usePlayerSeasonTeams()

  async function ensurePlayerStats() {
    await Promise.all([
      fetchSeasons(), fetchPlayers(), fetchPlayerSeasonTeams(),
      fetchAllGoals(), fetchAllStints(), fetchAllMatchPlayers(), fetchAllMatchAbsences()
    ])
    if (viewingSeason.value) await fetchMatches(viewingSeason.value.id)
  }

  const seasonId = computed(() => viewingSeason.value?.id ?? null)
  const halsenMatches = computed(() => matches.value.filter(m =>
    isHalsen(m.home_team) || isHalsen(m.away_team)
  ))
  const playedMatches = computed(() => halsenMatches.value.filter(isPlayed))
  const playedIds = computed(() => new Set(playedMatches.value.map(m => m.id)))
  const upcomingIds = computed(() => new Set(halsenMatches.value.filter(m => !isPlayed(m)).map(m => m.id)))
  // Spilletid gates på SESONGEN, ikke på isPlayed. En stint finnes bare hvis
  // klokka faktisk gikk, og en kamp kjørt før oppsatt tid ville ellers falt ut
  // av totalen. Dette speiler regelen Statistikk alltid har brukt.
  const seasonMatchIds = computed(() => new Set(matches.value.map(m => m.id)))

  // player_id → aggregat for sesongen. Én gjennomgang av hver kilde, ikke én
  // per spiller: lista kalles fra leaderboards med 27 rader.
  const statsById = computed(() => {
    const out = {}
    const at = id => out[id] || (out[id] = {
      games: 0, extra: 0, upcomingExtra: 0, goals: 0,
      fieldSec: 0, keeperSec: 0, totalSec: 0, avgSec: 0, timedGames: 0
    })

    // Hospitantrader — uendret regel, det er den Statistikk alltid har vist.
    const lentInn = {}
    for (const mp of matchPlayers.value) {
      if (playedIds.value.has(mp.match_id)) {
        at(mp.player_id).extra++
        ;(lentInn[mp.player_id] || (lentInn[mp.player_id] = new Set())).add(mp.match_id)
      } else if (upcomingIds.value.has(mp.match_id)) {
        at(mp.player_id).upcomingExtra++
      }
    }

    const ute = new Set(matchAbsences.value.map(a => `${a.match_id}|${a.player_id}`))
    const colorsByMatch = new Map(playedMatches.value.map(m => [m.id, teamColorsForMatch(m)]))

    for (const p of players.value) {
      const lag = teamForSeason(p, seasonId.value)
      const e = at(p.id)
      for (const m of playedMatches.value) {
        if (ute.has(`${m.id}|${p.id}`)) continue
        const eget = lag && colorsByMatch.get(m.id)?.includes(lag)
        // Innlån teller også — men aldri dobbelt om laget alt er med i kampen.
        if (eget || lentInn[p.id]?.has(m.id)) e.games++
      }
    }

    for (const g of goals.value) {
      if (!playedIds.value.has(g.match_id)) continue
      at(g.player_id).goals++
    }

    // Kun lukkede stints: en åpen stint er en kamp som fortsatt går, og den
    // ville vokst hver gang skjermen rendret.
    const timed = {}
    for (const s of stints.value) {
      if (!seasonMatchIds.value.has(s.match_id)) continue
      if (s.off_clock == null) continue
      const e = at(s.player_id)
      const dur = Math.max(0, s.off_clock - s.on_clock)
      if (s.role === 'keeper') e.keeperSec += dur
      else e.fieldSec += dur
      e.totalSec += dur
      ;(timed[s.player_id] || (timed[s.player_id] = new Set())).add(s.match_id)
    }
    for (const [id, set] of Object.entries(timed)) {
      out[id].timedGames = set.size
      out[id].avgSec = Math.round(out[id].totalSec / set.size)
    }

    return out
  })

  const EMPTY = {
    games: 0, extra: 0, upcomingExtra: 0, goals: 0,
    fieldSec: 0, keeperSec: 0, totalSec: 0, avgSec: 0, timedGames: 0
  }
  function statsFor(playerId) {
    return statsById.value[playerId] || EMPTY
  }

  // Kampene spilleren var med i, nyeste først — profilen viser de siste.
  function matchesFor(playerId) {
    const p = players.value.find(x => x.id === playerId)
    const lag = teamForSeason(p, seasonId.value)
    const lent = new Set(matchPlayers.value.filter(mp => mp.player_id === playerId).map(mp => mp.match_id))
    const ute = new Set(matchAbsences.value.filter(a => a.player_id === playerId).map(a => a.match_id))
    return playedMatches.value
      .filter(m => !ute.has(m.id) && ((lag && teamColorsForMatch(m).includes(lag)) || lent.has(m.id)))
      .sort((a, b) => String(b.match_date).localeCompare(String(a.match_date)))
  }

  return { ensurePlayerStats, statsById, statsFor, matchesFor, playedIds, upcomingIds, halsenMatches }
}
