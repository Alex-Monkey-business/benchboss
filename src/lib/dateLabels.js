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
    return capitalize(d.toLocaleDateString('nb-NO', { weekday: 'short' })).replace('.', '')
  }

  return d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }).replace('.', '')
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
