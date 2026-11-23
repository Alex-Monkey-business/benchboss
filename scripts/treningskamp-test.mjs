// Treningskamper: flere kamper mot samme klubb lages i ett skjema, lagene står
// ferdig på banen, og spillere hentes inn fra hele troppen uten lånespillere.
// Blank start gir tom bane og tom tropp.
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'
const API=process.env.QA_API||'http://127.0.0.1:54321'
const APP=process.env.QA_APP||'http://localhost:5174'
const SVC='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const KULL='af104bf3-02f4-4067-a0db-bf285f5d8f39', EPOST='alexander.samnoy@gmail.com'
const KLUBB='QA Treningsklubb', BLANK='QA Blankklubb'
let feilet=0
const ok=(l,c,x='')=>{ if(!c) feilet++; console.log(`${c?'OK  ':'FEIL'} ${l}${x?'  — '+x:''}`) }
const sql=q=>execSync(`docker exec -e PGPASSWORD=postgres supabase_db_halsen-dommerutlegg psql -U postgres -Atc ${JSON.stringify(q)}`).toString().trim()
const vent=ms=>new Promise(r=>setTimeout(r,ms))
const rydd=()=>sql(`delete from matches where cohort_id='${KULL}' and (away_team in ('${KLUBB}','${BLANK}') or home_team in ('${KLUBB}','${BLANK}'))`)
rydd()

const b=await chromium.launch()
const r=await fetch(`${API}/auth/v1/admin/generate_link`,{method:'POST',headers:{apikey:SVC,Authorization:`Bearer ${SVC}`,'Content-Type':'application/json'},body:JSON.stringify({type:'magiclink',email:EPOST})})
const j=await r.json(); const tok=j.hashed_token||j.properties?.hashed_token
const c=await b.newContext({viewport:{width:390,height:844}}); const p=await c.newPage()
const sidefeil=[]; p.on('pageerror',e=>sidefeil.push(e.message))
// Klubbsøket går mot fotball.no. Testen skal ikke avhenge av nettet.
await p.route('**/SearchPage/Search',rt=>rt.fulfill({status:200,contentType:'text/html',body:''}))
await p.goto(`${APP}/auth/klar?t=${tok}&type=magiclink`)
await p.getByRole('button',{name:/Logg inn/}).click()
await p.waitForURL(u=>!/\/auth|\/login/.test(u.pathname),{timeout:20000})
await p.evaluate(k=>localStorage.setItem('bb_active_cohort',k),KULL)

const dato=new Date(Date.now()+9*864e5).toISOString().slice(0,10)
async function nyKamp(klubb,{antall=1,blank=false}={}){
  await p.goto(`${APP}/kamper`)
  await p.locator('button',{hasText:/^\+?\s*Kamp$/}).first().click()
  await p.locator('#nk-motstander').waitFor({timeout:15000})
  await p.locator('.ds-pill',{hasText:'Treningskamp'}).click()
  await p.locator('#nk-motstander').fill(klubb)
  await p.locator('#nk-dato').fill(dato)
  for(let i=1;i<antall;i++) await p.getByRole('button',{name:'Flere'}).click()
  if(blank) await p.locator('.ds-pill',{hasText:'Blankt'}).click()
}
const banen=()=>p.evaluate(()=>[...document.querySelectorAll('.mm__setup .marker')].map(m=>m.classList.contains('marker--empty')?'':m.querySelector('.marker__label')?.innerText.trim()))
const benk=()=>p.evaluate(()=>[...document.querySelectorAll('.mm__plan .mm__bchip:not(.mm__bchip--legg)')].map(x=>x.innerText.trim()))
const kamper=k=>sql(`select id from matches where cohort_id='${KULL}' and away_team='${k}' and kind='treningskamp' order by home_team`).split('\n').filter(Boolean)

// ── To kamper i ett skjema ───────────────────────────────────────────────────
await nyKamp(KLUBB,{antall:2})
ok('skjemaet viser én rad med klokkeslett per kamp', await p.locator('.nk__rad--kamp').count()===2)
await p.locator('#nk-tid-0').fill('18:00')
await p.locator('#nk-tid-1').fill('18:30')
await p.getByRole('button',{name:'Legg til 2 kamper'}).click()
await p.waitForURL(/\/kamp\/[^/]+\/live/,{timeout:20000})
await p.locator('.mm__setup .marker').first().waitFor({timeout:20000})
await vent(1200)
const ider=kamper(KLUBB)
ok('to treningskamper ligger i basen', ider.length===2, String(ider.length))
ok('kampene har hvert sitt lag', new Set(sql(`select home_team from matches where id in ('${ider.join("','")}')`).split('\n')).size===2)
ok('kampvelgeren viser begge kampene', await p.locator('.mm__kveld .ds-pill').count()===2)
ok('bunnmenyen er borte i oppsettet, banen har plassen', await p.locator('.bottom-nav').count()===0 || !(await p.locator('.bottom-nav').isVisible()))
const start=await banen()
ok('laget står ferdig plassert', start.filter(Boolean).length>0, start.filter(Boolean).length+' på banen')
const M=p.url().match(/kamp\/([^/]+)\/live/)[1]
ok('ingenting er lagret før noen endrer noe', sql(`select count(*) from match_sessions where match_id='${M}'`)==='0')

