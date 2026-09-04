// Ukeplan-logikk delt mellom trener-Hjem og foreldreflaten:
// resten av uka (i morgen → søndag), kun dager med innhold.
import { localISODate, isoWeekday } from './dateLabels'
import { isOurMatch, isHomeMatch } from './matchMeta'
import { dagLink } from './trainingLinks'

// Her lå resolveUpcomingPeriod: den fant måneden som dekket i dag, og uka ble
// lest ut av den. Fant den ingen — og det gjorde den hver gang en måned gikk ut
// uten at noen hadde laget den neste — sto uka tom på både Hjem og
// foreldreflaten, selv om laget trente som før. Uka har ingen periode å ligge i
// nå; en treningsdag gjelder til noen fjerner den.

// includeToday: flater uten egen «I dag»-seksjon (foreldre) tar med dagens hendelser.
// cup: aktiv cup demper treninger på cup-dagene — laget står på cup, ikke på feltet.
export function buildWeekAhead({ today = localISODate(), days = [], matches = [], cupMatches = [], cup = null, includeToday = false }) {
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

  // Kamp trumfer trening samme dag — samme regel som cup allerede har, og av
  // samme grunn: laget står på kamp, ikke på feltet. `matches` er MINE kamper
  // (useToday sender myMatches), så en Rød-kamp demper ikke Grønn-treneren.
  const kampdager = new Set(matches.filter(isOurMatch).map(m => m.match_date))

  for (const date of dates) {
    if (cupCovers(date) || kampdager.has(date)) continue
    const wd = isoWeekday(new Date(date + 'T12:00:00'))
    days
      .filter(d => d.weekday === wd)
      .forEach(dag => items.push({
        kind: 'training',
        date,
        focus: dag.focus || '',
        drillCount: (dag.drills || []).length,
        to: dagLink(dag.id)
      }))
  }

  matches
    .filter(m => isOurMatch(m) && m.match_date >= first && m.match_date <= last)
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

  // Treningene er rytmen, kampene er hendelsene. Rytmen skal aldri ta mer enn
  // én linje: den er lik hver uke, så to like «Trening»-rader er status, ikke
  // noe å handle på. Terskelen sto på tre, og da virket sammenslåingen bare på
  // mandag — tirsdag og onsdag falt under og viste to rader hver.
  //
  // Fra TO og opp: én alene slås ikke sammen, for da ville raden si
  // «1 treninger» under overskriften «Uka».
  const trainings = sorted.filter(i => i.kind === 'training')
  if (trainings.length < 2) return sorted

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
