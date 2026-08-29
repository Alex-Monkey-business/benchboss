// Hele synken gjennom flata, på ekte Halsen-data mot ekte fotball.no:
// koble klubben → koble lagene → pare 63 kamper uten FIKS-id → vise
// differansen → oppdatere. Til slutt skal en ny sjekk si at alt stemmer.
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'
const API='http://127.0.0.1:54321', APP='http://localhost:5173'
const SVC='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
let feil=0; const ok=(l,c,x='')=>{ if(!c) feil++; console.log(`${c?'OK  ':'FEIL'} ${l}${x?'  — '+x:''}`) }
const sql=q=>execSync(`docker exec -e PGPASSWORD=postgres supabase_db_halsen-dommerutlegg psql -U supabase_admin -h 127.0.0.1 -d postgres -qtAc "${q.replace(/"/g,'\\"')}"`).toString().trim()
const KULL=sql(`select id from cohorts where name='Halsen G2015'`)

// Utgangspunkt: slik Halsen faktisk står — Excel-kamper, ingen kobling.
const før=sql(`select count(*) from matches where cohort_id='${KULL}'`)
sql(`update clubs set fiks_id=null where name='Halsen IL'`)
sql(`update teams set fiks_team_id=null, fiks_name=null where cohort_id='${KULL}'`)
sql(`update matches set fiks_match_id=null, venue=null where cohort_id='${KULL}'`)
ok('utgangspunkt: ingen kobling noe sted', sql(`select count(fiks_match_id) from matches where cohort_id='${KULL}'`)==='0', `${før} kamper`)

// To kjente kamper, én bak oss og én foran: begge settes til feil klokkeslett.
// Bare den foran skal rettes. Datoene hører til datasettet fra 2026.
const SPILT=sql(`select id from matches where cohort_id='${KULL}' and match_date='2026-05-05' and home_team like 'Halsen Gr%'`)
const FRAMOVER=sql(`select id from matches where cohort_id='${KULL}' and match_date='2026-08-31' and away_team like 'Halsen Hvit%'`)
sql(`update matches set match_time='19:00' where id='${SPILT}'`)
sql(`update matches set match_time='19:15' where id='${FRAMOVER}'`)
ok('to kamper står med feil klokkeslett', !!SPILT && !!FRAMOVER)
const idagISO=new Date().toISOString().slice(0,10)
ok('datasettet er fortsatt aktuelt', idagISO < '2026-08-31', 'i dag: '+idagISO)

const l=await(await fetch(`${API}/auth/v1/admin/generate_link`,{method:'POST',headers:{apikey:SVC,Authorization:'Bearer '+SVC,'Content-Type':'application/json'},body:JSON.stringify({type:'magiclink',email:'alexander.samnoy@gmail.com'})})).json()
const b=await chromium.launch(); const c=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}); const p=await c.newPage()
const sidefeil=[]; p.on('pageerror',e=>sidefeil.push(e.message))
await p.goto(l.action_link.replace('http://localhost:3000',APP),{waitUntil:'networkidle'})
await p.waitForFunction(()=>!location.hash.includes('access_token'),null,{timeout:20000}).catch(()=>{})
await p.waitForTimeout(1200)
await p.goto(APP+'/admin/sesong-kamper',{waitUntil:'networkidle'}); await p.waitForTimeout(1500)

const seksjon=p.locator('.px-lg', {hasText:'Terminliste fra fotball.no'}).last()
ok('seksjonen finnes', await seksjon.count()>0)
ok('ber om å koble klubben først', /Koble klubben til fotball.no/.test(await seksjon.innerText()))

await p.locator('.fiks-input').fill('Halsen')
await p.locator('.fiks-treff__rad').first().waitFor({timeout:30000})
const treff=await p.locator('.fiks-treff__rad').first().innerText()
ok('finner Halsen på fotball.no', /Halsen/i.test(treff), treff.replace(/\n/g,' · '))
await p.locator('.fiks-treff__rad').first().click()
await p.waitForTimeout(2000)
ok('klubben er koblet i basen', sql(`select coalesce(fiks_id::text,'-') from clubs where name='Halsen IL'`)!=='-', sql(`select coalesce(fiks_id::text,'-') from clubs where name='Halsen IL'`))

