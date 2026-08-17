// Smart Norwegian date labels.
// Convert ISO date strings (YYYY-MM-DD) to human-readable relative labels.

const DAY_MS = 24 * 60 * 60 * 1000

function startOfDay(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function daysBetween(a, b) {
  return Math.round((startOfDay(a) - startOfDay(b)) / DAY_MS)
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Punktum etter BOKSTAVER er en forkortelse («ons.», «aug.») — den kan vi
// droppe for et roligere uttrykk. Punktum etter SIFFER er ordenstallet i norsk
// datoskriving («19.») — den SKAL stå. «19 aug» er feil, «19. aug» er riktig.
//
// Dette lå før som tre ulike `.replace()` rundt i kodebasen: to som strippet
// alt, og én som strippet bare det første punktumet — altså ordenstallet, og
// beholdt forkortelsen. Nøyaktig omvendt.
export function trimAbbrevDots(s) {
  return (s || '').replace(/([a-zæøå])\./gi, '$1')
}

// «Onsdag 19. aug» — én form, uansett hvor nær hendelsen er.
//
// relativeDateLabel har sin plass i påminnelser, men på et kampkort må dagen
// kunne leses direkte. «I overmorgen» tvinger deg til å regne deg fram til
// hvilken dag det faktisk er; «Onsdag» ER svaret. Uten betingelser blir det
// dessuten samme form hver gang — det er hele grunnen til at radene under
// «Andre lag» leser rolig.
export function weekdayDateLabel(isoDate) {
  if (!isoDate) return ''
  const d = new Date(isoDate + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return ''
  const s = d.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'short' })
  return trimAbbrevDots(capitalize(s))
}

// Returns "I dag", "I morgen", "Mandag", "Neste mandag", "Mandag 15. mai", etc.
// Used for date group headers and primary date displays.
export function relativeDateLabel(isoDate, now = new Date()) {
  if (!isoDate) return ''
  const d = new Date(isoDate + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return ''

  const diff = daysBetween(d, now)

  if (diff === 0) return 'I dag'
  if (diff === 1) return 'I morgen'
  if (diff === -1) return 'I går'
  if (diff === 2) return 'I overmorgen'

  // Within current week (next 6 days) — just weekday
  if (diff > 0 && diff < 7) {
    return capitalize(d.toLocaleDateString('nb-NO', { weekday: 'long' }))
  }

  // Next week (7-13 days ahead) — "Neste mandag"
  if (diff >= 7 && diff < 14) {
    const weekday = d.toLocaleDateString('nb-NO', { weekday: 'long' })
    return `Neste ${weekday}`
  }

  // Past within the last week — "Forrige mandag"
  if (diff < 0 && diff > -7) {
    const weekday = d.toLocaleDateString('nb-NO', { weekday: 'long' })
    return `Forrige ${weekday}`
  }

  // Within current year — "Mandag 15. mai"
  const sameYear = d.getFullYear() === now.getFullYear()
  if (sameYear) {
    return capitalize(d.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' }))
  }

  // Different year — include year
  return capitalize(d.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))
}

// Short variant for inline use — "i dag", "tirs.", "15. mai"
export function shortRelativeDate(isoDate, now = new Date()) {
  if (!isoDate) return ''
  const d = new Date(isoDate + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return ''

  const diff = daysBetween(d, now)

  if (diff === 0) return 'I dag'
  if (diff === 1) return 'I morgen'
  if (diff === -1) return 'I går'

  if (diff > 0 && diff < 7) {
    return trimAbbrevDots(capitalize(d.toLocaleDateString('nb-NO', { weekday: 'short' })))
  }

  return trimAbbrevDots(d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }))
}

// Local ISO date (YYYY-MM-DD). Bruk denne, ikke toISOString().slice(0,10) —
// toISOString gir UTC og bommer på dagen mellom midnatt og 01/02 norsk tid.
export function localISODate(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ISO-ukedag: 1 = mandag … 7 = søndag (JS getDay() har søndag = 0).
export function isoWeekday(d = new Date()) {
  return ((d.getDay() + 6) % 7) + 1
}

// Indeks = isoWeekday - 1.
export const WEEKDAY_LABELS = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag']

// Hele dager frem til en ISO-dato (negativt for fortid).
export function daysUntil(isoDate, now = new Date()) {
  if (!isoDate) return 0
  return daysBetween(new Date(isoDate + 'T12:00:00'), now)
}

// Is this date today?
export function isToday(isoDate, now = new Date()) {
  if (!isoDate) return false
  return daysBetween(new Date(isoDate + 'T12:00:00'), now) === 0
}

// Is this date in the past?
export function isPast(isoDate, now = new Date()) {
  if (!isoDate) return false
  return daysBetween(new Date(isoDate + 'T12:00:00'), now) < 0
}
