// Gruppene på en øvelse, ferdig fordelt.
//
// Øvelsen sier hvor mange det skal være i hver gruppe (per_gruppe), ikke hvor
// mange grupper. Y med fem i hver er fire grupper når tjue kommer og to når ti
// kommer — antallet følger oppmøtet, størrelsen følger øvelsen.
//
// Typen bestemmer regelen. diff: likt nivå i hver gruppe — kullet sorteres
// etter nivå og kuttes i biter, så A-ene havner sammen og den A-en som blir
// til overs går til de sterkeste B-ene. mix: nivåene spres — slangetrekning
// over den samme sorterte lista, så hver gruppe får sin andel av A, B og C.
//
// Innenfor hvert nivå stokkes det med et frø. Samme frø gir samme grupper, så
// gruppene står stille mens treneren blar; «Bland» er et nytt frø.

const RANG = { A: 0, B: 1, C: 2 }
// Uten nivå havner i midten. Det er det minst gale gjetningen: en ukjent
// spiller i A-gruppa eller C-gruppa er verre enn i B.
const UKJENT = 1

function frøRng(seed) {
  let a = (seed >>> 0) || 1
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function stokk(liste, rng) {
  const a = [...liste]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Antall grupper ut fra hvor mange som er der. Runder til nærmeste — men
// ingen gruppe skal bli mer enn én under størrelsen, og ingen står alene.
// Sju på 1v1-par er tre grupper (3, 2, 2), ikke fire med en til overs.
export function antallGrupper(tilStede, perGruppe) {
  if (!tilStede) return 0
  if (!perGruppe) return 1
  const minst = perGruppe === 1 ? 1 : Math.max(2, perGruppe - 1)
  let n = Math.min(tilStede, Math.max(1, Math.round(tilStede / perGruppe)))
  while (n > 1 && Math.floor(tilStede / n) < minst) n--
  return n
}

// spillere: [{ id, niva }] — bare de som er der.
// Returnerer [[id, ...], ...], sterkeste gruppe først på diff.
export function lagGrupper(spillere, antall, type, seed = 1) {
  const n = Math.max(1, Math.min(antall || 1, spillere.length))
  if (!spillere.length) return []
  const rng = frøRng(seed)
  const rang = s => (s.niva in RANG ? RANG[s.niva] : UKJENT)
  // Stokk først, sorter stabilt etter nivå: tilfeldig innenfor nivået.
  const sortert = stokk(spillere, rng).sort((a, b) => rang(a) - rang(b))
  const grupper = Array.from({ length: n }, () => [])

  if (type === 'mix') {
    // Slange: 0,1,2,2,1,0,0,1,2 … Rett frem-og-tilbake gjør at ingen gruppe
    // får alle de beste i hver runde.
    sortert.forEach((s, i) => {
      const runde = Math.floor(i / n)
      const pos = i % n
      grupper[runde % 2 ? n - 1 - pos : pos].push(s.id)
    })
    return grupper
  }

  // diff: sammenhengende biter, størrelser som skiller maks én.
  const base = Math.floor(sortert.length / n)
  const ekstra = sortert.length % n
  let i = 0
  for (let g = 0; g < n; g++) {
    const str = base + (g < ekstra ? 1 : 0)
    grupper[g] = sortert.slice(i, i + str).map(s => s.id)
    i += str
  }
  return grupper
}

// Treneren bytter to navn. Byttene ligger oppå fordelingen, så de overlever
// at noen meldes borte — er en av de to ikke der lenger, hoppes byttet over.
export function medBytter(grupper, bytter) {
  const g = grupper.map(x => [...x])
  for (const [a, b] of bytter || []) {
    const ga = g.findIndex(x => x.includes(a))
    const gb = g.findIndex(x => x.includes(b))
    if (ga < 0 || gb < 0 || ga === gb) continue
    g[ga][g[ga].indexOf(a)] = b
    g[gb][g[gb].indexOf(b)] = a
  }
  return g
}

// «Ola», og «Ola H.» når kullet har to Ola. Navnene leses høyt på banen.
export function kortnavn(spillere) {
  const fornavn = s => String(s.name || '').trim().split(/\s+/)[0] || ''
  const teller = {}
  for (const s of spillere) teller[fornavn(s)] = (teller[fornavn(s)] || 0) + 1
  const ut = {}
  for (const s of spillere) {
    const f = fornavn(s)
    if (teller[f] > 1) {
      const deler = String(s.name || '').trim().split(/\s+/)
      const etter = deler.length > 1 ? ` ${deler[deler.length - 1][0]}.` : ''
      ut[s.id] = f + etter
    } else {
      ut[s.id] = f
    }
  }
  return ut
}

// Planen for én øvelse når antallet er kjent: hvor mange grupper og hvor
// mange i hver. Null når øvelsen ikke sier noe om deling — da finner vi ikke
// på et tall.
//
// per_gruppe er øvelsens egen størrelse. Uten den holder maks_spillere
// («flest før øvelsen må deles»): 21 på en øvelse for maks 9 er tre grupper.
// For få til øvelsen (min_spillere) er en advarsel, ikke en blokk.
export function planFor(drill, n) {
  if (!drill || !n) return null
  const min = drill.min_spillere || null
  let grupper = null
  if (drill.per_gruppe) grupper = antallGrupper(n, drill.per_gruppe)
  else if (drill.maks_spillere && n > drill.maks_spillere) grupper = Math.ceil(n / drill.maks_spillere)
  const forFa = min && n < min ? min : null
  if (!grupper && !forFa) return null
  const g = grupper || 1
  const minst = Math.floor(n / g), mest = Math.ceil(n / g)
  return {
    grupper: g,
    iHver: minst === mest ? String(minst) : `${minst}–${mest}`,
    forFa
  }
}
