// Påminnelser for hjem-skjermen — rene funksjoner, ingen state.
//
// Rangert: dommer → utlegg → treningsplan → resultat → referat. Maks tre kort,
// og flere ærend på SAMME kamp blir ett kort. Rekkefølgen bestemmes til slutt,
// ikke av hvilken sjekk som kjører først — ellers kunne utlegg falle ut av
// taket fordi dens sjekk lå sist i fila.

import { relativeDateLabel, localISODate } from './dateLabels'
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
export function buildReminders({ matches, coachId, getCoachesForMatch, getExpenseForMatch, periods = [], today = localISODate(), excludeMatchIds = [], dismissedKeys = new Set(), primaryMatchId = null }) {
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
      tone: 'urgent',
      dismissable: false,
      // Gjelder det kampen som alt står i kortet øverst, er motstandernavnet
      // en gjentakelse 30 cm lenger ned. Gjelder det en ANNEN kamp, bærer
      // navnet informasjon og blir stående.
      title: m.id === primaryMatchId ? 'Dommer mangler' : `Dommer mangler mot ${m.away_team}`,
      action: 'Finn dommer',
      body: `${when.charAt(0).toUpperCase()}${when.slice(1)}${time && time !== '00:00' ? ` · ${time}` : ''}`,
      matchId: m.id
    })
  }

  // 2. Ingen treningsplan dekker i dag.
  //
  //    Uten denne sier startsiden ingenting når planen renner ut — den viser
  //    bare fravær av treningskort, som leses som «fri i dag» og ikke som «du
  //    har ikke planlagt noe». Perioden «Etter ferien» gikk ut 11. august uten
  //    at noe sa fra.
  const covering = periods.filter(p => p.start_date && p.end_date && p.start_date <= today && p.end_date >= today)
  // En periode som starter i morgen er ikke fravær av plan — den ER planen.
  // Uten dette maste påminnelsen videre etter at jobben var gjort.
  const upcoming = periods.filter(p => p.start_date && p.start_date > today)
  if (covering.length === 0 && upcoming.length === 0) {
    const ended = periods
      .filter(p => p.end_date && p.end_date < today)
      .sort((a, b) => b.end_date.localeCompare(a.end_date))[0]
    reminders.push({
      kind: 'no-training-plan',
      // Dempet med vilje. Dommer er PÅKREVD — uten dommer blir det ikke kamp.
      // En manglende treningsplan avlyser ingenting. To røde kort ved siden av
      // hverandre opphever hverandre, og da mister det påkrevde forspranget.
      tone: 'soft',
      dismissable: true,
      // Nøkkelen bærer utløpsdatoen, ikke bare typen. Ellers ville ett klikk
      // på «skjul» gjemt påminnelsen for alltid — også neste gang en helt ny
      // plan renner ut.
      key: `no-training-plan:${ended?.end_date || 'ingen'}`,
      // Konsekvensen først, statusen under. «Treningsplanen gikk ut forrige
      // tirsdag» er en datoopplysning; det som faktisk betyr noe er at ingen
      // vet hva som skal skje på banen neste gang.
      title: 'Ingen plan for neste trening',
      // Underlinja er neste handling, ikke historikk. Når og hvilken periode
      // som gikk ut står på Trening-fanen — her er det bare i veien.
      body: 'Sett opp ny plan',
      action: 'Sett opp ny plan',
      to: '/trening'
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
      // Rødt er reservert for noe som RYKER om du ikke rekker en frist. Uten
      // dommer blir det ikke kamp — det er den eneste av disse. Et manglende
      // resultat gjør tabellen utdatert, men ingenting går i stykker, og to
      // røde kort ved siden av hverandre opphever hverandre.
      tone: 'soft',
      dismissable: false,
      title: resultLess.length === 1
        ? `Resultat mangler mot ${opponent}`
        : `${resultLess.length} kamper mangler resultat`,
      // Underlinja er handlingen. «Spilt onsdag» er historikk: den forteller
      // hva som skjedde, ikke hva du skal gjøre — og uten resultatet er både
      // tabellen og toppscorerlista feil.
      body: resultLess.length === 1 ? 'Legg inn resultatet' : 'Legg inn resultatene',
      action: resultLess.length === 1 ? 'Legg inn resultatet' : 'Legg inn resultatene',
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
      tone: 'soft',
      dismissable: true,
      title: pendingExpense.length === 1
        ? `Utlegg ikke ført mot ${m.away_team}`
        : `${pendingExpense.length} kamper venter på utlegg`,
      // Konsekvensen er at pengene ikke kommer tilbake før det er ført.
      body: pendingExpense.length === 1 ? 'Før utlegget' : 'Før utleggene',
      action: pendingExpense.length === 1 ? 'Før utlegget' : 'Før utleggene',
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
      !(m.report || '').trim() &&
      mine(m)
    )
    .sort((a, b) => b.match_date.localeCompare(a.match_date))
  if (reportLess.length > 0) {
    const m = reportLess[0]
    const opponent = isHomeMatch(m) ? m.away_team : m.home_team
    reminders.push({
      kind: 'no-report',
      tone: 'soft',
      dismissable: true,
      title: reportLess.length === 1
        ? `Referat mangler mot ${opponent}`
        : `${reportLess.length} kamper mangler referat`,
      body: reportLess.length === 1 ? 'Skriv referatet' : 'Skriv referatene',
      action: reportLess.length === 1 ? 'Skriv referatet' : 'Skriv referatene',
      matchId: m.id
    })
  }

  // Rangeringen. Dommer først fordi kampen ikke kan spilles uten; utlegg
  // fordi det er dine egne penger. Så treningsplanen — den har en dato foran
  // seg. Resultat og referat er data som kan hentes inn senere.
  const VEKT = {
    'no-ref': 1,
    'pending-expense': 2,
    'no-training-plan': 3,
    'no-result': 4,
    'no-report': 5
  }
  const vekt = r => VEKT[r.lead || r.kind] ?? 9

  // Gjelder flere ærend samme kamp, blir de ETT kort. Ellers sto motstanderen
  // to ganger under «Å ordne» — samme gjentakelse vi fjernet for dommeren.
  // Kortet arver tittelen fra det viktigste ærendet og lister handlingene.
  const perKamp = new Map()
  const utenKamp = []
  for (const r of reminders) {
    if (!r.matchId) { utenKamp.push(r); continue }
    const liste = perKamp.get(r.matchId) || []
    liste.push(r)
    perKamp.set(r.matchId, liste)
  }

  const slaattSammen = []
  for (const [matchId, liste] of perKamp) {
    const sortert = [...liste].sort((a, b) => vekt(a) - vekt(b))
    if (sortert.length === 1) { slaattSammen.push(sortert[0]); continue }
    const forste = sortert[0]
    slaattSammen.push({
      ...forste,
      kind: 'match-todo',
      lead: forste.kind,
      body: sortert.map(r => r.action).filter(Boolean).join(' · '),
      // Er ett av ærendene påkrevd, er kortet det. Og et kort kan bare skjules
      // hvis alt det dekker kan skjules.
      tone: sortert.some(r => r.tone === 'urgent') ? 'urgent' : 'soft',
      dismissable: sortert.every(r => r.dismissable),
      key: `${matchId}:${sortert.map(r => r.kind).join('+')}`
    })
  }

  return [...slaattSammen, ...utenKamp]
    .sort((a, b) => vekt(a) - vekt(b))
    .filter(r => !dismissedKeys.has(r.key || `${r.kind}:${r.matchId}`))
    .slice(0, MAX_REMINDERS)
}
