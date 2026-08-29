// Spillformen: årskullet gir NFF-defaulten, banene i FIKS retter den når de
// vet bedre. Grensene er sjekket mot ekte klubber.
import { spillformFraKamper, clubSearchBody, CLUB_SEARCH_URL, parseClubSearch, teamsForAge, parseTerminliste } from '../src/lib/fiks.js'
import { formatFor, periodsFor } from '../src/lib/spillform.js'
let feil=0; const ok=(l,c,x='')=>{ if(!c) feil++; console.log(`${c?'OK  ':'FEIL'} ${l}${x?'  — '+x:''}`) }
const NAA=2026

// --- ren funksjon
ok('leser 7er av banenavnet', spillformFraKamper([{venue:'Borre KG 7er B'},{venue:'Stag KG 7er A'}])===7)
ok('flertallet vinner', spillformFraKamper([{venue:'X 7er'},{venue:'Y 7er'},{venue:'Z 5er'}])===7)
ok('sier ingenting når banen ikke gjør det', spillformFraKamper([{venue:'Bibomyra KG',division:'G13 vår avd B2'}])===null)
ok('tåler tomt', spillformFraKamper([])===null && spillformFraKamper(null)===null)

// --- NFF-tabellen
const forventet={7:3,8:5,9:5,10:7,11:7,12:9,13:9,14:11,15:11}
for (const [alder,form] of Object.entries(forventet)) {
  ok(`${alder} år → ${form}er`, formatFor(NAA-Number(alder),NAA)===form, formatFor(NAA-Number(alder),NAA)+'er')
}
ok('kamplengde følger spillformen', periodsFor(9).length===2 && periodsFor(7)[1]===30)

// --- mot ekte FIKS: defaulten og banene skal si det samme
const html=await(await fetch(CLUB_SEARCH_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:clubSearchBody('Halsen')})).text()
const klubb=parseClubSearch(html).find(c=>/Halsen/i.test(c.name))
for (const alder of [8,11,13]) {
  const lag=teamsForAge(klubb.teams,alder).filter(t=>/\bG\d/.test(t.name))[0]
  if (!lag) { console.log(`  (ingen ${alder}-årslag hos Halsen)`); continue }
  const ics=await(await fetch(`https://www.fotball.no/footballapi/Calendar/GetCalendar?teamId=${lag.fiksId}`)).text()
  const fraBanen=spillformFraKamper(parseTerminliste(ics))
  const vår=formatFor(NAA-alder,NAA)
  ok(`${alder} år: banene og tabellen er enige`, !fraBanen || fraBanen===vår, `banen sier ${fraBanen||'—'}, vi sier ${vår}`)
}
console.log(feil?`\n${feil} FEIL`:'\nAlt OK')
