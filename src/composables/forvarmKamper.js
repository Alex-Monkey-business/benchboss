// Kampsida og kampoppsettet trenger scorere, frafall og spillere. Kamplista
// henter dem etter at den selv står, så et trykk på en kamp tegner alt i
// første bilde i stedet for å fylle på etter ett kall.
import { narLedig } from '../lib/forvarm'
import { kveldLager } from '../lib/kveld'
import { useMatches } from './useMatches'
import { useMatchGoals } from './useMatchGoals'
import { usePlayers } from './usePlayers'
import { usePlayerSeasonTeams } from './usePlayerSeasonTeams'

export function forvarmKamper(sesong) {
  if (!sesong) return
  const { fetchSeasonAbsences } = useMatches()
  const { fetchSeasonGoals } = useMatchGoals()
  const { fetchPlayers } = usePlayers()
  const { fetchPlayerSeasonTeams } = usePlayerSeasonTeams()
  narLedig(() => Promise.all([
    fetchSeasonGoals(sesong),
    fetchPlayers(),
    fetchPlayerSeasonTeams(),
    Promise.resolve(fetchSeasonAbsences(sesong)).then(() => kveldLager.fravaer.add(sesong))
  ]))
}
