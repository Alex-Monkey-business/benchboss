// Perioden er en måned.
//
// Ett sted avgjør hvilken måned som står for tur, hva den heter, hvilke datoer
// den spenner over og hvilken farge den får. Da kan «ny periode» være ett trykk
// uansett hvor du trykker det — ingen tittel å finne på, ingen datovelgere,
// ingen fargevalg. Alt kan endres inne i perioden etterpå.

// Måneden gir fargen, så to perioder på rad aldri blir like.
export const PERIOD_ACCENTS = ['warm', 'sage', 'cornflower', 'peach', 'sky', 'olive']

const iso = d =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const dayAfter = isoDate => {
  const d = new Date(isoDate + 'T12:00:00')
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
}

export function nextMonthPlan(lastPeriod = null, now = new Date()) {
  const today = iso(now)
  const prevEnd = lastPeriod?.end_date || null
  let start

  if (prevEnd && prevEnd >= today) {
    // Forrige periode løper fortsatt: den neste begynner dagen etter. Uten
    // dette foreslo bytteren «August» mens du sto i august — to perioder
    // oppå hverandre, og ingen av dem entydig den gjeldende.
    start = dayAfter(prevEnd)
  } else {
    let year = now.getFullYear()
    let month = now.getMonth()

    // Er det under en uke igjen av måneden, er det neste måned du planlegger.
    const lastDayThisMonth = new Date(year, month + 1, 0).getDate()
    if (lastDayThisMonth - now.getDate() < 7) {
      month += 1
      if (month > 11) { month = 0; year += 1 }
    }

    const first = new Date(year, month, 1)
    const lastOfMonth = new Date(year, month + 1, 0)

    // Sluttet forrige periode inne i denne måneden, starter vi dagen etter.
    start = first
    if (prevEnd) {
      const da = dayAfter(prevEnd)
      if (da > first && da <= lastOfMonth) start = da
    }
  }

  const last = new Date(start.getFullYear(), start.getMonth() + 1, 0)
  const navn = start.toLocaleDateString('nb-NO', { month: 'long' })
  return {
    title: navn.charAt(0).toUpperCase() + navn.slice(1),
    start_date: iso(start),
    end_date: iso(last),
    accent: PERIOD_ACCENTS[start.getMonth() % PERIOD_ACCENTS.length],
    spenn: `${start.getDate()}.–${last.getDate()}. ${navn}`
  }
}

// Siste periode du la inn — kilden «bruk forrige plan» kopierer fra.
export function latestPeriod(periods) {
  if (!periods?.length) return null
  const withStart = [...periods]
    .filter(p => p.start_date)
    .sort((a, b) => b.start_date.localeCompare(a.start_date))
  return withStart[0] || periods[periods.length - 1]
}
