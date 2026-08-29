import { chromium } from 'playwright'
import { execSync } from 'node:child_process'
const SVC='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const STAG='30064ef2-2a5d-4f62-aea9-3cf9a1f18726'
const KOMMENDE='e32e1ae7-11c8-48dc-96dc-d04db5c605a4', FORTID='c562864c-f913-4f35-bbc9-2af47a16d1f6'
const sql=q=>execSync(`docker exec -e PGPASSWORD=postgres supabase_db_halsen-dommerutlegg psql -U supabase_admin -h 127.0.0.1 -d postgres -qtc "${q}"`).toString().trim()
sql(`update matches set match_date = current_date + 2 where id='${KOMMENDE}'`)
sql(`update matches set match_date = current_date - 3, home_score=null, away_score=null where id='${FORTID}'`)
sql(`update matches set referee = null where cohort_id='${STAG}'`)
// «Å ordne» er skjult mens onboardingen går. Fyll lagene så seksjonen finnes.
sql(`insert into players (cohort_id, name, primary_team) values ('${STAG}','Test Gul','gul'),('${STAG}','Test Hvit','hvit') on conflict do nothing`)
console.log('utlegg på fortidskampen:', sql(`select count(*) from expenses where match_id='${FORTID}'`), '| spillere:', sql(`select count(*) from players where cohort_id='${STAG}'`))

const link=await(await fetch('http://127.0.0.1:54321/auth/v1/admin/generate_link',{method:'POST',headers:{apikey:SVC,Authorization:'Bearer '+SVC,'Content-Type':'application/json'},body:JSON.stringify({type:'magiclink',email:'alexander.samnoy@gmail.com'})})).json()
const b=await chromium.launch(); const c=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}); const p=await c.newPage()
await p.goto(link.action_link,{waitUntil:'networkidle'})
await p.evaluate(id=>localStorage.setItem('bb_active_cohort',id),STAG)
for (const flagg of [true,false]) {
  sql(`update cohorts set uses_referees = ${flagg} where id='${STAG}'`)
  await p.goto('http://localhost:5173/',{waitUntil:'networkidle'}); await p.waitForTimeout(1600)
  console.log('\n════ dommere ' + (flagg?'PÅ':'AV') + ' ════')
  console.log((await p.locator('body').innerText()).split('\n').filter(l=>l.trim()).map(l=>'  '+l.trim()).join('\n'))
}
await b.close()
sql(`update matches set match_date = '2026-04-20' where id='${KOMMENDE}'`)
sql(`update matches set match_date = '2026-04-22' where id='${FORTID}'`)
sql(`update cohorts set uses_referees = true where id='${STAG}'`)
sql(`delete from players where cohort_id='${STAG}' and name in ('Test Gul','Test Hvit')`)
console.log('\nryddet')
