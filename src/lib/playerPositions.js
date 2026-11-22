// Posisjoner en spiller passer i.
//
// Settes ett sted (spillersida → Rediger) og brukes til å sortere forslag i
// kampmodus og til å plassere lagene på banen. Det er ALDRI en regel: en
// spiller uten posisjoner er ikke utelukket noe sted, hen blir bare ikke
// foreslått først.
//
// 9er-posisjonene kom 21. nov 2026 (Alex): venstre og høyre back, stopper,
// venstre og høyre ving, sentral midt og spiss. `sentral` og `angrep` beholdt
// verdien sin (angrep heter Spiss nå). `forsvar` og `ving` er de gamle grove
// posisjonene: de kan ikke velges lenger, men står på spilleren til en trener
// bytter dem ut, og de passer alle plassene i sin familie.

export const POSITIONS = [
  { value: 'keeper',       label: 'Keeper',       kort: 'K',  familie: 'keeper' },
  { value: 'venstre_back', label: 'Venstre back', kort: 'VB', familie: 'forsvar' },
  { value: 'stopper',      label: 'Stopper',      kort: 'S',  familie: 'forsvar' },
  { value: 'hoyre_back',   label: 'Høyre back',   kort: 'HB', familie: 'forsvar' },
  { value: 'venstre_ving', label: 'Venstre ving', kort: 'VV', familie: 'ving' },
  { value: 'sentral',      label: 'Sentral midt', kort: 'SM', familie: 'midt' },
  { value: 'hoyre_ving',   label: 'Høyre ving',   kort: 'HV', familie: 'ving' },
  { value: 'angrep',       label: 'Spiss',        kort: 'SP', familie: 'angrep' }
]

// Gamle verdier: leses og vises, men tilbys ikke i velgeren.
export const GAMLE_POSITIONS = [
  { value: 'forsvar', label: 'Forsvar', kort: 'F', familie: 'forsvar' },
  { value: 'ving',    label: 'Ving',    kort: 'V', familie: 'ving' }
]

const ALLE = [...POSITIONS, ...GAMLE_POSITIONS]
const ORDER = ALLE.map(p => p.value)
const AV = Object.fromEntries(ALLE.map(p => [p.value, p]))

// Velgeren på spillersida står som banen: spiss øverst, keeper nederst.
export const POSITION_RADER = [
  [null, 'angrep', null],
  ['venstre_ving', 'sentral', 'hoyre_ving'],
  ['venstre_back', 'stopper', 'hoyre_back'],
  [null, 'keeper', null]
]

// Slot → posisjon, per spillform. Slot-IDene er kontrakten mot lagrede
// stints (kampmodus), så de står fast; det er bare posisjonen bak dem som
// avhenger av formasjonen. d1 er venstre back i en 9er, men en av to
// stoppere i en 7er.
const SLOTS = {
  3: { f1: 'angrep', m1: 'venstre_ving', m3: 'hoyre_ving' },
  5: { gk: 'keeper', d1: 'stopper', m1: 'venstre_ving', m3: 'hoyre_ving', f1: 'angrep' },
  7: { gk: 'keeper', d1: 'stopper', d2: 'stopper', m1: 'venstre_ving', m2: 'sentral', m3: 'hoyre_ving', f1: 'angrep' },
  9: { gk: 'keeper', d1: 'venstre_back', d2: 'stopper', d3: 'hoyre_back', m1: 'venstre_ving', m2: 'sentral', m4: 'sentral', m3: 'hoyre_ving', f1: 'angrep' },
  11: { gk: 'keeper', d1: 'venstre_back', d2: 'stopper', d3: 'stopper', d4: 'hoyre_back', m1: 'sentral', m2: 'sentral', m3: 'sentral', f1: 'venstre_ving', f2: 'angrep', f3: 'hoyre_ving' }
}

export function positionForSlot(slotId, playersOnPitch = 7) {
  if (!slotId) return null
  const kart = SLOTS[playersOnPitch] || SLOTS[7]
  if (kart[slotId]) return kart[slotId]
  if (slotId === 'gk') return 'keeper'
  if (slotId.startsWith('d')) return 'stopper'
  if (slotId.startsWith('f')) return 'angrep'
  return null
}

export function positionLabel(value) {
  return AV[value]?.label || ''
}

export function positionShort(value) {
  return AV[value]?.kort || ''
}

export function slotLabel(slotId, playersOnPitch) {
  return positionLabel(positionForSlot(slotId, playersOnPitch))
}

export function playerPositions(player) {
  return Array.isArray(player?.positions) ? player.positions : []
}

// Primærposisjonene: bare de som også står i positions. Tom = ingen
// forskjell mellom posisjonene, som før primær fantes.
export function playerPrimary(player) {
  const mine = playerPositions(player)
  return Array.isArray(player?.primary_positions) ? player.primary_positions.filter(v => mine.includes(v)) : []
}

export function isKeeper(player) {
  return playerPositions(player).includes('keeper')
}

// Rydder en liste til gyldige verdier i fast rekkefølge, så lagret data ser
// likt ut uansett hvilken rekkefølge trykkene kom i. Gamle verdier beholdes.
export function normalizePositions(list) {
  const set = new Set(Array.isArray(list) ? list : [])
  return ORDER.filter(v => set.has(v))
}

// Passer spilleren her? Eksakt posisjon, eller en gammel grov posisjon fra
// samme familie (en «forsvar» passer både back og stopper).
export function fitsPosition(player, position) {
  if (!position) return false
  const familie = AV[position]?.familie
  return playerPositions(player).some(v => v === position || (GAMLE_POSITIONS.some(g => g.value === v) && AV[v].familie === familie))
}

// Hvor godt spilleren passer en posisjon. Lavere er bedre. Brukes til å
// plassere et lag på banen (lib/oppstilling).
const NABO = {
  forsvar: ['midt'],
  midt: ['forsvar', 'ving', 'angrep'],
  ving: ['midt', 'angrep'],
  angrep: ['ving', 'midt']
}
export function positionCost(player, position) {
  const mine = playerPositions(player)
  const keeper = mine.includes('keeper')
  if (position === 'keeper') return keeper ? 0 : 50
  // En ren keeper ute på banen er siste utvei.
  if (keeper && mine.length === 1) return 40
  // Primær først. Har spilleren primære, er de andre posisjonene hans et
  // hakk bak, på linje med en gammel grov posisjon som passer.
  if (mine.includes(position)) {
    const primær = playerPrimary(player)
    return !primær.length || primær.includes(position) ? 0 : 1
  }
  if (fitsPosition(player, position)) return 1
  const familie = AV[position]?.familie
  const familier = mine.map(v => AV[v]?.familie).filter(f => f && f !== 'keeper')
  if (familier.includes(familie)) return 2
  if (familier.some(f => NABO[f]?.includes(familie))) return 4
  if (!familier.length) return 5
  return 7
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
