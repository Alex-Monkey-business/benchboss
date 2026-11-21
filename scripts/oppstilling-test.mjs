// Laget på banen: plasseringen og byttene i lib/oppstilling.
//   node scripts/oppstilling-test.mjs
import { plasserLag, bytt } from '../src/lib/oppstilling.js'
import { formationFor } from '../src/lib/formations.js'
import { positionForSlot } from '../src/lib/playerPositions.js'
let feilet = 0
const ok = (l, c, x = '') => { if (!c) feilet++; console.log(`${c ? 'OK  ' : 'FEIL'} ${l}${x ? '  — ' + x : ''}`) }
const F9 = formationFor(9)
const sp = (id, ...positions) => ({ id, name: id, positions })

// Et helt 9er-lag med én i hver posisjon, i tilfeldig rekkefølge.
const lag = [
  sp('Spiss1', 'angrep'), sp('Keeper', 'keeper'), sp('VB', 'venstre_back'), sp('HV', 'hoyre_ving'),
  sp('Stopper', 'stopper'), sp('SM', 'sentral'), sp('HB', 'hoyre_back'), sp('VV', 'venstre_ving'), sp('Spiss2', 'angrep'),
  sp('Benk1', 'sentral'), sp('Benk2')
]
{
  const r = plasserLag(F9, lag, {}, 9)
  const feil = F9.filter(s => {
    const p = lag.find(x => x.id === r.plasser[s.id])
    return !p.positions.includes(positionForSlot(s.id, 9))
  })
  ok('alle får sin egen posisjon', !feil.length, feil.map(s => s.id).join())
  ok('to på benken', r.benk.length === 2, r.benk.join())
  ok('keeperen i mål', r.plasser.gk === 'Keeper')
}
// Keeperen er den eneste som kan stå i mål, selv om hen også kan spille ute.
{
  const r = plasserLag(F9, [sp('A', 'keeper', 'angrep'), sp('B', 'angrep'), sp('C', 'angrep'), ...Array.from({ length: 6 }, (_, i) => sp(`x${i}`))], {}, 9)
  ok('keeper som også er spiss står i mål', r.plasser.gk === 'A', JSON.stringify(r.plasser))
}
// Gamle grove posisjoner passer familien.
{
  const r = plasserLag(F9, [sp('F1', 'forsvar'), sp('F2', 'forsvar'), sp('F3', 'forsvar'), sp('K', 'keeper'), ...Array.from({ length: 5 }, (_, i) => sp(`a${i}`, 'angrep'))], {}, 9)
  const bak = ['d1', 'd2', 'd3'].map(s => r.plasser[s]).sort().join()
  ok('«forsvar» havner i forsvar', bak === 'F1,F2,F3', bak)
}
// Færre spillere enn plasser: keeperen fylles først.
{
  const r = plasserLag(F9, [sp('A'), sp('B'), sp('K', 'keeper')], {}, 9)
  ok('tre spillere: tre plasser fylt, keeper i mål', Object.keys(r.plasser).length === 3 && r.plasser.gk === 'K', JSON.stringify(r.plasser))
}
// Låste plasser står, resten fylles rundt.
{
  const r = plasserLag(F9, lag, { gk: 'Benk2' }, 9)
  ok('treneren satte Benk2 i mål: står der', r.plasser.gk === 'Benk2')
  ok('keeperen havner på benken eller ute', r.plasser.gk !== 'Keeper')
  const borte = plasserLag(F9, lag.filter(p => p.id !== 'Benk2'), { gk: 'Benk2' }, 9)
  ok('låst spiller som ikke er på laget lenger: plassen fylles', borte.plasser.gk === 'Keeper')
}
// Bytter.
{
  const r = plasserLag(F9, lag, {}, 9)
  const etter = plasserLag(F9, lag, bytt(r.plasser, { slot: 'gk' }, { slot: 'f1' }), 9)
  ok('to på banen bytter plass', etter.plasser.gk === r.plasser.f1 && etter.plasser.f1 === r.plasser.gk)
  const inn = plasserLag(F9, lag, bytt(r.plasser, { slot: 'm2' }, { benk: 'Benk2' }), 9)
  ok('fra benken inn: tar plassen', inn.plasser.m2 === 'Benk2')
  ok('den som gikk ut, står på benken', inn.benk.includes(r.plasser.m2), inn.benk.join())
  ok('ingen andre flytter seg', F9.every(s => s.id === 'm2' || inn.plasser[s.id] === r.plasser[s.id]))
}
// Samme svar hver gang, uansett rekkefølge inn.
{
  const a = JSON.stringify(plasserLag(F9, lag, {}, 9).plasser)
  const b = JSON.stringify(plasserLag(F9, [...lag].reverse(), {}, 9).plasser)
  ok('rekkefølgen inn betyr ingenting', a === b)
}
console.log(feilet ? `${feilet} feil` : 'Alt grønt')
process.exit(feilet ? 1 : 0)
