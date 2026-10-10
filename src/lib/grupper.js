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

// ── Gjengene og lagene ──────────────────────────────────────────────────────
//
// Økta har to faser. Diff-øvelsene kjøres i GJENGER: nivågrupper som lages én
// gang per økt, med samme trener gjennom alle diff-øvelsene. Mix-øvelsene
// kjøres i LAG som trekkes én gang, med nivåene spredt.
//
// Fordelingen lages når planen vises og lagres på økta. Den som kommer for
// sent legges til; ingen andre flyttes. Gruppene over (grupperFor) regnes på
// nytt av oppmøtet og brukes ikke i kjøreplanen.

const NIVAER = ['A', 'B', 'C']
const nivaTil = s => (s.niva in RANG ? s.niva : 'B')
const ytterpunkter = (a, b) => (a === 'A' && b.has('C')) || (a === 'C' && b.has('A'))
const tall = n => ['null', 'én', 'to', 'tre', 'fire', 'fem', 'seks'][n] || String(n)

// Navnet på en gjeng: «A», «B», «A og B». Delte nivåer heter det samme;
// treneren skiller dem.
export function gjengNavn(g) {
  return g.nivaer.length > 1 ? g.nivaer.join(' og ') : g.nivaer[0]
}

// spillere: [{ id, niva }], trenere: [id] — riggeren er allerede tatt ut.
// runde: trenerrotasjonen fra trening til trening.
// Returnerer [{ id, nivaer, spillere: [id], trenere: [id] }], A først.
export function lagGjenger(spillere, trenere = [], runde = 0, seed = 1) {
  if (!spillere.length) return []
  const rng = frøRng(seed)
  const nivaAv = Object.fromEntries(spillere.map(s => [s.id, nivaTil(s)]))
  let gjenger = NIVAER
    .map(n => ({ nivaer: [n], spillere: stokk(spillere.filter(s => nivaTil(s) === n).map(s => s.id), rng) }))
    .filter(g => g.spillere.length)
  const k = trenere.length

  // Færre trenere enn nivåer: slå sammen naboer, aldri A med C — med mindre
  // det bare er én trener. Ingen gruppe uten trener; heller større grupper.
  while (k && gjenger.length > k) {
    let best = -1
    for (let i = 0; i < gjenger.length - 1; i++) {
      const sammen = new Set([...gjenger[i].nivaer, ...gjenger[i + 1].nivaer])
      if (sammen.has('A') && sammen.has('C') && k > 1) continue
      if (best < 0 || gjenger[i].spillere.length + gjenger[i + 1].spillere.length < gjenger[best].spillere.length + gjenger[best + 1].spillere.length) best = i
    }
    if (best < 0) break
    const [a, b] = gjenger.splice(best, 2)
    gjenger.splice(best, 0, { nivaer: [...new Set([...a.nivaer, ...b.nivaer])], spillere: [...a.spillere, ...b.spillere] })
  }

  // Aldri flere enn tre gjenger, ett per nivå. Ekstra trenere går inn i
  // gjengene (fordelTrenere). Trenger en øvelse mindre grupper, som Y, deles
  // det inne i gjengen (iGjengene).

  // Avviket mellom største og minste gjeng kan være tre. Er det mer, flyttes
  // én spiller om gangen til en nabogjeng — aldri A inn hos C eller omvendt.
  for (let vakt = 0; vakt < 60; vakt++) {
    const str = gjenger.map(g => g.spillere.length)
    if (Math.max(...str) - Math.min(...str) <= 3) break
    const fra = str.indexOf(Math.max(...str))
    const naboer = [fra - 1, fra + 1].filter(j => j >= 0 && j < gjenger.length && str[j] < str[fra] - 1)
    let flyttet = false
    for (const til of naboer.sort((a, b) => str[a] - str[b])) {
      const mal = new Set(gjenger[til].spillere.map(id => nivaAv[id]))
      // Den som står nærmest nabonivået: sist i lista mot C, først mot A.
      const kandidater = til > fra ? [...gjenger[fra].spillere].reverse() : gjenger[fra].spillere
      const id = kandidater.find(x => !ytterpunkter(nivaAv[x], mal))
      if (!id) continue
      gjenger[fra].spillere = gjenger[fra].spillere.filter(x => x !== id)
      gjenger[til].spillere = til > fra ? [id, ...gjenger[til].spillere] : [...gjenger[til].spillere, id]
      flyttet = true
      break
    }
    if (!flyttet) break
  }
  for (const g of gjenger) g.nivaer = NIVAER.filter(n => g.spillere.some(id => nivaAv[id] === n))

  const fordelt = fordelTrenere(gjenger.map(g => ({ niva: g.nivaer.length === 1 ? g.nivaer[0] : null })), trenere, runde)
  const sett = {}
  return gjenger.map((g, i) => {
    const navn = g.nivaer.join('')
    sett[navn] = (sett[navn] || 0) + 1
    return { id: navn + sett[navn], nivaer: g.nivaer, spillere: g.spillere, trenere: fordelt[i] }
  })
}

