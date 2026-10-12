// Fordelingen i kjøreplanen og Del inn: testcasene fra docs/handover-trening-pa-feltet.md.
// De to siste testcasene (Bruk som dagens grupper, Del inn uten trening) er
// flyt og ligger i grupper-test.mjs.
//   node scripts/fordeling-test.mjs
import { lagGjenger, iGjengene, antallLag, trekkLag, baner, plasser, trenerePerBane, gjengNavn, delInn } from '../src/lib/grupper.js'
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
  ok('1v1 (2 per gruppe): par i gruppa', iGjengene({ type: 'diff', per_gruppe: 2 }, g) === 'par i gruppa')
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
  ok('5 trenere til gjengene: fortsatt tre gjenger', fem.length === 3, vis(fem))
  const sju = lagGjenger(kull(6, 10, 6), ['t1', 't2', 't3', 't4', 't5', 't6', 't7'])
  ok('7 trenere: aldri flere enn tre gjenger', sju.length === 3 && sju.reduce((s, x) => s + x.trenere.length, 0) === 7, vis(sju))
  ok('ingen gjeng uten trener', fem.every(x => x.trenere.length >= 1))
  const tre = lagGjenger(kull(6, 9, 6), ['t1', 't2', 't3'])
  ok('3 trenere: tre gjenger med én hver', tre.length === 3 && tre.every(x => x.trenere.length === 1), vis(tre))
  const to = lagGjenger(kull(6, 9, 6), ['t1', 't2'])
  ok('2 trenere: fortsatt tre gjenger, A går uten', to.length === 3 && !to[0].trenere.length && to[2].trenere.length === 1, vis(to))
  const en = lagGjenger(kull(6, 9, 6), ['t1'])
  ok('1 trener: tre gjenger, treneren på C', en.length === 3 && en[2].trenere.length === 1, vis(en))
  ok('ingen trenere: tre gjenger', lagGjenger(kull(6, 9, 6), []).length === 3)
  const ned = lagGjenger(kull(6, 9, 6), ['t1', 't2'], 0, 1, 2)
  ok('− til 2: aldri A med C', ned.length === 2 && rene(ned), vis(ned))
  const r0 = lagGjenger(kull(6, 9, 6), ['t1', 't2', 't3', 't4'], 0)
  const r1 = lagGjenger(kull(6, 9, 6), ['t1', 't2', 't3', 't4'], 1)
  ok('rotasjon: neste trening har A en annen trener', r0[0].trenere[0] !== r1[0].trenere[0])
  ok('samme frø gir samme gjenger', JSON.stringify(lagGjenger(kull(6, 9, 6), ['t1'], 0, 3)) === JSON.stringify(lagGjenger(kull(6, 9, 6), ['t1'], 0, 3)))
}
// Antall lag uten per_gruppe: fra navnet, ellers fem per lag, alltid partall.
{
  ok('4v4-turnering, 21 her: fire lag', antallLag({ type: 'mix', text: '4v4-turnering' }, 21) === 4)
  ok('4v4-turnering, 24 her: seks lag', antallLag({ type: 'mix', text: '4v4-turnering' }, 24) === 6)
  ok('5v5, 21 her: fire lag', antallLag({ type: 'mix', text: '5v5' }, 21) === 4)
  ok('uten tall i navnet, 21 her: fire lag', antallLag({ type: 'mix', text: 'Vinneren står, 3 touch' }, 21) === 4)
  ok('12 her: to lag', antallLag({ type: 'mix', text: '5v5' }, 12) === 2)
  ok('3 her: to lag', antallLag({ type: 'mix', text: '5v5' }, 3) === 2)
  const g = lagGjenger(kull(6, 9, 6), ['t1', 't2', 't3', 't4'])
  ok('valgt antall: 5 grupper deler de største', iGjengene({ type: 'diff' }, g, 5) === 'B deles i to, C deles i to' || /deles i to/.test(iGjengene({ type: 'diff' }, g, 5)), iGjengene({ type: 'diff' }, g, 5))
  ok('valgt antall: 1 er alle sammen', iGjengene({ type: 'diff' }, g, 1) === 'alle sammen')
  ok('valgt antall: 3 er i gjengene', iGjengene({ type: 'diff', per_gruppe: 2 }, g, 3) === 'i gruppene')
}
// Del inn: samme motor som kjøreplanen. Testcasene i handoveren (Flyten).
{
  const sp = kull(6, 9, 6)
  const fire = ['iver', 'alex', 'trond', 'kristian']
  const d = delInn({ spillere: sp, trenere: fire })
  ok('Del inn er samme fordeling som kjøreplanen', JSON.stringify(d.enheter.map(e => e.spillere)) === JSON.stringify(lagGjenger(sp, fire).map(g => g.spillere)))
  ok('21, 4 trenere: 3 grupper 6/9/6, C har to', d.antall === 3 && d.enheter.map(e => e.spillere.length).join() === '6,9,6' && d.enheter[2].trenere.length === 2, d.enheter.map(e => `${e.navn}:${e.spillere.length}/${e.trenere.length}`).join(' '))
  ok('standard er diff på grupper', d.type === 'diff' && d.standard === 3)

  const tre = delInn({ spillere: sp, trenere: ['iver', 'alex', 'trond'] })
  ok('Kristian tas bort: 3 grupper, én trener i hver', tre.antall === 3 && tre.enheter.every(e => e.trenere.length === 1) && tre.info === 'Én trener i hver', tre.info)

  const enTr = delInn({ spillere: sp, trenere: ['iver'] })
  ok('trenerne er valgfrie: én trener gir fortsatt 3 grupper', enTr.antall === 3 && enTr.info === '2 uten trener', `${enTr.antall} · ${enTr.info}`)
  const ab = delInn({ spillere: kull(7, 7, 0), trenere: fire })
  ok('bare A og B er med: 2 grupper uansett trenere', ab.antall === 2, ab.enheter.map(e => e.navn).join(' / '))

  const ac = delInn({ spillere: kull(7, 0, 5), trenere: ['t1', 't2', 't3'] })
  ok('7 A, 0 B, 5 C i Del inn: A og C aldri sammen', ac.enheter.every(e => !(e.nivaer.includes('A') && e.nivaer.includes('C'))), ac.enheter.map(e => e.navn).join(' '))
  const to = delInn({ spillere: sp, trenere: fire, antall: 2 })
  ok('− til 2 grupper: naboer slås sammen, aldri A med C', to.antall === 2 && to.enheter.every(e => !(e.nivaer.includes('A') && e.nivaer.includes('C'))), to.enheter.map(e => e.navn).join(' / '))
  const f4 = delInn({ spillere: sp, trenere: fire, antall: 4 })
  ok('+ til 4 grupper: den største deles innenfor nivået', f4.antall === 4 && f4.enheter.every(e => e.nivaer.length === 1) && f4.enheter.filter(e => e.navn === 'B').length === 2, f4.enheter.map(e => `${e.navn}:${e.spillere.length}`).join(' '))
  ok('+ til 4 med 4 trenere: én trener i hver', f4.enheter.every(e => e.trenere.length === 1), f4.info)
  const f5 = delInn({ spillere: sp, trenere: fire, antall: 5 })
  ok('flere grupper enn trenere sier fra', f5.info === '1 uten trener', f5.info)

  const mix = delInn({ spillere: sp, trenere: ['t1', 't2', 't3'], type: 'mix' })
  ok('grupper blandet: 7/7/7 med nivåene spredt', mix.enheter.map(e => e.spillere.length).join() === '7,7,7' && mix.enheter.every(e => e.nivaer.length === 3), mix.enheter.map(e => e.navn).join(' '))

  const lag = delInn({ spillere: sp, trenere: fire, form: 'lag' })
  ok('lag: standard mix, 4 lag på 2 baner', lag.type === 'mix' && lag.antall === 4 && lag.baner.length === 2)
  ok('lag: 5/5/5/6 og vestfarger', lag.enheter.map(e => e.spillere.length).sort().join() === '5,5,5,6' && lag.enheter[0].navn === 'Gul' && lag.enheter[3].navn === 'Grønn')
  const skjev = lag.baner.find(b => b.pluss != null)
  ok('+ trener på laget med 5 på banen med 5 mot 6', skjev && lag.enheter[skjev.pluss].spillere.length === 5 && lag.baner.filter(b => b.pluss != null).length === 1)
  ok('lag: to trenere per bane', lag.baner.every(b => b.trenere.length === 2))
  ok('lag: infolinja', lag.info === '2 baner, 5–6 på hvert lag', lag.info)
  const tl = delInn({ spillere: sp, trenere: ['iver', 'alex', 'trond'], form: 'lag' })
  ok('lag med 3 trenere: én bane får én', tl.baner.map(b => b.trenere.length).sort().join() === '1,2')
  const ld = delInn({ spillere: sp, trenere: fire, form: 'lag', type: 'diff' })
  ok('lag likt nivå: like nivåer møtes, aldri A mot C', ld.baner.every(b => !b.lag.some(i => ld.enheter[i].nivaer.includes('A')) || !b.lag.some(i => ld.enheter[i].nivaer.includes('C'))), ld.enheter.map(e => e.nivaer.join('')).join(' '))
  ok('lag likt nivå: like store lag (5/5/5/6)', ld.enheter.map(e => e.spillere.length).sort().join() === '5,5,5,6', ld.enheter.map(e => e.spillere.length).join())
  ok('tre nivåer i én gruppe heter «A, B og C»', delInn({ spillere: sp, antall: 1 }).enheter[0].navn === 'A, B og C')
  ok('lag: aldri færre enn to', delInn({ spillere: sp, form: 'lag', antall: 1 }).antall === 2)
  ok('samme frø gir samme lag', JSON.stringify(delInn({ spillere: sp, form: 'lag', seed: 4 })) === JSON.stringify(delInn({ spillere: sp, form: 'lag', seed: 4 })))
  ok('nytt frø gir nye lag', JSON.stringify(delInn({ spillere: sp, form: 'lag', seed: 4 }).enheter) !== JSON.stringify(delInn({ spillere: sp, form: 'lag', seed: 5 }).enheter))
  ok('ingen her: tomt', delInn({ spillere: [] }).enheter.length === 0)
  const ujevn = delInn({ spillere: kull(3, 9, 3), trenere: fire })
  const bc = ujevn.enheter.find(e => e.nivaer.includes('C'))
  ok('blandet gruppe med C får fortsatt to trenere', bc.trenere.length === 2, ujevn.enheter.map(e => `${e.navn}:${e.trenere.length}`).join(' '))
  // Kanttilfeller: én spiller, ingen trenere, ingen nivåer, få til lag.
  const en = delInn({ spillere: [{ id: 'x', niva: 'A' }] })
  ok('én spiller: én gruppe', en.antall === 1 && en.enheter[0].spillere.length === 1)
  const uten = delInn({ spillere: sp, trenere: [] })
  ok('ingen trenere: tre grupper, ingen infolinje om trenere', uten.antall === 3 && uten.info === '')
  const ukjent = delInn({ spillere: sp.map(x => ({ id: x.id, niva: null })), trenere: fire, antall: 3 })
  ok('uten nivåer: tre jevne grupper', ukjent.enheter.map(e => e.spillere.length).sort().join() === '7,7,7', ukjent.enheter.map(e => e.spillere.length).join())
  const fa = delInn({ spillere: kull(1, 1, 1), form: 'lag' })
  ok('3 spillere: to lag på én bane', fa.antall === 2 && fa.baner.length === 1 && fa.info === '1 bane, 1–2 på hvert lag', fa.info)
  ok('antall over spillere kappes', delInn({ spillere: kull(1, 1, 0), antall: 6 }).antall === 2)
}
// Tusen tilfeldige oppmøter med kullets form (27 spillere, 9/9/9, opptil sju
// trenere). Reglene skal holde hver gang, ikke bare i testcasene.
{
  let a = 7
  const rnd = () => { a = (a * 1103515245 + 12345) % 2147483648; return a / 2147483648 }
  const alle = kull(9, 9, 9)
  const brudd = {}
  const brudd1 = (navn, info) => { brudd[navn] = brudd[navn] || info }
  for (let k = 0; k < 1000; k++) {
    const sp = alle.filter(() => rnd() > 0.3 * rnd() * 2)
    if (sp.length < 2) continue
    const tr = ['t1', 't2', 't3', 't4', 't5', 't6', 't7'].slice(0, 1 + Math.floor(rnd() * 7))
    const valgt = rnd() < 0.5 ? null : 1 + Math.floor(rnd() * 6)
    const g = delInn({ spillere: sp, trenere: tr, antall: valgt, seed: k })
    const ids = g.enheter.flatMap(e => e.spillere)
    if (ids.length !== sp.length || new Set(ids).size !== sp.length) brudd1('alle én gang (grupper)', `${sp.length} → ${ids.length}`)
    if (g.antall > 1 && g.enheter.some(e => e.nivaer.includes('A') && e.nivaer.includes('C'))) brudd1('aldri A og C', g.enheter.map(e => e.navn).join('/'))
    const nv = new Set(sp.map(x => x.niva)).size
    if (!valgt && g.antall !== Math.min(nv, sp.length)) brudd1('antallet følger nivåene, ikke trenerne', `${nv} nivåer, ${tr.length} trenere → ${g.antall}`)
    if (tr.length >= g.antall && g.enheter.some(e => !e.trenere.length)) brudd1('ingen gruppe uten trener når det er nok', `${tr.length} trenere, ${g.antall} grupper`)
    if (!valgt && g.antall > 3) brudd1('aldri flere enn tre uten valg', String(g.antall))
    if (g.enheter.some(e => !e.spillere.length)) brudd1('ingen tomme grupper', g.enheter.map(e => e.spillere.length).join())
    const tl = g.enheter.map(e => e.trenere.length)
    if (tr.length >= g.antall && Math.max(...tl) - Math.min(...tl) > 1) brudd1('aldri to trenere mer enn en annen gruppe', `${tr.length} trenere: ${tl.join('/')}`)
    const brukt = g.enheter.flatMap(e => e.trenere)
    if (new Set(brukt).size !== brukt.length) brudd1('ingen trener i to grupper', brukt.join())
    const l = delInn({ spillere: sp, trenere: tr, form: 'lag', antall: rnd() < 0.5 ? null : 2 + Math.floor(rnd() * 5), seed: k })
    const lid = l.enheter.flatMap(e => e.spillere)
    if (lid.length !== sp.length || new Set(lid).size !== sp.length) brudd1('alle én gang (lag)', `${sp.length} → ${lid.length}`)
    const str = l.enheter.map(e => e.spillere.length)
    if (Math.max(...str) - Math.min(...str) > 1) brudd1('lagene skiller maks én', str.join())
    if (l.baner.flatMap(b => b.lag).sort().join() !== l.enheter.map((_, i) => i).join()) brudd1('hvert lag på én bane', JSON.stringify(l.baner))
    for (const b of l.baner) {
      if (b.pluss != null && l.enheter[b.pluss].spillere.length !== Math.min(...b.lag.map(i => l.enheter[i].spillere.length))) brudd1('+ trener på det minste laget', JSON.stringify(b))
    }
  }
  const navn = Object.keys(brudd)
  ok('tusen tilfeldige oppmøter: alle reglene holder', !navn.length, navn.map(n => `${n}: ${brudd[n]}`).join(' | '))
}
console.log(feilet ? `${feilet} feil` : 'Alt grønt')
process.exit(feilet ? 1 : 0)
