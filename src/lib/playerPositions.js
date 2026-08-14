// Posisjoner en spiller passer i.
//
// Settes ett sted (Tropp → rediger spiller) og brukes til å sortere forslag i
// kampmodus. Det er ALDRI en regel: en spiller uten posisjoner er ikke utelukket
// noe sted, hen blir bare ikke foreslått først.

export const POSITIONS = [
  { value: 'keeper',   label: 'Keeper' },
  { value: 'forsvar',  label: 'Forsvar' },
  { value: 'midtbane', label: 'Midtbane' },
  { value: 'sentral',  label: 'Sentral' },
  { value: 'angrep',   label: 'Angrep' }
]

const ORDER = POSITIONS.map(p => p.value)

// Slot → posisjon.
//
// Kartet ligger her og ikke på formasjonen i viewet, fordi lagrede stints
// bærer slot-IDen: en avsluttet kamp må kunne slås opp uten at kampmodus er
// lastet. Bokstav-fallbacken under holder en framtidig 9er- eller 11er-
// formasjon i live til den får sine egne rader her.
const SLOT_POSITIONS = {
  gk: 'keeper',
  d1: 'forsvar', d2: 'forsvar',
  m1: 'midtbane', m3: 'midtbane',
  m2: 'sentral',
  f1: 'angrep'
}

export function positionForSlot(slotId) {
  if (!slotId) return null
  if (SLOT_POSITIONS[slotId]) return SLOT_POSITIONS[slotId]
  if (slotId === 'gk') return 'keeper'
  if (slotId.startsWith('d')) return 'forsvar'
  if (slotId.startsWith('m')) return 'midtbane'
  if (slotId.startsWith('f')) return 'angrep'
  return null
}

export function positionLabel(value) {
  return POSITIONS.find(p => p.value === value)?.label || ''
}

export function slotLabel(slotId) {
  return positionLabel(positionForSlot(slotId))
}

export function playerPositions(player) {
  return Array.isArray(player?.positions) ? player.positions : []
}

// Rydder en liste til gyldige verdier i fast rekkefølge, så lagret data ser
// likt ut uansett hvilken rekkefølge trykkene kom i.
export function normalizePositions(list) {
  const set = new Set(Array.isArray(list) ? list : [])
  return ORDER.filter(v => set.has(v))
}

export function fitsPosition(player, position) {
  if (!position) return false
  return playerPositions(player).includes(position)
}

// Deler en liste i «passer her» og «resten». Rekkefølgen inne i hver gruppe er
// den innkommende — kalleren har alt sortert på det som betyr noe der (navn i
// oppsett, minst spilletid live).
export function splitByFit(list, position) {
  const fit = []
  const rest = []
  for (const p of list) (fitsPosition(p, position) ? fit : rest).push(p)
  return { fit, rest }
}
