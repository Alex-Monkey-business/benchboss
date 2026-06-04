// Avledet kamp-metadata fra lagnavn — én kilde, brukt av kort, lister og detalj.
// Ingen ekstra data lagres; alt utledes av home_team/away_team.

export const TEAM_LABELS = { gronn: 'Grønn', rod: 'Rød', hvit: 'Hvit' }

export function teamLabel(color) {
  return TEAM_LABELS[color] || ''
}

export function isHalsen(name) {
  return (name || '').toLowerCase().includes('halsen')
}

export function colorFromName(name) {
  const n = (name || '').toLowerCase()
  if (n.includes('grønn') || n.includes('gronn')) return 'gronn'
  if (n.includes('rød') || n.includes('rod')) return 'rod'
  if (n.includes('hvit')) return 'hvit'
  return ''
}

// Halsen-lagfargene som er med i kampen (1 for vanlig kamp, 2 for intern kamp).
export function teamColorsForMatch(match) {
  if (!match) return []
  const colors = []
  if (isHalsen(match.home_team)) {
    const c = colorFromName(match.home_team)
    if (c) colors.push(c)
  }
  if (isHalsen(match.away_team)) {
    const c = colorFromName(match.away_team)
    if (c && !colors.includes(c)) colors.push(c)
  }
  return colors
}

export function isHomeMatch(match) {
  return isHalsen(match?.home_team)
}

export function isAwayMatch(match) {
  return !isHalsen(match?.home_team) && isHalsen(match?.away_team)
}

export function isHalsenMatch(match) {
  return isHalsen(match?.home_team) || isHalsen(match?.away_team)
}
