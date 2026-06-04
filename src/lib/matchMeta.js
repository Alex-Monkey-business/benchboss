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

export function hasResult(match) {
  return match?.home_score !== null && match?.home_score !== undefined
    && match?.away_score !== null && match?.away_score !== undefined
}

// "Spilt" = avspark + 1,5t har passert (kampen er ferdig, ikke i gang).
// Mangler klokkeslett → kampen regnes spilt når datoen er passert.
const PLAYED_BUFFER_MS = 90 * 60 * 1000
export function isPlayed(match, now = Date.now()) {
  // Resultat lagt inn ⇒ kampen er per definisjon spilt, uansett dato/klokke.
  if (hasResult(match)) return true
  if (!match?.match_date) return false
  const time = (match.match_time || '').slice(0, 5)
  const hasTime = time && time !== '00:00'
  const start = new Date(`${match.match_date}T${hasTime ? time : '23:59'}:00`)
  if (Number.isNaN(start.getTime())) return false
  const doneAt = start.getTime() + (hasTime ? PLAYED_BUFFER_MS : 0)
  return doneAt <= now
}
