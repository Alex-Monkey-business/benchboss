// Hva er neste meningsfulle handling på en kamp?
//
// Lå før som en computed inne i MatchDetailView. Da Hjem-kortet skulle få
// samme knapp, ville en kopi blitt en andre sannhet om samme kamp: kortet
// kunne si «Sett opp lag» mens kampsiden sa «Start kamp». Regelen bor derfor
// ett sted, og begge flater spør den.
//
// Ordlyd og tyngde følger kampens livsløp — knappen skal speile hva som er
// naturlig NÅ, ikke alltid skrike «start nå».
//
// tone: 'live' | 'start' | 'prep' | 'quiet'

export function minutesToKickoff(matchDate, matchTime, now = Date.now()) {
  if (!matchDate) return null
  const t = (matchTime || '').slice(0, 5)
  const time = t && t !== '00:00' ? t : '12:00'
  const d = new Date(`${matchDate}T${time}:00`)
  if (Number.isNaN(d.getTime())) return null
  return Math.round((d.getTime() - now) / 60000)
}

export function matchCta({ status, hasLineup, hasResult, matchDate, matchTime, now = Date.now() }) {
  // En kamp som fortsatt går skal alltid ha veien tilbake til klokka — også
  // om noen har ført resultatet underveis.
  if (status === 'running' || status === 'paused') {
    return { label: 'Tilbake til kampen', tone: 'live', icon: 'live' }
  }
  // Ferdig kamp har INGEN vei inn i match mode. Da er kampen historie, og
  // kampsida er stedet du leser den — spilletid, scorere, referat. Knappen sto
  // før som «Se spilletid» og førte rett inn i live-flata, som er en helt annen
  // modus: klokke, bytter, nullstill. Null her betyr ingen knapp.
  if (status === 'finished' || hasResult) return null

  const mins = minutesToKickoff(matchDate, matchTime, now)
  // Avspark + 1,5 t har passert uten at noe ble registrert. Kampen er over
  // uansett, og en klokke som starter på null hjelper ingen.
  if (mins !== null && mins < -90) return null

  if (mins !== null && mins <= 60) {
    return { label: 'Start kamp', tone: 'start', icon: 'play' }
  }
  if (mins !== null && mins <= 180) {
    return { label: 'Gjør klart til kamp', tone: 'prep', icon: 'clock' }
  }
  return hasLineup
    ? { label: 'Se laget', tone: 'quiet', icon: 'grid' }
    : { label: 'Sett opp lag', tone: 'prep', icon: 'grid' }
}
