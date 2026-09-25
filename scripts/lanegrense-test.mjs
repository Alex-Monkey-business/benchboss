// Lånegrensa (BR § 2-12) mot oppdiktede kamper og mot Halsen G15 i FIKS.
import { lanegrense, rangPerLag, erObligatorisk, nivaFraDivisjon } from '../src/lib/lanegrense.js'
import { parseTerminliste } from '../src/lib/fiks.js'
let feil=0; const ok=(l,c,x='')=>{ if(!c) feil++; console.log(`${c?'OK  ':'FEIL'} ${l}${x?'  — '+x:''}`) }

ok('Interkrets teller', erObligatorisk({division:'G15 Interkrets'}))
ok('kvalik teller', erObligatorisk({division:'G15 Kval IK/B avd 2'}))
ok('Jotron Cup teller ikke', !erObligatorisk({division:'G15 Jotron Cup A'}))
ok('uten divisjon teller ikke', !erObligatorisk({division:''}))
ok('nivå', nivaFraDivisjon('G15 Interkrets')===0 && nivaFraDivisjon('G15 høst 2.div')===2 && nivaFraDivisjon('G15 vår avd C2')===null)

const teams=[{slug:'g15-1',name:'G15-1',fiks_name:'Halsen G15-1'},{slug:'g15-2',name:'G15-2',fiks_name:'Halsen G15-2'}]
const k=(id,dato,slug,div,tid='19:30')=>({id,match_date:dato,match_time:tid,division:div,slug})
const kamper=[
  k('a1','2026-09-01','g15-1','G15 Interkrets'),
  k('b1','2026-09-03','g15-2','G15 høst 2.div'),
  k('a2','2026-09-08','g15-1','G15 Interkrets'),
  k('c1','2026-09-09','g15-1','Treningskamp'),
  k('b2','2026-09-10','g15-2','G15 høst 2.div'),
  k('a0','2026-06-10','g15-1','G15 vår del 2 avd 1'),
  k('b0','2026-08-20','g15-2','G15 høst 2.div'),
]
const tropper={ a1:['p1','p2'], a2:['p1','p2','p3','p4','p5','p6','p7'], c1:['x1'], a0:['v1'] }
const ctx={ teams, matches:kamper, alder:15, lagForKamp:m=>[m.slug],
  troppFor:m=>new Set(tropper[m.id]||[]), spillformFor:()=>11 }

const r=rangPerLag(teams,kamper,ctx.lagForKamp)
ok('G15-1 over G15-2 fra divisjonen', r['g15-1']<r['g15-2'], JSON.stringify(r))

const g=lanegrense(kamper.find(m=>m.id==='b2'),'g15-2',ctx)
ok('2. lag: grense 6 fra 11er', g?.grense===6)
ok('teller G15-1s siste obligatoriske (ikke treningskampen)', g?.fra[0]?.kamp.id==='a2' && g.spillere.size===7)
ok('1. lag henter fritt', lanegrense(kamper.find(m=>m.id==='a2'),'g15-1',ctx)===null)
ok('vårens kamp teller ikke om høsten', lanegrense(kamper.find(m=>m.id==='b0'),'g15-2',ctx)===null)
ok('treningskamp har ingen grense', lanegrense({...kamper[4],id:'t',division:'Treningskamp'},'g15-2',ctx)===null)
ok('under 13 år: ingen grense', lanegrense(kamper.find(m=>m.id==='b2'),'g15-2',{...ctx,alder:11})===null)
ok('9er: grense 5', lanegrense(kamper.find(m=>m.id==='b2'),'g15-2',{...ctx,spillformFor:()=>9})?.grense===5)
ok('ulik spillform: ingen grense', lanegrense(kamper.find(m=>m.id==='b2'),'g15-2',{...ctx,spillformFor:s=>s==='g15-1'?11:9})===null)

const likt=[k('l1','2026-09-01','gronn','G11 høst 3.div'),k('l2','2026-09-05','rod','G13 høst 3.div')]
const lc={...ctx,teams:[{slug:'gronn',name:'Grønn'},{slug:'rod',name:'Rød'}],matches:likt,troppFor:()=>new Set(['q'])}
ok('likestilte lag: grense begge veier', lanegrense(likt[1],'rod',lc)?.fra[0]?.slug==='gronn')

// Ekte data: Halsen G15-1 og G15-2 høsten 2026.
const hent=async id=>parseTerminliste(await(await fetch(`https://www.fotball.no/footballapi/Calendar/GetCalendar?teamId=${id}`)).text())
const [en,to]=await Promise.all([hent(13731),hent(41317)])
const ekte=[...en.map(m=>({division:m.division,slug:'g15-1'})),...to.map(m=>({division:m.division,slug:'g15-2'}))]
  .filter(m=>m.division&&/høst/i.test(m.division)||/Interkrets/.test(m.division))
const re=rangPerLag(teams,ekte,m=>[m.slug])
ok('FIKS: G15-1 er 1. lag høsten 2026', re['g15-1']<re['g15-2'], JSON.stringify(re))

console.log(feil?`\n${feil} feil`:'\nAlt OK'); process.exit(feil?1:0)
