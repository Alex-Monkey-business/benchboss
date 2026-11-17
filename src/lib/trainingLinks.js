// En trening åpner i kjøreplanen (Alex, 17. nov): luftig og oversiktlig.
// Planleggingen (/trening/dag/<id>) nås fra en knapp der.
//
// Lenken bor ett sted fordi Hjem SAMMENLIGNER mål-URL-er: «neste trening»-kortet
// skjules når ukelista allerede viser den treninga. Bygges den samme lenken to
// steder med to formuleringer, matcher de ikke, og kortet dukker opp dobbelt.
export function dagLink(dagId) {
  return `/trening/okt/${dagId}`
}

// Planleggingen av én dag.
export function planLink(dagId) {
  return `/trening/dag/${dagId}`
}
