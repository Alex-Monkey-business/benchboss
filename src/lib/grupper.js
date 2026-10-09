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

// ── Hele økta ────────────────────────────────────────────────────────────────

function hash(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  return h >>> 0
}

// Nøkkelen til én øvelse i økta: plassering + opphav, så to like øvelser på
// samme dag får hvert sitt frø og hver sine bytter.
export function ovelseNokkel(i, drill) {
  return `${i}:${drill.exercise_id || drill.text}`
}

// Gruppene på én øvelse, ut fra hvem som er der.
// tilStede: [{ id, niva }]. inngrep: { seed, antall, bytter } fra økta.
// Null når øvelsen ikke deles (verken diff eller mix).
export function grupperFor(drill, i, tilStede, inngrep = {}) {
  if (!drill || !['diff', 'mix'].includes(drill.type) || !tilStede.length) return null
  const n = tilStede.length
  const plan = planFor(drill, n)
  const foreslatt = plan?.grupper || Math.min(n, drill.type === 'mix' ? 2 : 3)
  const antall = Math.max(1, Math.min(inngrep.antall || foreslatt, n))
  const nokkel = ovelseNokkel(i, drill)
  const fordelt = medBytter(lagGrupper(tilStede, antall, drill.type, hash(nokkel) + (inngrep.seed || 1)), inngrep.bytter)
  const nivaAv = Object.fromEntries(tilStede.map(s => [s.id, s.niva]))
  const minst = Math.floor(n / antall), mest = Math.ceil(n / antall)
  return {
    nokkel,
    foreslatt,
    antall,
    iHver: minst === mest ? String(minst) : `${minst}–${mest}`,
    grupper: fordelt.map(ids => ({ ids, niva: drill.type === 'diff' ? flertallsniva(ids, nivaAv) : null }))
  }
}

// Nivået flest i gruppa har. Uten nivå på noen: ingen bokstav.
function flertallsniva(ids, nivaAv) {
  const t = {}
  for (const id of ids) if (nivaAv[id]) t[nivaAv[id]] = (t[nivaAv[id]] || 0) + 1
  const best = Object.entries(t).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
  return best ? best[0] : null
}

// Trenerne fordelt på gruppene etter behov. C trenger to trenere, A og B én —
// de er mer selvgående. Grupper uten nivå (mix) får én hver.
//
// Plassene fylles i rekkefølge: én trener til hver gruppe, svakeste nivå
// først; så den andre treneren til C; resten fordeles fra svakest og opp. Er
// det færre trenere enn grupper, er det A som går uten.
//
// Innenfor en økt står hver trener på samme plass. Fra trening til trening
// roterer rekkefølgen (runde = antall tidligere økter), så over tid møter
// hver trener alle nivåene.
const BEHOV = { C: 2, B: 1, A: 1 }
const PRIO = { C: 0, B: 1, A: 2 }

export function fordelTrenere(grupper, trenere, runde = 0) {
  const G = grupper.length
  const ut = Array.from({ length: G }, () => [])
  if (!G || !trenere.length) return ut
  const n = trenere.length
  const rotert = trenere.map((_, k) => trenere[(k + runde) % n])
  const rekke = grupper
    .map((g, i) => ({ i, p: g.niva in PRIO ? PRIO[g.niva] : 1, behov: BEHOV[g.niva] || 1 }))
    .sort((a, b) => a.p - b.p || a.i - b.i)
  const plasser = rekke.map(g => g.i)
  for (const g of rekke) for (let k = 1; k < g.behov; k++) plasser.push(g.i)
  for (let j = 0; plasser.length < n; j++) plasser.push(rekke[j % rekke.length].i)
  rotert.forEach((t, k) => ut[plasser[k]].push(t))
  return ut
}

// Rigger: én trener som tar det praktiske mellom øvelsene og er backup. Han
// står utenfor gruppene. Forrige økts rigger er standard — men bare når dere
// er mange nok til at gruppene klarer seg uten ham (fem eller flere).
export const RIGGER_FRA = 5

// Alt utstyret økta trenger.
export function riggFor(drills) {
  const sett = new Set()
  for (const d of drills) for (const t of d.utstyr_tags || []) sett.add(t)
  return [...sett]
}

// Stasjonene som må rigges, regnet for hele kullet. Riggen gjøres før noen
// vet hvor mange som kommer, og en stasjon for mye er bedre enn en for lite.
export function stasjonerFor(drill, kull) {
  if (!drill || !['diff', 'mix'].includes(drill.type) || !kull) return 0
  return planFor(drill, kull)?.grupper || Math.min(kull, drill.type === 'mix' ? 2 : 3)
}
