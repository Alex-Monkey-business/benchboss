// Parring av kamper som ble lastet opp fra Excel mot ekte terminlister på
// fotball.no. Halsen G2015: 63 kamper, ingen FIKS-id, tre lag.
import { parseTerminliste, parKamper } from '../src/lib/fiks.js'
import { execSync } from 'node:child_process'
const sql=q=>execSync(`docker exec -e PGPASSWORD=postgres supabase_db_halsen-dommerutlegg psql -U supabase_admin -h 127.0.0.1 -d postgres -qtAc "${q.replace(/"/g,'\\"')}"`).toString().trim()
let feil=0; const ok=(l,c,x='')=>{ if(!c) feil++; console.log(`${c?'OK  ':'FEIL'} ${l}${x?'  — '+x:''}`) }

const LAG={ 'gronn':60181, 'hvit':14031, 'rod':166974 }
const hentet=[]
for (const [slug,id] of Object.entries(LAG)) {
  const ics=await(await fetch(`https://www.fotball.no/footballapi/Calendar/GetCalendar?teamId=${id}`)).text()
  for (const k of parseTerminliste(ics)) hentet.push({ ...k, lag: slug })
}
ok('terminlistene hentes', hentet.length>50, hentet.length+' kamper')

const lokale=sql(`select id||'§'||match_date||'§'||coalesce(match_time::text,'')||'§'||home_team||'§'||away_team||'§'||coalesce(division,'')||'§'||coalesce(round::text,'') from matches where cohort_id=(select id from cohorts where name='Halsen G2015') order by match_date`)
  .split('\n').map(r=>{ const [id,match_date,t,home_team,away_team,division,round]=r.split('§')
    return { id, match_date, match_time:t.slice(0,5), home_team, away_team, division, round } })
// Nullstiller koblingen først: testen skal måle parringen, ikke om en
// tidligere kjøring alt har gjort jobben.
sql(`update matches set fiks_match_id=null where cohort_id=(select id from cohorts where name='Halsen G2015')`)
ok('kampene i basen har ingen FIKS-id', sql(`select count(fiks_match_id) from matches where cohort_id=(select id from cohorts where name='Halsen G2015')`)==='0')

const n=s=>String(s||'').toLowerCase().replace(/ø/g,'o').replace(/å/g,'a').replace(/æ/g,'ae')
// VÅR side først. «Store Bergan grønn – Halsen Rød» ville ellers blitt Grønn
// sin kamp: motstanderen har samme fargenavn som et av våre lag.
const vårSide=x=>[x.home_team,x.away_team].find(s=>n(s).includes('halsen')) || ''
const lagAv=x=>x.lag || Object.keys(LAG).find(s=>n(vårSide(x)).includes(s)) || ''

const { par, uparede, ukjente } = parKamper(lokale, hentet, lagAv)
ok('ALLE kampene finner seg selv i terminlista', uparede.length===0, `${par.length} parret, ${uparede.length} uten treff`)
ok('ingen FIKS-kamp brukes to ganger', new Set(par.map(p=>p.fiks.fiksMatchId)).size===par.length)
ok('parene peker på samme lag', par.every(p=>{
  const l=lokale.find(x=>x.id===p.id); return lagAv(l)===p.fiks.lag
}))
// Kamper fotball.no har som basen ikke har — det er dem en synk skal tilby å legge inn.
ok('kamper som mangler i basen er få og reelle', ukjente.length<=4, ukjente.map(f=>`${f.date} ${f.homeTeam}–${f.awayTeam}`).join(' · ')||'ingen')

// Endringene selve synken finnes for
const endret=par.filter(p=>{ const l=lokale.find(x=>x.id===p.id)
  return l.match_date!==p.fiks.date || (l.match_time||'')!==(p.fiks.time||'') })
console.log(`\n  ${endret.length} kamper står med feil dato eller klokkeslett i basen:`)
endret.forEach(p=>{ const l=lokale.find(x=>x.id===p.id)
  console.log(`   ${l.home_team} – ${l.away_team}: ${l.match_date} ${l.match_time} → ${p.fiks.date} ${p.fiks.time}`) })
// Ikke en påstand: har en tidligere kjøring alt rettet klokkeslettene, er
// null endringer det riktige svaret.
console.log(`  (${endret.length} endringer akkurat nå)`)
console.log(feil?`\n${feil} FEIL`:'\nAlt OK')
