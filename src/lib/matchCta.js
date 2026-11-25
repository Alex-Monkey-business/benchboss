// Hva er neste meningsfulle handling på en kamp?
//
// Lå før som en computed inne i MatchDetailView. Da Hjem-kortet skulle få
// samme knapp, ville en kopi blitt en andre sannhet om samme kamp: kortet
// kunne si «Sett opp lag» mens kampsiden sa «Start kamp». Regelen bor derfor
// ett sted, og begge flater spør den.
//
// Knappen følger kampens TILSTAND, ikke klokka. Før byttet den tekst etter
// hvor lenge det var til avspark («Se laget», «Gjør klart til kamp», «Start
// kamp»), og tre kamper samme kveld kunne vise tre forskjellige knapper uten
// at noe var forskjellig. Ingen skjønte regelen (Alex, 25. nov). Nå:
//   i gang          → Tilbake til kampen
//   laget står      → Start kamp
//   laget mangler   → Sett opp lag
// Alle tre fører til kampoppsettet; klokka starter først der.
//
// tone: 'live' | 'start' | 'quiet'

export function minutesToKickoff(matchDate, matchTime, now = Date.now()) {
  if (!matchDate) return null
  const t = (matchTime || '').slice(0, 5)
  const time = t && t !== '00:00' ? t : '12:00'
  const d = new Date(`${matchDate}T${time}:00`)
  if (Number.isNaN(d.getTime())) return null
  return Math.round((d.getTime() - now) / 60000)
}

export function matchCta({ status, hasLineup, hasResult, kind, matchDate, matchTime, now = Date.now() }) {
  // En kamp som fortsatt går skal alltid ha veien tilbake til klokka — også
  // om noen har ført resultatet underveis.
  if (status === 'running' || status === 'paused') {
    return { label: 'Tilbake til kampen', tone: 'live', icon: 'live' }
  }
  // Ferdig kamp har INGEN vei inn i match mode. Da er kampen historie, og
  // kampsida er stedet du leser den — spilletid, scorere, referat.
  if (status === 'finished' || hasResult) return null

  // Avspark + 1,5 t har passert uten at noe ble registrert. Kampen er over
  // uansett, og en klokke som starter på null hjelper ingen.
  const mins = minutesToKickoff(matchDate, matchTime, now)
  if (mins !== null && mins < -90) return null

  // I treningskamper plasserer kampoppsettet laget selv, også når ingenting
  // er lagret. Da står laget, og knappen skal si det samme som for et lag
  // noen har satt opp.
  const lagStar = hasLineup || (kind === 'treningskamp' && hasLineup === false)
  // hasLineup undefined = vi vet ikke ennå. Da sier knappen ingenting om
  // laget: «Sett opp lag» om et lag som står klart, får treneren til å tro at
  // oppsettet er borte.
  if (hasLineup === undefined) return { label: 'Kampoppsett', tone: 'quiet', icon: 'grid' }
  return lagStar
    ? { label: 'Start kamp', tone: 'start', icon: 'play' }
    : { label: 'Sett opp lag', tone: 'start', icon: 'grid' }
}

// Er det plassert minst én spiller? lineup er { slotId: playerId, plan: [...] }.
// `plan` (bytteplanen) lagres sammen med oppstillinga, og autolagringen skriver
// { plan: [] } bare av at noen åpner oppsettet. Å telle nøkler sa da «satt» om
// en tom bane.
export function harOppstilling(lineup) {
  if (!lineup) return false
  return Object.entries(lineup).some(([k, v]) => k !== 'plan' && !!v)
}
