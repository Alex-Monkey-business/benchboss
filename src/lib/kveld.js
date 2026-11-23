// Treningskamper samme kveld mot samme klubb hører sammen: tre lag møter
// Store Bergan på onsdag. Ingen egen tabell: kampene finner hverandre på
// dato og motstanderklubb, så kamper som alt ligger inne blir med uten at
// noe flyttes.
import { opponentOf, teamColorsForMatch, teamLabel, teamSlugs } from './matchMeta'
import { clubNameFromTeam } from './klubblogo'
import { registerReset } from '../stores/dataReset'

// Det vi alt vet om kampene samme kveld, så et bytte mellom dem tegner banen
// med én gang i stedet for å laste: oppstillingen per kamp (null = ingen
// lagret), og hvilke sesonger frafallet er hentet for.
export const kveldLager = { sesjoner: new Map(), fravaer: new Set() }
registerReset(() => { kveldLager.sesjoner.clear(); kveldLager.fravaer.clear() })

const klubb = m => clubNameFromTeam(opponentOf(m)).toLowerCase().trim()
const tid = m => (m.match_time || '').slice(0, 5) || '99:99'

// Lagnavnet vårt i kampen: «A», «B». Tom streng når laget ikke kjennes igjen.
export function lagIKamp(m) {
  return teamLabel(teamColorsForMatch(m)[0]) || ''
}

// Lagets plass i rekka (A, B, C), så kampene står i samme rekkefølge som lagene.
function plass(m) {
  const i = teamSlugs(m.season_id).indexOf(teamColorsForMatch(m)[0])
  return i < 0 ? 99 : i
}

// Alle treningskampene denne kvelden, kampen selv medregnet, i rekkefølge:
// klokkeslett først, så lagenes rekkefølge. Tom liste for alt som ikke er treningskamp.
export function kampeneSammeKveld(kamp, alle) {
  if (!kamp || kamp.kind !== 'treningskamp' || !kamp.match_date) return []
  const mot = klubb(kamp)
  if (!mot) return []
  return (alle || [])
    .filter(m => m.kind === 'treningskamp' && m.season_id === kamp.season_id &&
      m.match_date === kamp.match_date && klubb(m) === mot)
    .sort((a, b) => tid(a).localeCompare(tid(b)) || plass(a) - plass(b) || (a.id < b.id ? -1 : 1))
}