// ── Legg til fra hele troppen ───────────────────────────────────────────────
const forBenk=(await benk()).length
await p.locator('.mm__bchip--legg').click()
await p.locator('.lt__rad').first().waitFor()
ok('lista har søk', await p.locator('.lt__sok').count()===1)
const forste=p.locator('.lt__rad').first()
const navn=(await forste.locator('.lt__navn').innerText()).trim()
await p.locator('.lt__sok').fill('zzzqqq'); await vent(150)
ok('søk uten treff sier det', /Ingen treff/.test(await p.locator('.lt').innerText()))
await p.locator('.lt__sok').fill(navn.slice(0,3)); await vent(150)
ok('søk finner spilleren', await p.locator('.lt__rad',{hasText:navn}).count()>=1)
await p.locator('.lt__rad',{hasText:navn}).first().click(); await vent(900)
ok('spilleren havner på benken', (await benk()).length===forBenk+1, (await benk()).join(','))
const inn=()=>Number(sql(`select count(*) from match_players where match_id='${M}'`))
const ute=()=>Number(sql(`select count(*) from match_absences where match_id='${M}'`))
ok('spilleren er med i kampen i basen', inn()===1 && ute()===0, `inn ${inn()} ute ${ute()}`)

// Ta ut igjen: benk + «Ta ut av kampen».
const chip=p.locator('.mm__plan .mm__bchip:not(.mm__bchip--legg)',{hasText:navn.split(' ')[0]}).first()
await chip.click(); await vent(200)
await p.getByRole('button',{name:'Ta ut av kampen'}).click(); await vent(900)
ok('spilleren er ute av kampen igjen', (await benk()).length===forBenk && inn()===0, `benk ${(await benk()).length} inn ${inn()}`)

// ── Tøm banen ────────────────────────────────────────────────────────────────
await p.getByRole('button',{name:'Tøm banen'}).click(); await vent(1500)
ok('banen er tom', (await banen()).every(x=>!x))
ok('tom bane er lagret', sql(`select (lineup - 'plan')::text from match_sessions where match_id='${M}'`)==='{}')
await p.reload(); await p.locator('.mm__setup .marker').first().waitFor({timeout:20000}); await vent(1200)
ok('tom bane står etter ny lasting, laget fylles ikke inn igjen', (await banen()).every(x=>!x))

// Tom plass + «Legg til»: spilleren går rett på plassen.
await p.locator('.mm__setup .marker').nth(0).click(); await vent(200)
await p.locator('.mm__bchip--legg').click(); await p.locator('.lt__rad').first().waitFor()
ok('lista har tittel etter plassen', !/Legg til i troppen/.test(await p.locator('[role=dialog]').innerText()))
const valgt=(await p.locator('.lt__rad').first().locator('.lt__navn').innerText()).trim()
await p.locator('.lt__rad').first().click(); await vent(1500)
ok('valgt spiller står på plassen', !!(await banen())[0], valgt+' → '+(await banen())[0])
ok('plassen er lagret', sql(`select count(*) from jsonb_object_keys((select lineup - 'plan' from match_sessions where match_id='${M}'))`)==='1')

// ── Bytt kamp ────────────────────────────────────────────────────────────────
await p.locator('.mm__kveld .ds-pill').nth(1).click()
await vent(150)
ok('byttet tegner banen med én gang, uten lasting', await p.locator('.mm__loading').count()===0 && await p.locator('.mm__setup .marker').count()>0 && !p.url().includes(M))
await p.waitForURL(u=>!u.pathname.includes(M),{timeout:15000}); await p.locator('.mm__setup .marker').first().waitFor(); await vent(1200)
ok('kampvelgeren bytter kamp', ider.some(id=>id!==M && p.url().includes(id)))
ok('den andre kampen har sitt eget lag på banen', (await banen()).filter(Boolean).length>0)
// Tilbake til den første: oppstillingen står som du forlot den, også med én gang.
await p.locator('.mm__kveld .ds-pill').nth(0).click(); await vent(150)
ok('tilbake til første kamp: samme oppstilling med én gang', (await banen()).filter(Boolean).length===1 && (await banen())[0]===valgt.split(' ')[0], (await banen()).join(','))
await vent(1500)
ok('og den står etter at fersk tilstand er hentet', (await banen()).filter(Boolean).length===1, (await banen()).join(','))

// ── Blank start ──────────────────────────────────────────────────────────────
await nyKamp(BLANK,{antall:2,blank:true})
await p.getByRole('button',{name:'Legg til 2 kamper'}).click()
await p.waitForURL(/\/kamp\/[^/]+\/live/,{timeout:20000})
await p.locator('.mm__setup .marker').first().waitFor({timeout:20000}); await vent(1200)
const B=p.url().match(/kamp\/([^/]+)\/live/)[1]
ok('blank start: banen er tom', (await banen()).every(x=>!x))
ok('blank start: benken er tom', (await benk()).length===0, (await benk()).join(','))
ok('blank start: hele laget står som ikke med', Number(sql(`select count(*) from match_absences where match_id='${B}'`))>0)
await p.locator('.mm__setup .marker').nth(0).click(); await vent(600)
ok('blank start: trykk på en plass åpner lista', await p.locator('.lt__rad').count()>0)
await p.locator('.lt__rad').first().click(); await vent(1200)
ok('blank start: valgt spiller står på plassen', !!(await banen())[0])

ok('ingen feil i nettleseren', sidefeil.length===0, sidefeil.slice(0,2).join(' | '))
await b.close()
rydd()
console.log(feilet?`\n${feilet} FEIL`:'\nAlt grønt')
process.exit(feilet?1:0)
