// Påminnelser for hjem-skjermen — rene funksjoner, ingen state.
// Rangert etter hastegrad: dommer (tidskritisk) → resultat → utlegg → referat.

import { shortRelativeDate, relativeDateLabel, localISODate } from './dateLabels'
import { isHomeMatch, isHalsenMatch, isPlayed, hasResult } from './matchMeta'

const MAX_REMINDERS = 3
const REF_WINDOW_DAYS = 7
const RESULT_LOOKBACK_DAYS = 14

function isoDaysFrom(today, days) {
  const d = new Date(today + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return localISODate(d)
}

// Returnerer maks 3 påminnelser: { kind, title, body, matchId }.
// excludeMatchIds: dagens kamper — de dekkes av kampkortets egen sjekkliste.
export function buildReminders({ matches, coachId, getCoachesForMatch, getExpenseForMatch, today = localISODate(), excludeMatchIds = [] }) {
  if (!coachId) return []
  const excluded = new Set(excludeMatchIds)
  const mine = (m) => getCoachesForMatch(m.id).includes(coachId)
  const reminders = []

  // 1. Dommer mangler på kommende hjemmekamp innen 7 dager.
  const refDeadline = isoDaysFrom(today, REF_WINDOW_DAYS)
  const refLess = matches
    .filter(m =>
      isHomeMatch(m) &&
      !excluded.has(m.id) &&
      m.match_date >= today &&
      m.match_date <= refDeadline &&
      !(m.referee || '').trim() &&
      mine(m)
    )
    .sort((a, b) => a.match_date.localeCompare(b.match_date))
  if (refLess.length > 0) {
    const m = refLess[0]
    const time = (m.match_time || '').slice(0, 5)
    const when = relativeDateLabel(m.match_date).toLowerCase()
    reminders.push({
      kind: 'no-ref',
      title: `Dommer mangler til kampen mot ${m.away_team}`,
      body: `Hjemmekamp ${when}${time && time !== '00:00' ? ` kl. ${time}` : ''} — ordne dommer før avspark.`,
      matchId: m.id
    })
  }

  // 2. Resultat ikke registrert på nylig spilt kamp.
  const resultFloor = isoDaysFrom(today, -RESULT_LOOKBACK_DAYS)
  const resultLess = matches
    .filter(m =>
      isHalsenMatch(m) &&
      !excluded.has(m.id) &&
      m.match_date >= resultFloor &&
      m.match_date <= today &&
      isPlayed(m) &&
      !hasResult(m)
    )
    .sort((a, b) => b.match_date.localeCompare(a.match_date))
  if (resultLess.length > 0) {
    const m = resultLess[0]
    const opponent = isHomeMatch(m) ? m.away_team : m.home_team
    reminders.push({
      kind: 'no-result',
      title: resultLess.length === 1
        ? `Resultat mangler fra kampen mot ${opponent}`
        : `${resultLess.length} kamper mangler resultat`,
      body: resultLess.length === 1
        ? `Spilt ${relativeDateLabel(m.match_date).toLowerCase()} — legg inn sluttresultatet.`
        : `Den siste er mot ${opponent}, ${shortRelativeDate(m.match_date).toLowerCase()}.`,
      matchId: m.id
    })
  }

  // 3. Utlegg ikke ført på forbi hjemmekamp der jeg var trener.
  const pendingExpense = matches
    .filter(m =>
      isHomeMatch(m) &&
      !excluded.has(m.id) &&
      m.match_date < today &&
      !getExpenseForMatch(m.id) &&
      mine(m)
    )
    .sort((a, b) => b.match_date.localeCompare(a.match_date))
  if (pendingExpense.length > 0) {
    const m = pendingExpense[0]
    reminders.push({
      kind: 'pending-expense',
      title: pendingExpense.length === 1
        ? `Utlegg venter fra kampen mot ${m.away_team}`
        : `${pendingExpense.length} kamper venter på utlegg`,
      body: pendingExpense.length === 1
        ? 'Registrer Vipps-utlegget når du har et øyeblikk.'
        : `Den siste er mot ${m.away_team}, ${shortRelativeDate(m.match_date).toLowerCase()}.`,
      matchId: m.id
    })
  }

  // 4. Referat mangler på nylig spilt kamp der resultatet er inne (lavest hast —
  //    først når tallene finnes; ellers dekker «resultat mangler» kampen alt).
  const reportFloor = isoDaysFrom(today, -RESULT_LOOKBACK_DAYS)
  const reportLess = matches
    .filter(m =>
      isHalsenMatch(m) &&
      !excluded.has(m.id) &&
      m.match_date >= reportFloor &&
      m.match_date <= today &&
      isPlayed(m) &&
      hasResult(m) &&
      !(m.report || '').trim()
    )
    .sort((a, b) => b.match_date.localeCompare(a.match_date))
  if (reportLess.length > 0) {
    const m = reportLess[0]
    const opponent = isHomeMatch(m) ? m.away_team : m.home_team
    reminders.push({
      kind: 'no-report',
      title: reportLess.length === 1
        ? `Referat mangler fra kampen mot ${opponent}`
        : `${reportLess.length} kamper mangler referat`,
      body: reportLess.length === 1
        ? 'Resultatet er inne — skriv noen ord mens kampen er fersk.'
        : `Den siste er mot ${opponent}, ${shortRelativeDate(m.match_date).toLowerCase()}.`,
      matchId: m.id
    })
  }

  return reminders.slice(0, MAX_REMINDERS)
}
