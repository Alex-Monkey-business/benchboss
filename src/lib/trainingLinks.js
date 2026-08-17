// Dagen er ikke en egen side lenger — den er en åpen dag i uka.
//
// Lenken bor ett sted fordi Hjem SAMMENLIGNER mål-URL-er: «neste trening»-kortet
// skjules når ukelista allerede viser den treninga. Bygges den samme lenken to
// steder med to formuleringer, matcher de ikke, og kortet dukker opp dobbelt.
export function dagLink(periodId, sessionId) {
  return `/trening/${periodId}?dag=${sessionId}`
}
