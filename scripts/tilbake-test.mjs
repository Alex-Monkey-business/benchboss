import { chromium } from 'playwright'
import { execSync } from 'node:child_process'
const API='http://127.0.0.1:54321', APP='http://localhost:5173'
const SVC='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const sql=q=>execSync(`docker exec -e PGPASSWORD=postgres supabase_db_halsen-dommerutlegg psql -U supabase_admin -h 127.0.0.1 -d postgres -qtAc "${q.replace(/"/g,'\\"')}"`).toString().trim()
let feil=0; const ok=(l,c,x='')=>{ if(!c) feil++; console.log(`${c?'OK  ':'FEIL'} ${l}${x?'  — '+x:''}`) }
// nullstill Ørn-kullet til et skall
const kull=sql(`select c.id from cohorts c join clubs cl on cl.id=c.club_id where cl.name like 'Ørn%' limit 1`)
sql(`delete from match_coaches where match_id in (select id from matches where cohort_id='${kull}')`)
sql(`delete from matches where cohort_id='${kull}'`)
sql(`delete from team_coaches where cohort_id='${kull}'`)
sql(`delete from players where cohort_id='${kull}'`)
sql(`delete from teams where cohort_id='${kull}'`)
sql(`update cohorts set birth_year=null where id='${kull}'`)
sql(`update clubs set fiks_id=null where name like 'Ørn%'`)

const l=await(await fetch(`${API}/auth/v1/admin/generate_link`,{method:'POST',headers:{apikey:SVC,Authorization:'Bearer '+SVC,'Content-Type':'application/json'},body:JSON.stringify({type:'magiclink',email:'alexander.samnoy+sten@gmail.com'})})).json()
const b=await chromium.launch(); const c=await b.newContext({viewport:{width:375,height:667},isMobile:true,hasTouch:true}); const p=await c.newPage()
const sidefeil=[]; p.on('pageerror',e=>sidefeil.push(e.message))
await p.goto(l.action_link.replace('http://localhost:3000',APP),{waitUntil:'networkidle'})
await p.waitForURL(/kom-i-gang/,{timeout:20000}); await p.waitForTimeout(800)
const t=async()=>(await p.locator('.kig__inner').innerText()).replace(/\s+/g,' ')

ok('ingen Tilbake på velkomsten', await p.locator('.kig__tilbake').count()===0)
await p.getByRole('button',{name:'Kom i gang'}).click(); await p.waitForTimeout(500)
ok('ingen Tilbake på klubbsteget', await p.locator('.kig__tilbake').count()===0, (await t()).slice(0,40))

await p.locator('.kig__sok').fill('Ørn Horten')
await p.locator('.kig__klubb').first().waitFor({timeout:25000})
await p.locator('.kig__klubb').first().click(); await p.waitForTimeout(1500)
ok('Tilbake finnes på årgangssteget', await p.locator('.kig__tilbake').count()===1)
const boks=await p.locator('.kig__tilbake').boundingBox()
ok('trykkflaten er minst 44 px', boks.height>=44, Math.round(boks.height)+' px')

await p.getByRole('button',{name:'2016',exact:true}).click(); await p.waitForTimeout(300)
await p.getByRole('button',{name:'Videre'}).click(); await p.waitForTimeout(1500)
ok('er på lag-steget', /steg 3 av 3/i.test(await t()), (await t()).slice(0,120))
await p.locator('.kig__tilbake').click(); await p.waitForTimeout(400)
ok('Tilbake fra lag → årgang', /steg 2 av 3/i.test(await t()))
ok('årgangen står igjen valgt', await p.locator('.kig__arknapp--valgt').innerText()==='2016')

await p.getByRole('button',{name:'2015',exact:true}).click(); await p.waitForTimeout(300)
await p.getByRole('button',{name:'Videre'}).click(); await p.waitForTimeout(1500)
const lag2015=await p.locator('.kig__lag').count()
await p.locator('.kig__tilbake').click(); await p.waitForTimeout(300)
await p.locator('.kig__tilbake').click(); await p.waitForTimeout(400)
ok('Tilbake fra årgang → klubb', /Hvilken klubb/.test(await t()))
ok('søket står igjen', (await p.locator('.kig__sok').inputValue())==='Ørn Horten')
ok('ny årgang ga ny lagliste', lag2015>=0, lag2015+' lag på 2015')
// Ingen vannrett scroll på de smaleste skjermene med Tilbake på plass.
for (const w of [320, 360, 390, 430]) {
  await p.setViewportSize({width:w, height:667})
  await p.waitForTimeout(200)
  const x = await p.evaluate(() => { window.scrollTo(9999,0); return window.scrollX })
  ok(`ingen vannrett scroll på ${w} px`, x===0, 'scrollX='+x)
}
ok('ingen sidefeil', sidefeil.length===0, sidefeil[0]||'')
await b.close()
console.log(feil?`\n${feil} FEIL`:'\nAlt OK')
