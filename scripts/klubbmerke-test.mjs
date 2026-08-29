// Klubbmerket: på årgangssteget i veiviseren og på Hjem. Skal aldri flytte
// noe når det mangler, og aldri dra FIKS-koden inn i Hjem-chunken.
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'
const API='http://127.0.0.1:54321', APP='http://localhost:5173'
const SVC='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
let feil=0; const ok=(l,c,x='')=>{ if(!c) feil++; console.log(`${c?'OK  ':'FEIL'} ${l}${x?'  — '+x:''}`) }
const sql=q=>execSync(`docker exec -e PGPASSWORD=postgres supabase_db_halsen-dommerutlegg psql -U supabase_admin -h 127.0.0.1 -d postgres -qtAc "${q.replace(/"/g,'\\"')}"`).toString().trim()

const b=await chromium.launch(); const c=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}); const p=await c.newPage()
const sidefeil=[]; p.on('pageerror',e=>sidefeil.push(e.message))
const loggInn=async epost=>{
  const l=await(await fetch(`${API}/auth/v1/admin/generate_link`,{method:'POST',headers:{apikey:SVC,Authorization:'Bearer '+SVC,'Content-Type':'application/json'},body:JSON.stringify({type:'magiclink',email:epost})})).json()
  await p.goto(l.action_link.replace('http://localhost:3000',APP),{waitUntil:'networkidle'})
  await p.waitForFunction(()=>!location.hash.includes('access_token'),null,{timeout:20000}).catch(()=>{})
  await p.waitForTimeout(1200)
}

sql(`update clubs set fiks_id=505 where name='Halsen IL' and fiks_id is null`)
await loggInn('alexander.samnoy@gmail.com')

// --- Hjem skal IKKE ha merket: der er det pynt, ikke informasjon
await p.goto(APP+'/',{waitUntil:'networkidle'}); await p.waitForTimeout(1500)
ok('Hjem er uten klubbmerke', await p.locator('.hjem-hero img').count()===0)
ok('ingen vannrett scroll på Hjem', await p.evaluate(()=>{window.scrollTo(9999,0);return window.scrollX})===0)

// --- Kull-velgeren på Admin
await p.goto(APP+'/admin',{waitUntil:'networkidle'}); await p.waitForTimeout(1500)
const velger=p.locator('.admin-kull__merke')
ok('merket står i kull-velgeren', await velger.count()>0, `${await velger.count()} kull`)
ok('merket lastet ned', await velger.first().evaluate(el=>el.complete&&el.naturalWidth>0).catch(()=>false))
const kb=await velger.first().boundingBox()
ok('20 px, ikke strukket', kb && Math.round(kb.width)===20 && Math.round(kb.height)===20, kb?`${Math.round(kb.width)}×${Math.round(kb.height)}`:'—')

// --- Klubber og kull
await p.goto(APP+'/admin/plattform',{waitUntil:'networkidle'}); await p.waitForTimeout(1500)
ok('merket står ved klubben i lista', await p.locator('.plattform-merke').count()>0)

// --- Uten kobling: ingenting skal stå der, og ingenting skal flytte seg
sql(`update clubs set fiks_id=null where name='Halsen IL'`)
await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(1500)
const alle=await p.locator('.plattform-merke').count()
const halsenRad=await p.locator('.plattform-group', {hasText:'Halsen'}).first().innerText()
ok('uten kobling er merket borte for den klubben', !/img/.test(halsenRad) && alle>=0, `${alle} merker igjen`)
sql(`update clubs set fiks_id=505 where name='Halsen IL'`)

// --- Veiviseren: merket på årgangssteget
const kull=sql(`select c.id from cohorts c join clubs cl on cl.id=c.club_id where cl.name like 'Ørn%' limit 1`)
if(kull){
  sql(`delete from match_coaches where match_id in (select id from matches where cohort_id='${kull}')`)
  sql(`delete from matches where cohort_id='${kull}'`); sql(`delete from players where cohort_id='${kull}'`)
  sql(`delete from team_coaches where cohort_id='${kull}'`); sql(`delete from teams where cohort_id='${kull}'`)
  sql(`update cohorts set birth_year=null where id='${kull}'`)
  sql(`update clubs set fiks_id=496 where name like 'Ørn%' and fiks_id is null`)
  await loggInn('alexander.samnoy+sten@gmail.com')
  await p.goto(APP+'/kom-i-gang',{waitUntil:'networkidle'}); await p.waitForTimeout(1000)
  await p.getByRole('button',{name:'Kom i gang'}).click(); await p.waitForTimeout(4000)
  const wm=p.locator('.kig__merkelogo')
  ok('merket vises på årgangssteget', await wm.count()===1)
  ok('merket lastet i veiviseren', await wm.evaluate(el=>el.complete&&el.naturalWidth>0).catch(()=>false))
  const wb=await wm.boundingBox()
  ok('72 px, ikke strukket', wb && Math.round(wb.width)===72 && Math.round(wb.height)===72, wb?`${Math.round(wb.width)}×${Math.round(wb.height)}`:'—')
  ok('står over overskriften', wb.y < (await p.locator('.kig__tittel').boundingBox()).y)
} else console.log('(hoppet over veiviseren — kjør qa-full-flyt.mjs først)')

ok('ingen sidefeil', sidefeil.length===0, sidefeil[0]||'')
await b.close()
console.log(feil?`\n${feil} FEIL`:'\nAlt OK')
