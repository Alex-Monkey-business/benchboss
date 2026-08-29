// Har admin alt valgt klubben, skal treneren aldri se klubbsøket — og
// telleren skal si to steg, ikke tre.
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'
const API='http://127.0.0.1:54321', APP='http://localhost:5173'
const SVC='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const STEN='alexander.samnoy+sten@gmail.com'
const KLUBB='Ørn Horten', FIKS=496
let feil=0; const ok=(l,c,x='')=>{ if(!c) feil++; console.log(`${c?'OK  ':'FEIL'} ${l}${x?'  — '+x:''}`) }
const sql=q=>execSync(`docker exec -e PGPASSWORD=postgres supabase_db_halsen-dommerutlegg psql -U supabase_admin -h 127.0.0.1 -d postgres -qtAc "${q.replace(/"/g,'\\"')}"`).toString().trim()

// Et skall slik admin lager det NÅ: klubben ferdig koblet, ingen årgang.
const kull=sql(`select c.id from cohorts c join clubs cl on cl.id=c.club_id where cl.name like '${KLUBB}%' limit 1`)
if(!kull){ console.log('FEIL fant ikke test-kullet — kjør qa-full-flyt.mjs først'); process.exit(1) }
sql(`delete from match_coaches where match_id in (select id from matches where cohort_id='${kull}')`)
sql(`delete from matches where cohort_id='${kull}'`)
sql(`delete from players where cohort_id='${kull}'`)
sql(`delete from team_coaches where cohort_id='${kull}'`)
sql(`delete from teams where cohort_id='${kull}'`)
sql(`update cohorts set birth_year=null where id='${kull}'`)
const fiks=sql(`select coalesce(fiks_id::text,'-') from clubs where name like '${KLUBB}%'`)
if(fiks==='-') sql(`update clubs set fiks_id=${FIKS} where name like '${KLUBB}%'`)
ok('klubben er koblet før treneren logger inn', sql(`select coalesce(fiks_id::text,'-') from clubs where name like '${KLUBB}%'`)!=='-')

const l=await(await fetch(`${API}/auth/v1/admin/generate_link`,{method:'POST',headers:{apikey:SVC,Authorization:'Bearer '+SVC,'Content-Type':'application/json'},body:JSON.stringify({type:'magiclink',email:STEN})})).json()
const b=await chromium.launch(); const c=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}); const p=await c.newPage()
const sidefeil=[]; p.on('pageerror',e=>sidefeil.push(e.message))
await p.goto(l.action_link.replace('http://localhost:3000',APP),{waitUntil:'networkidle'})
await p.waitForURL(/kom-i-gang/,{timeout:20000}); await p.waitForTimeout(1000)
const t=async()=>(await p.locator('.kig__inner').innerText()).replace(/\s+/g,' ')

ok('åpner på velkomsten', /Velkommen til BenchBoss/.test(await t()))
await p.getByRole('button',{name:'Kom i gang'}).click()
await p.waitForTimeout(4000)
const tekst=await t()
ok('KLUBBSØKET HOPPES OVER', !/Hvilken klubb/.test(tekst), tekst.slice(0,60))
ok('starter på årskullet', /Hvilket årskull/.test(tekst))
ok('telleren sier to steg', /steg 1 av 2/i.test(tekst), (tekst.match(/STEG \d AV \d/i)||[''])[0])
ok('klubben står som ledetekst', new RegExp(KLUBB,'i').test(tekst))
ok('ingen Tilbake på første steg', await p.locator('.kig__tilbake').count()===0)
await p.getByRole('button',{name:'2016',exact:true}).click(); await p.waitForTimeout(300)
await p.getByRole('button',{name:'Videre'}).click(); await p.waitForTimeout(2000)
const lagTekst=await t()
ok('lag-steget er steg 2 av 2', /steg 2 av 2/i.test(lagTekst), (lagTekst.match(/STEG \d AV \d/i)||[''])[0])
ok('Tilbake finnes fortsatt', await p.locator('.kig__tilbake').count()===1)
await p.locator('.kig__tilbake').click(); await p.waitForTimeout(400)
ok('Tilbake går til årgang, ikke til klubbsøket', /Hvilket årskull/.test(await t()))
ok('og der er Tilbake borte igjen', await p.locator('.kig__tilbake').count()===0)
ok('ingen sidefeil', sidefeil.length===0, sidefeil[0]||'')
await b.close()
console.log(feil?`\n${feil} FEIL`:'\nAlt OK')