// Hvordan én diff-øvelse kjøres i gjengene. Trenger øvelsen flere grupper
// enn gjenger (typisk Y), deles det inne i gjengen — B kjører to Y-er med
// samme trener. Trenger den færre, slås nabogjenger sammen, aldri A med C.
// gjenger: bare de som er her. Returnerer en kort tekst til metalinja.
// antall: treneren har valgt antall grupper på øvelsen (ellers fra øvelsen).
export function iGjengene(drill, gjenger, antall = null) {
  const g = gjenger.filter(x => x.spillere.length)
  const n = g.reduce((s, x) => s + x.spillere.length, 0)
  if (!g.length || !n) return 'i gjengene'
  if (!antall && drill.per_gruppe && drill.per_gruppe <= 2) return 'par i gjengen'
  if (antall === 1) return 'alle sammen'
  const N = antall || planFor(drill, n)?.grupper
  if (!N || N === g.length) return 'i gjengene'
  if (N > g.length) {
    const deler = g.map(() => 1)
    for (let e = 0; e < N - g.length; e++) {
      let best = 0
      for (let i = 1; i < g.length; i++) if (g[i].spillere.length / deler[i] > g[best].spillere.length / deler[best]) best = i
      deler[best]++
    }
    return g.map((x, i) => (deler[i] > 1 ? `${gjengNavn(x)} deles i ${tall(deler[i])}` : null)).filter(Boolean).join(', ')
  }
  let rest = g.map(x => ({ nivaer: [...x.nivaer], n: x.spillere.length }))
  const sammen = []
  while (rest.length > N) {
    let best = -1
    for (let i = 0; i < rest.length - 1; i++) {
      const s = new Set([...rest[i].nivaer, ...rest[i + 1].nivaer])
      if (s.has('A') && s.has('C')) continue
      if (best < 0 || rest[i].n + rest[i + 1].n < rest[best].n + rest[best + 1].n) best = i
    }
    if (best < 0) break
    const [a, b] = rest.splice(best, 2)
    const ny = { nivaer: [...new Set([...a.nivaer, ...b.nivaer])], n: a.n + b.n }
    rest.splice(best, 0, ny)
    sammen.push(ny)
  }
  // Én sammenslåing: «A og B sammen». Flere: «i to grupper: A og B, B og C».
  const slatt = rest.filter(x => sammen.includes(x))
  if (!slatt.length) return 'i gjengene'
  if (slatt.length === 1 && rest.length > 1) return `${slatt[0].nivaer.join(' og ')} sammen`
  return `i ${tall(rest.length)} ${rest.length === 1 ? 'gruppe' : 'grupper'}: ${rest.map(x => x.nivaer.join(' og ')).join(', ')}`
}

// Lagene: slangetrekning over nivåsortert liste, så hvert lag får sin andel
// av A, B og C. Navnet er vestfargen.
export const LAGFARGER = ['Gul', 'Rød', 'Blå', 'Grønn', 'Oransje', 'Hvit']
export function lagFarge(i) { return LAGFARGER[i] || `Lag ${i + 1}` }

// Antall lag på en mix-øvelse. per_gruppe vinner. Ellers lagstørrelsen fra
// navnet («4v4-turnering», «5 mot 5»), eller fem. Partall, så alle lag har
// en motstander: 21 på 4v4 er fire lag, 24 er seks.
export function lagStorrelse(drill) {
  if (drill.per_gruppe) return drill.per_gruppe
  const m = /(\d+)\s*(?:v|mot)\s*\d+/i.exec(drill.text || drill.name || '')
  return m ? Number(m[1]) : 5
}
export function antallLag(drill, n) {
  if (!drill || drill.type !== 'mix' || !n) return 0
  const lag = 2 * Math.floor(n / (2 * lagStorrelse(drill)))
  return Math.max(Math.min(2, n), Math.min(n, lag))
}

export function trekkLag(spillere, antall, seed = 1) {
  return lagGrupper(spillere, antall, 'mix', seed)
}

// To lag per bane. Lagene pares etter størrelse, så de like store møtes og
// et skjevt oppgjør havner på én bane, ikke to.
// lag: [[id]] (bare de som er her). Returnerer [{ lag: [indeks, …] }].
export function baner(lag) {
  const rekke = lag.map((l, i) => i).sort((a, b) => lag[b].length - lag[a].length || a - b)
  const ut = []
  for (let i = 0; i < rekke.length; i += 2) ut.push({ lag: rekke.slice(i, i + 2).sort((a, b) => a - b) })
  return ut
}

// Trenerne per bane, rotert fra trening til trening.
export function trenerePerBane(antallBaner, trenere, runde = 0) {
  const ut = Array.from({ length: antallBaner }, () => [])
  if (!antallBaner || !trenere.length) return ut
  trenere.forEach((t, k) => ut[(k + runde) % antallBaner].push(t))
  return ut
}

// Den som kommer for sent: inn i gjengen for sitt nivå og på laget som gjør
// banene jevnest. Ingen andre flyttes.
// gjenger og lag med bare dem som er her; returnerer { gjeng, lag } (indekser).
export function plasser(niva, gjenger, lag) {
  const n = niva in RANG ? niva : 'B'
  let gjeng = -1
  const sin = gjenger.map((g, i) => i).filter(i => gjenger[i].nivaer.includes(n))
  const lovlige = gjenger.map((g, i) => i).filter(i => !ytterpunkter(n, new Set(gjenger[i].nivaer)))
  const valg = sin.length ? sin : lovlige.length ? lovlige : gjenger.map((g, i) => i)
  for (const i of valg) if (gjeng < 0 || gjenger[i].spillere.length < gjenger[gjeng].spillere.length) gjeng = i

  let lagI = -1
  if (lag?.length) {
    const motstander = {}
    for (const b of baner(lag)) if (b.lag.length === 2) { motstander[b.lag[0]] = b.lag[1]; motstander[b.lag[1]] = b.lag[0] }
    const skjevhet = i => lag[i].length - (motstander[i] != null ? lag[motstander[i]].length : lag[i].length)
    lag.forEach((l, i) => {
      if (lagI < 0 || skjevhet(i) < skjevhet(lagI) || (skjevhet(i) === skjevhet(lagI) && l.length < lag[lagI].length)) lagI = i
    })
  }
  return { gjeng, lag: lagI }
}
