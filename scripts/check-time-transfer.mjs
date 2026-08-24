// Egenskapstest for spilletidsjustering: `npm run check:time`
//
// Testen sjekker ikke ett kjent svar, men at reglene ALLTID holder, uansett
// hvem som gir til hvem og hvor mye. Datagrunnlaget er en ekte kamp
// (Nanset–Halsen 24. august), fordi konstruerte perioder aldri er like stygge
// som virkelige. Hadde denne testen fantes 24. august, ville justeringen den
// dagen vært et tastetrykk i stedet for håndskrevet SQL.
import { planTransfer } from '../src/lib/timeTransfer.js'

const END = 3600
const ON_FIELD = 7

// Nanset–Halsen, periodene slik de sto før justering.
const RAW = [
  ['Aksel', 'field', 0, 1234], ['Cornelius', 'field', 0, 1223], ['Eilert', 'field', 0, 572],
  ['Emerik', 'field', 0, 1800], ['Julian', 'field', 0, 498], ['Lennox', 'keeper', 0, 3600],
  ['Petter', 'field', 0, 388], ['Matheo', 'field', 388, 2590], ['Mathias', 'field', 498, 881],
  ['Lavrans', 'field', 572, 2587], ['Petter', 'field', 881, 1577], ['Julian', 'field', 1223, 1800],
  ['Eilert', 'field', 1234, 1800], ['Mathias', 'field', 1577, 1800], ['Aksel', 'field', 1800, 3600],
  ['Cornelius', 'field', 1800, 2205], ['Eilert', 'field', 1800, 2197], ['Petter', 'field', 1800, 2377],
  ['Emerik', 'field', 2197, 3600], ['Julian', 'field', 2205, 2776], ['Mathias', 'field', 2377, 3600],
  ['Eilert', 'field', 2587, 3600], ['Cornelius', 'field', 2590, 3600], ['Petter', 'field', 2776, 3600]
]
const STINTS = RAW.map(([n, role, on, off], i) => ({
  id: 's' + i, match_id: 'm', player_id: n, role, position: null, on_clock: on, off_clock: off
}))
const PLAYERS = [...new Set(STINTS.map(s => s.player_id))]

function applyOps(stints, ops) {
  let out = stints.map(s => ({ ...s }))
  for (const o of ops) {
    if (o.kind === 'update') Object.assign(out.find(z => z.id === o.id), o.patch)
    if (o.kind === 'delete') out = out.filter(z => z.id !== o.id)
    if (o.kind === 'insert') out.push({ id: 'ny' + out.length, ...o.row })
  }
  return out
}

function violations(st) {
  const bad = []
  for (const t of new Set(st.flatMap(s => [s.on_clock, s.off_clock]))) {
    if (t >= END) continue
    const n = st.filter(s => s.on_clock <= t && s.off_clock > t).length
    if (n !== ON_FIELD) bad.push(`${n} på banen ved ${t}s`)
  }
  const sum = st.reduce((a, s) => a + s.off_clock - s.on_clock, 0)
  if (sum !== ON_FIELD * END) bad.push(`sum ${sum}s, ikke ${ON_FIELD * END}s`)
  for (const s of st) if (s.off_clock <= s.on_clock) bad.push(`tom periode ${s.id}`)
  for (const a of st) for (const b of st) {
    if (a !== b && a.player_id === b.player_id && a.on_clock < b.off_clock && b.on_clock < a.off_clock) {
      bad.push(`${a.player_id} står to steder samtidig`)
    }
  }
  return bad
}

const total = (st, p) => st.filter(s => s.player_id === p).reduce((a, s) => a + s.off_clock - s.on_clock, 0)

let seed = 20260824
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648

let runs = 0, fails = 0, partial = 0, impossible = 0
for (let i = 0; i < 3000; i++) {
  const from = PLAYERS[Math.floor(rnd() * PLAYERS.length)]
  const to = PLAYERS[Math.floor(rnd() * PLAYERS.length)]
  if (from === to) continue
  const seconds = 1 + Math.floor(rnd() * 1200)
  const plan = planTransfer({ stints: STINTS, fromId: from, toId: to, seconds, matchEnd: END })
  runs++
  if (plan.moved === 0) { impossible++; continue }
  if (plan.moved < seconds) partial++

  const after = applyOps(STINTS, plan.ops)
  const bad = violations(after)
  // Regnskapet: giveren mister nøyaktig det mottakeren får.
  const dFrom = total(after, from) - total(STINTS, from)
  const dTo = total(after, to) - total(STINTS, to)
  if (dFrom !== -plan.moved || dTo !== plan.moved) bad.push(`regnskap ${dFrom}/${dTo} mot ${plan.moved}`)
  // Ingen andre skal ha flyttet seg.
  for (const p of PLAYERS) {
    if (p !== from && p !== to && total(after, p) !== total(STINTS, p)) bad.push(`${p} endret seg uten å være part`)
  }
  if (bad.length) {
    fails++
    if (fails <= 3) console.error(`  ${from} → ${to}, ${seconds}s: ${bad.slice(0, 3).join('; ')}`)
  }
}

console.log(`${runs} overføringer · ${fails} feil · ${partial} delvis · ${impossible} umulig`)

// Angre må gjenopprette PERIODENE, ikke bare totalene. To ulike inndelinger kan
// gi samme spilletid, og da ville en «angre» som bare stemmer i sum ha etterlatt
// en kamp som ser rett ut i tabellen og feil i tidslinja.
const fingerprint = st =>
  st.map(s => [s.player_id, s.on_clock, s.off_clock, s.role].join(':')).sort().join('|')
const ORIGINAL = fingerprint(STINTS)

function undoOps(store, ops) {
  for (const op of [...ops].reverse()) {
    if (op.kind === 'update') Object.assign(store.find(z => z.id === op.id), op.before)
    else if (op.kind === 'insert') store.splice(store.findIndex(z => z.id === op.id), 1)
    else { const { id, ...row } = op.before; store.push({ id: 'gjen-' + id, ...row }) }
  }
}

let undone = 0, notRestored = 0
for (let i = 0; i < 2000; i++) {
  const from = PLAYERS[Math.floor(rnd() * PLAYERS.length)]
  const to = PLAYERS[Math.floor(rnd() * PLAYERS.length)]
  if (from === to) continue
  const store = STINTS.map(s => ({ ...s }))
  const plan = planTransfer({ stints: store, fromId: from, toId: to, seconds: 1 + Math.floor(rnd() * 1200), matchEnd: END })
  if (!plan.moved) continue
  // Speiler skrivingen i useMatchMode: nye rader får id først når de er lagret.
  let k = 0
  const done = plan.ops.map(op => {
    if (op.kind === 'update') { Object.assign(store.find(z => z.id === op.id), op.patch); return op }
    if (op.kind === 'delete') { store.splice(store.findIndex(z => z.id === op.id), 1); return op }
    const row = { id: `ny-${k++}`, ...op.row }
    store.push(row)
    return { ...op, id: row.id }
  })
  undoOps(store, done)
  undone++
  if (fingerprint(store) !== ORIGINAL) {
    notRestored++
    if (notRestored <= 3) console.error(`  angre ${from} → ${to} traff ikke utgangspunktet`)
  }
}
console.log(`${undone} angre-runder · ${notRestored} som ikke kom tilbake`)

if (fails || notRestored) { console.error('Spilletidsjustering BRUTT.'); process.exit(1) }
console.log('Invariantene holder: 7 på banen, 420 minutter, ingen dobbeltføring, uberørte spillere uberørt, angre er eksakt.')
