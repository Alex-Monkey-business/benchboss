// Fanger Hjem opp at kretsen har flyttet en kamp — uten at noen trykker?
// Kjøres mot ekte fotball.no med Halsen-dataene.
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'
const API='http://127.0.0.1:54321', APP='http://localhost:5173'
const SVC='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
let feil=0; const ok=(l,c,x='')=>{ if(!c) feil++; console.log(`${c?'OK  ':'FEIL'} ${l}${x?'  — '+x:''}`) }
const sql=q=>execSync(`docker exec -e PGPASSWORD=postgres supabase_db_halsen-dommerutlegg psql -U supabase_admin -h 127.0.0.1 -d postgres -qtAc "${q.replace(/"/g,'\\"')}"`).toString().trim()
const KULL=sql(`select id from cohorts where name='Halsen G2015'`)

// Utgangspunkt: alt er koblet og i synk (slik det er etter første kjøring),
// og så flytter «kretsen» en kamp som ligger foran oss.
sql(`update clubs set fiks_id=505 where name='Halsen IL'`)
const FRAMOVER=sql(`select id from matches where cohort_id='${KULL}' and match_date='2026-08-31' and away_team like 'Halsen Hvit%'`)
ok('finner en kamp som ligger foran oss', !!FRAMOVER)

const l=await(await fetch(`${API}/auth/v1/admin/generate_link`,{method:'POST',headers:{apikey:SVC,Authorization:'Bearer '+SVC,'Content-Type':'application/json'},body:JSON.stringify({type:'magiclink',email:'alexander.samnoy@gmail.com'})})).json()
const b=await chromium.launch(); const c=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}); const p=await c.newPage()
const sidefeil=[]; p.on('pageerror',e=>sidefeil.push(e.message))
await p.goto(l.action_link.replace('http://localhost:3000',APP),{waitUntil:'networkidle'})
await p.waitForFunction(()=>!location.hash.includes('access_token'),null,{timeout:20000}).catch(()=>{})
await p.waitForTimeout(1500)

// Først: få kullet i synk gjennom flata, slik Alex gjør det én gang.
await p.goto(APP+'/admin/sesong-kamper',{waitUntil:'networkidle'}); await p.waitForTimeout(1500)
await p.getByRole('button',{name:'Sjekk terminlista'}).click()
await p.locator('.fiks-handling').waitFor({timeout:180000})
const oppdater=p.getByRole('button',{name:/Oppdater \d+ kamp/})
if (await oppdater.count()) { await oppdater.click(); await p.waitForTimeout(4000) }
ok('kullet er i synk', sql(`select count(fiks_match_id) from matches where cohort_id='${KULL}'`)!=='0', sql(`select count(fiks_match_id) from matches where cohort_id='${KULL}'`)+' kamper koblet')

// Så flytter «kretsen» en kamp som ligger foran oss.
sql(`update matches set match_time='20:45' where id='${FRAMOVER}'`)
await p.evaluate(() => { try { Object.keys(localStorage).filter(k=>k.startsWith('bb_terminliste_sjekket_')).forEach(k=>localStorage.removeItem(k)) } catch {} })

// Hjem skal tegne FØR sjekken er ferdig.
await p.goto(APP+'/',{waitUntil:'domcontentloaded'})
await p.locator('.hjem-hero__greeting').waitFor({timeout:15000})
ok('Hjem tegner uten å vente på fotball.no', await p.locator('.terminliste-kort').count()===0)

await p.locator('.terminliste-kort').waitFor({timeout:90000}).catch(()=>{})
const kort=p.locator('.terminliste-kort')
ok('VARSELET KOMMER AV SEG SELV', await kort.count()===1)
const tekst=await kort.innerText().catch(()=>'')
console.log('\n--- kortet ---\n'+tekst+'\n')
ok('sier hvor mange', /1 kamp er flyttet/.test(tekst), tekst.split('\n')[0])
ok('sier hvilken kamp og når den er nå', /Halsen/.test(tekst) && /18:00/.test(tekst), tekst.split('\n')[1])
ok('ingen emoji eller ikoner i teksten', !/[\u{1F300}-\u{1FAFF}]/u.test(tekst))

await kort.click()
await p.waitForTimeout(1500)
ok('kortet fører til terminlista', p.url().includes('/admin/sesong-kamper'), p.url())

// Én gang i døgnet: ny lasting skal ikke spørre fotball.no på nytt.
const kall=[]
p.on('request', r=>{ if(r.url().includes('fotball.no')) kall.push(r.url()) })
await p.goto(APP+'/',{waitUntil:'networkidle'}); await p.waitForTimeout(6000)
ok('spør ikke fotball.no en gang til samme dag', kall.length===0, kall.length+' kall')
ok('men varselet står fortsatt', await p.locator('.terminliste-kort').count()===1)

// Tar man imot endringen, skal kortet forsvinne — og ikke komme tilbake.
await p.goto(APP+'/admin/sesong-kamper',{waitUntil:'networkidle'}); await p.waitForTimeout(1200)
await p.getByRole('button',{name:'Sjekk terminlista'}).click()
await p.getByRole('button',{name:/Oppdater \d+ kamp/}).waitFor({timeout:180000})
await p.getByRole('button',{name:/Oppdater \d+ kamp/}).click()
await p.waitForTimeout(4000)
ok('kampen er rettet', sql(`select match_time::text from matches where id='${FRAMOVER}'`)==='18:00:00', sql(`select match_time::text from matches where id='${FRAMOVER}'`))
await p.goto(APP+'/',{waitUntil:'networkidle'}); await p.waitForTimeout(4000)
ok('KORTET ER BORTE ETTER AT DET ER ORDNET', await p.locator('.terminliste-kort').count()===0)

sql(`update matches set match_time='19:15' where id='${FRAMOVER}'`)
ok('ingen sidefeil', sidefeil.length===0, sidefeil[0]||'')
await b.close()
console.log(feil?`\n${feil} FEIL`:'\nAlt OK')
