import { teamColorsForMatch } from './matchMeta'

// Hvilke trener-IDer skal settes på en kamp, gitt trener-poolen.
// Unionen av trenerne for hvert av våre lag i kampen.
//
// `teams` er de oppløste lagene fra useSeasonTeams — team_coaches i basen for
// sesongen. Et lag uten trenere gir tomt, ikke et gjett: før lå det en statisk
// liste med Halsens navn her som fallback, og den ville satt Halsen-trenere på
// et annet kulls kamper.
export function defaultCoachIdsForMatch(match, coaches, teams = []) {
  const colors = teamColorsForMatch(match)
  if (!colors.length) return []
  const names = new Set()
  colors.forEach(color => {
    const list = teams?.find(t => t.slug === color)?.trainers ?? []
    list.forEach(name => names.add(name))
  })
  return coaches.filter(c => names.has(c.name)).map(c => c.id)
}