await p.getByRole('button',{name:'Sjekk terminlista'}).click()
await p.waitForTimeout(1000)
// Klubbsida er 745 kB og tre terminlister skal hentes. Gi den tid.
await p.getByRole('button',{name:/Oppdater \d+ kamp/}).waitFor({timeout:180000})
const res=await seksjon.innerText()
console.log('\n--- det Alex ser ---\n'+res.replace(/\n{2,}/g,'\n')+'\n')
ok('lagene ble koblet', sql(`select count(fiks_team_id) from teams where cohort_id='${KULL}'`)==='3', sql(`select count(fiks_team_id) from teams where cohort_id='${KULL}'`)+' av 3')
ok('ALLE kampene fant seg selv', sql(`select count(fiks_match_id) from matches where cohort_id='${KULL}'`)===før, sql(`select count(fiks_match_id) from matches where cohort_id='${KULL}'`)+' av '+før)
ok('viser hva som er flyttet', /flyttet/.test(res))
// «Nye» er bare med når det finnes nye kamper FRAMOVER. De to som manglet
// hos Halsen lå i februar og juni — de skal ikke tilbys.
ok('nye kamper i fortiden tilbys ikke', !/9\. feb|11\. juni/.test(res))
// Spilte kamper skal ikke stå i lista i det hele tatt.
const idag=new Date().toISOString().slice(0,10)
ok('SPILTE KAMPER ER IKKE MED', !/5\. mai|21\. mai|9\. feb|11\. juni/.test(res), (res.match(/\d+\. (mai|feb|juni|mars|april)/g)||[]).join(', ')||'ingen fortidsdatoer')
ok('kampen 31. august er med', /31\. aug/.test(res))
ok('ingenting er endret i basen ennå', sql(`select match_time::text from matches where id='${FRAMOVER}'`)==='19:15:00')

await p.getByRole('button',{name:/Oppdater \d+ kamp/}).click()
await p.waitForTimeout(4000)
ok('kampen fremover er rettet', sql(`select match_time::text from matches where id='${FRAMOVER}'`)==='18:00:00', sql(`select match_time::text from matches where id='${FRAMOVER}'`))
ok('DEN SPILTE KAMPEN STÅR URØRT', sql(`select match_time::text from matches where id='${SPILT}'`)==='19:00:00', sql(`select match_time::text from matches where id='${SPILT}'`))
ok('den spilte kampen fikk ingen bane fra FIKS', sql(`select coalesce(venue,'INGEN') from matches where id='${SPILT}'`)==='INGEN')
ok('kampen fremover fikk bane', sql(`select coalesce(venue,'INGEN') from matches where id='${FRAMOVER}'`)!=='INGEN', sql(`select coalesce(venue,'INGEN') from matches where id='${FRAMOVER}'`))
const etter=sql(`select count(*) from matches where cohort_id='${KULL}'`)
ok('gamle kamper legges ikke inn på nytt', etter===før, `${før} → ${etter}`)
ok('den spilte kampen fikk likevel en FIKS-id', sql(`select count(fiks_match_id) from matches where cohort_id='${KULL}'`)===før)

// Andre runde: nå skal det ikke være noe å gjøre
await p.getByRole('button',{name:'Sjekk terminlista'}).click()
await p.waitForTimeout(1000)
await p.locator('.fiks-lead', {hasText:'stemmer'}).waitFor({timeout:180000}).catch(()=>{})
const res2=await seksjon.innerText()
ok('andre sjekk sier at alt stemmer', /Terminlista stemmer/.test(res2), res2.split('\n').filter(Boolean).slice(0,3).join(' · '))
ok('ingen sidefeil', sidefeil.length===0, sidefeil[0]||'')
await b.close()
console.log(feil?`\n${feil} FEIL`:'\nAlt OK')
