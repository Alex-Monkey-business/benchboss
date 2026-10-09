// Hver dag har sin egen side. Uka har ingen måned å ligge i, så lenken
// trenger bare dagen.
//
// Lenken bor ett sted fordi Hjem SAMMENLIGNER mål-URL-er: «neste trening»-kortet
// skjules når ukelista allerede viser den treninga. Bygges den samme lenken to
// steder med to formuleringer, matcher de ikke, og kortet dukker opp dobbelt.
export function dagLink(dagId) {
  return `/trening/dag/${dagId}`
}
