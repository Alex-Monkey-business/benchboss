// Ukeplan-logikk delt mellom trener-Hjem og foreldreflaten:
// resten av uka (i morgen → søndag), kun dager med innhold.
import { localISODate, isoWeekday } from './dateLabels'
import { isHalsenMatch, isHomeMatch } from './matchMeta'
import { dagLink } from './trainingLinks'

// Perioden som gjelder: dekker i dag (åpen slutt teller), ellers nærmeste fremtidige.
export function resolveUpcomingPeriod(periods, today = localISODate()) {
  const covering = periods
    .filter(p => p.start_date && p.start_date <= today && (!p.end_date || today <= p.end_date))
    .sort((a, b) => a.position - b.position)[0]
  if (covering) return covering
  return periods
    .filter(p => p.start_date && p.start_date > today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))[0] || null
}

// includeToday: flater uten egen «I dag»-seksjon (foreldre) tar med dagens hendelser.
// cup: aktiv cup demper treninger på cup-dagene — laget står på cup, ikke på feltet.
export function buildWeekAhead({ today = localISODate(), period, sessions = [], matches = [], cupMatches = [], cup = null, includeToday = false }) {
  const now = new Date(today + 'T12:00:00')
  const daysLeft = 7 - isoWeekday(now)
  const start = includeToday ? 0 : 1
  if (daysLeft < start) return []
  const dates = []
  for (let i = start; i <= daysLeft; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() + i)
    dates.push(localISODate(d))
  }
  const first = dates[0]
  const last = dates[dates.length - 1]
  const items = []

  const cupCovers = (date) =>
    cup?.status === 'active' && cup.start_date && cup.end_date &&
    cup.start_date <= date && date <= cup.end_date

  if (period) {
    for (const date of dates) {
      if (cupCovers(date)) continue
      if (period.start_date && period.start_date <= date && (!period.end_date || date <= period.end_date)) {
        const wd = isoWeekday(new Date(date + 'T12:00:00'))
        sessions
          .filter(s => s.period_id === period.id && s.weekday === wd)
          .forEach(session => items.push({
            kind: 'training',
            date,
            focus: session.focus || '',
            drillCount: (session.drills || []).length,
            to: dagLink(period.id, session.id)
          }))
      }
    }
  }

  matches
    .filter(m => isHalsenMatch(m) && m.match_date >= first && m.match_date <= last)
    .forEach(m => items.push({
      kind: 'match',
      date: m.match_date,
      time: (m.match_time || '').slice(0, 5),
      opponent: isHomeMatch(m) ? m.away_team : m.home_team,
      isHome: isHomeMatch(m),
      to: `/kamp/${m.id}`
    }))

  cupMatches
    .filter(m => m.match_date >= first && m.match_date <= last)
    .forEach(m => items.push({
      kind: 'cup',
      date: m.match_date,
      time: (m.match_time || '').slice(0, 5),
      opponent: m.opponent,
      to: `/cup/kamp/${m.id}`
    }))

  const sorted = items.sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''))

  // Treningene er rytmen, kampene er hendelsene. Med en full uke ble Hjem seks
  // like «Trening»-kort etter hverandre — status, ikke noe å handle på. Fra tre
  // og opp slås de sammen til én rad, så kampene faktisk stikker seg ut.
  const trainings = sorted.filter(i => i.kind === 'training')
  if (trainings.length < 3) return sorted

  const merged = {
    kind: 'training-week',
    date: trainings[0].date,
    count: trainings.length,
    dates: trainings.map(t => t.date),
    // Hjem bruker målene til å skjule «neste trening»-kortet for noe uka alt
    // viser. Uten disse ville sammenslåingen bringt det kortet tilbake.
    targets: trainings.map(t => t.to),
    to: '/trening'
  }

  return [merged, ...sorted.filter(i => i.kind !== 'training')]
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''))
}
