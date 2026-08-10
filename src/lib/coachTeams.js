import { teamColorsForMatch } from './matchMeta'

// Standard trener-oppsett per lagfarge.
// Trenere settes automatisk ved import/oppretting av kamper ut fra hvilke
// Halsen-lag som spiller. Endre rollene her hvis trenerne bytter lag.
// Høst 2026: lag 1 = Rød, lag 2 = Hvit, lag 3 = Grønn.
export const COACH_TEAMS = {
  gronn: ['Simon', 'Alex'],
  rod: ['Trond'],
  hvit: ['Iver', 'Jacob'],
}

// Resolve hvilke trener-IDer som skal settes på en kamp, gitt trener-poolen.
// Unionen av trenerne for hver lagfarge i kampen.
export function defaultCoachIdsForMatch(match, coaches) {
  const colors = teamColorsForMatch(match)
  if (!colors.length) return []
  const names = new Set()
  colors.forEach(color => (COACH_TEAMS[color] || []).forEach(name => names.add(name)))
  return coaches.filter(c => names.has(c.name)).map(c => c.id)
}
