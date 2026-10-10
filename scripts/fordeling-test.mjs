// Fordelingen i kjøreplanen: testcasene fra docs/handover-trening-pa-feltet.md.
//   node scripts/fordeling-test.mjs
import { lagGjenger, iGjengene, antallLag, trekkLag, baner, plasser, trenerePerBane, gjengNavn } from '../src/lib/grupper.js'
let feilet = 0
const ok = (l, c, x = '') => { if (!c) feilet++; console.log(`${c ? 'OK  ' : 'FEIL'} ${l}${x ? '  — ' + x : ''}`) }
const kull = (a, b, c) => [
  ...Array.from({ length: a }, (_, i) => ({ id: `a${i}`, niva: 'A' })),
  ...Array.from({ length: b }, (_, i) => ({ id: `b${i}`, niva: 'B' })),
  ...Array.from({ length: c }, (_, i) => ({ id: `c${i}`, niva: 'C' }))
]
const vis = g => g.map(x => `${gjengNavn(x)}:${x.spillere.length}/${x.trenere.length}`).join(' ')
const rene = g => g.every(x => !(x.nivaer.includes('A') && x.nivaer.includes('C')))

// 1. 21 spillere (6/9/6), 5 trenere: rigger tas ut før, så 4 til gjengene.
{
  const g = lagGjenger(kull(6, 9, 6), ['t1', 't2', 't3', 't4'])
  ok('21 (6/9/6), 4 trenere: tre rene gjenger', g.length === 3 && g.every(x => x.nivaer.length === 1), vis(g))
  ok('ingen flyttes ved avvik 3', g.map(x => x.spillere.length).join() === '6,9,6', vis(g))
  ok('C har to trenere, A og B én', g.find(x => x.nivaer[0] === 'C').trenere.length === 2 && g.find(x => x.nivaer[0] === 'A').trenere.length === 1, vis(g))
}
// 2. A og C aldri sammen.
{
  const g = lagGjenger(kull(7, 0, 5), ['t1', 't2', 't3'])
  ok('7 A, 0 B, 5 C: A og C aldri sammen', rene(g), vis(g))
  ok('ujevnt godtas heller enn blanding', g.length === 2, vis(g))
  const g2 = lagGjenger(kull(10, 1, 3), ['t1', 't2', 't3', 't4'])
  ok('10/1/3: balansering flytter aldri A inn hos C', rene(g2), vis(g2))
}
// 3. Y med 5 per gruppe, 21 spillere: 4 Y-er, B deles.
{
  const g = lagGjenger(kull(6, 9, 6), ['t1', 't2', 't3', 't4'])
  const t = iGjengene({ type: 'diff', per_gruppe: 5 }, g)
  ok('Y med 5 per gruppe: B deles i to', t === 'B deles i to', t)
  ok('1v1 (2 per gruppe): par i gjengen', iGjengene({ type: 'diff', per_gruppe: 2 }, g) === 'par i gjengen')
  const f = iGjengene({ type: 'diff', per_gruppe: 10 }, g)
  ok('færre grupper: naboer slås sammen, aldri A med C', /sammen/.test(f) && !/A og C/.test(f), f)
}
// 4. 21 spillere, 4 mot 4: 4 lag på 2 baner.
{
  const sp = kull(6, 9, 6)
  const n = antallLag({ type: 'mix', per_gruppe: 5 }, 21)
  const lag = trekkLag(sp, n)
  const b = baner(lag)
  ok('4 lag', n === 4 && lag.length === 4, String(n))
  ok('størrelser 5, 5, 5, 6', lag.map(l => l.length).sort().join() === '5,5,5,6')
  ok('to baner, den skjeve samlet på én', b.length === 2 && b.filter(x => lag[x.lag[0]].length !== lag[x.lag[1]].length).length === 1)
  const nivaer = lag.map(l => ['a', 'b', 'c'].map(k => l.filter(id => id[0] === k).length))
  ok('nivåene jevnt fordelt', nivaer.every(x => x.every((v, i) => Math.abs(v - [6, 9, 6][i] / 4) <= 1)), JSON.stringify(nivaer))
  ok('trenere per bane', trenerePerBane(2, ['t1', 't2', 't3', 't4']).every(x => x.length === 2))
}
// 5. Adrian (B) kommer etter lagring.
{
  const sp = kull(6, 9, 6)
  const g = lagGjenger(sp, ['t1', 't2', 't3', 't4'])
  const lag = trekkLag(sp, 4)
  const p = plasser('B', g, lag)
  ok('Adrian går til B-gjengen', g[p.gjeng].nivaer.includes('B'))
  const b = baner(lag).find(x => x.lag.includes(p.lag))
  const andre = b.lag.find(i => i !== p.lag)
  ok('og til laget som jevner ut banen', lag[p.lag].length + 1 === lag[andre].length, `${lag[p.lag].length}+1 mot ${lag[andre].length}`)
  const pA = plasser('A', lagGjenger(kull(0, 6, 6), ['t1', 't2', 't3']), null)
  ok('A uten A-gjeng havner hos B, ikke C', lagGjenger(kull(0, 6, 6), ['t1', 't2', 't3'])[pA.gjeng].nivaer.includes('B'))
}
// Trenerne.
{
  const fem = lagGjenger(kull(6, 10, 6), ['t1', 't2', 't3', 't4', 't5'])
  ok('5 trenere til gjengene: største nivå deles i fire gjenger', fem.length === 4 && fem.filter(x => x.nivaer[0] === 'B').length === 2, vis(fem))
  ok('ingen gjeng uten trener', fem.every(x => x.trenere.length >= 1))
  const tre = lagGjenger(kull(6, 9, 6), ['t1', 't2', 't3'])
  ok('3 trenere: tre gjenger med én hver', tre.length === 3 && tre.every(x => x.trenere.length === 1), vis(tre))
  const to = lagGjenger(kull(6, 9, 6), ['t1', 't2'])
  ok('2 trenere: to gjenger, aldri A med C', to.length === 2 && rene(to), vis(to))
  const en = lagGjenger(kull(6, 9, 6), ['t1'])
  ok('1 trener: alle i én gjeng', en.length === 1, vis(en))
  const r0 = lagGjenger(kull(6, 9, 6), ['t1', 't2', 't3', 't4'], 0)
  const r1 = lagGjenger(kull(6, 9, 6), ['t1', 't2', 't3', 't4'], 1)
  ok('rotasjon: neste trening har A en annen trener', r0[0].trenere[0] !== r1[0].trenere[0])
  ok('samme frø gir samme gjenger', JSON.stringify(lagGjenger(kull(6, 9, 6), ['t1'], 0, 3)) === JSON.stringify(lagGjenger(kull(6, 9, 6), ['t1'], 0, 3)))
}
console.log(feilet ? `${feilet} feil` : 'Alt grønt')
process.exit(feilet ? 1 : 0)
