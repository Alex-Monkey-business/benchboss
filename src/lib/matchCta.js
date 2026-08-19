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
  if (status === 'finished' || hasResult) {
    return { label: 'Se spilletid', tone: 'quiet', icon: 'bars' }
  }
  if (status === 'running' || status === 'paused') {
    return { label: 'Tilbake til kampen', tone: 'live', icon: 'live' }
  }
  const mins = minutesToKickoff(matchDate, matchTime, now)
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
