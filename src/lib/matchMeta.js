// Avledet kamp-metadata fra lagnavn — én kilde, brukt av kort, lister og detalj.
// Ingen ekstra data lagres; alt utledes av home_team/away_team.
//
// «Hvem er vi» var strengen 'halsen'. Nå er det klubbens kortnavn fra det
// aktive kullet, og lagene er kullets `teams`-rader. Samme funksjoner, samme
// kallsteder — men en Stag-trener ser sine kamper, ikke ingenting.
import { useAuth } from '../stores/auth'
import { useSeasonTeams } from '../composables/useSeasonTeams'

function clubKey() {
  return useAuth().activeCohort.value?.club_key || ''
}

function teams() {
  return useSeasonTeams().seasonTeams.value
}

// Kretsens oppsett skriver «Halsen Rød» og «Sandefjord BK RØD» om hverandre;
// vi sammenligner uten skille på store bokstaver og uten æøå.
function norm(s) {
  return (s || '').toLowerCase().replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/å/g, 'a')
}

// Er dette et av VÅRE lag? Klubbens kortnavn i lagstrengen.
export function isOurs(name) {
  const key = norm(clubKey())
  return !!key && norm(name).includes(key)
}

// Lagstreng → slug på et av kullets lag. Lengste navn først, så «Stag 1» ikke
// stjeler «Stag 10». Tom streng når ingen treffer.
export function teamSlugFromName(name) {
  const n = norm(name)
  if (!n) return ''
  const list = [...teams()].sort((a, b) => norm(b.name).length - norm(a.name).length)
  for (const t of list) {
    const tn = norm(t.name)
    if (tn && n.includes(tn)) return t.slug
    if (t.slug && n.includes(norm(t.slug))) return t.slug
  }
  return ''
}

export function teamLabel(slug) {
  return teams().find(t => t.slug === slug)?.name || ''
}

export function teamAccent(slug) {
  return teams().find(t => t.slug === slug)?.accent || ''
}

// Alle lag-slugs i kullet, i visningsrekkefølge.
export function teamSlugs() {
  return teams().map(t => t.slug)
}

// Våre lag som er med i kampen (1 for vanlig kamp, 2 for intern kamp).
export function teamColorsForMatch(match) {
  if (!match) return []
  const colors = []
  if (isOurs(match.home_team)) {
    const c = teamSlugFromName(match.home_team)
    if (c) colors.push(c)
  }
  if (isOurs(match.away_team)) {
    const c = teamSlugFromName(match.away_team)
    if (c && !colors.includes(c)) colors.push(c)
  }
  return colors
}

export function isHomeMatch(match) {
  return isOurs(match?.home_team)
}

export function isAwayMatch(match) {
  return !isOurs(match?.home_team) && isOurs(match?.away_team)
}

export function isOurMatch(match) {
  return isOurs(match?.home_team) || isOurs(match?.away_team)
}

// Motstanderen sett fra oss. Intern kamp → bortelaget.
export function opponentOf(match) {
  if (!match) return ''
  return isOurs(match.home_team) ? (match.away_team || '') : (match.home_team || '')
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
