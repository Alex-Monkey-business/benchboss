// Kampmodus: to trykk gjør alt. Banen + benken er et bytte, banen + banen er
// et plassbytte, samme spiller avbryter, og et bytte kan angres i fem sekunder.
// Banen skal stå stille mellom første og andre trykk.
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'
const API=process.env.QA_API||'http://127.0.0.1:54321'
const APP=process.env.QA_APP||'http://localhost:5174'
const SVC='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const KULL='af104bf3-02f4-4067-a0db-bf285f5d8f39', EPOST='alexander.samnoy@gmail.com'
let feilet=0
const ok=(l,c,x='')=>{ if(!c) feilet++; console.log(`${c?'OK  ':'FEIL'} ${l}${x?'  — '+x:''}`) }
const sql=q=>execSync(`docker exec -e PGPASSWORD=postgres supabase_db_halsen-dommerutlegg psql -U postgres -Atc ${JSON.stringify(q)}`).toString().trim()
const vent=ms=>new Promise(r=>setTimeout(r,ms))

// En kommende seriekamp i kullet, med spillere nok til en full oppstilling.
const M=sql(`select m.id from matches m where m.cohort_id='${KULL}' and m.match_date>=current_date and m.home_team ilike '%halsen%' and m.away_team not ilike '%halsen%' order by m.match_date limit 1`)
if(!M){ console.log('Ingen kommende kamp i lokal Halsen G2015 — hopper over'); process.exit(0) }
const nullstill=()=>sql(`delete from match_stints where match_id='${M}'; delete from match_sessions where match_id='${M}'; delete from match_goals where match_id='${M}'; update matches set home_score=null, away_score=null where id='${M}'`)
nullstill()

async function telefon(b){
  const r=await fetch(`${API}/auth/v1/admin/generate_link`,{method:'POST',headers:{apikey:SVC,Authorization:`Bearer ${SVC}`,'Content-Type':'application/json'},body:JSON.stringify({type:'magiclink',email:EPOST})})
  const j=await r.json(); const tok=j.hashed_token||j.properties?.hashed_token
  const c=await b.newContext({viewport:{width:390,height:844}}); const p=await c.newPage()
  p.feil=[]; p.on('pageerror',e=>p.feil.push(e.message))
  await p.goto(`${APP}/auth/klar?t=${tok}&type=magiclink`)
  await p.getByRole('button',{name:/Logg inn/}).click()
  await p.waitForURL(u=>!/\/auth|\/login/.test(u.pathname),{timeout:20000})
  await p.evaluate(k=>localStorage.setItem('bb_active_cohort',k),KULL)
  await p.goto(`${APP}/kamp/${M}/live`)
  await p.locator('.marker').first().waitFor({timeout:20000})
  return p
}
const apne=()=>Number(sql(`select count(*) from match_stints where match_id='${M}' and off_clock is null`))
const status=()=>sql(`select status from match_sessions where match_id='${M}'`)


const b=await chromium.launch()
const p=await telefon(b)
const plasser=Number(sql(`select players_on_pitch from cohorts where id='${KULL}'`))
// Oppsettet: samme grep. Plass + benk = spilleren tar plassen.
const oppsett=()=>p.evaluate(()=>[...document.querySelectorAll('.mm__setup .marker')].map(m=>m.querySelector('.marker__label')?.innerText.trim()))
await p.locator('.mm__setup .marker').nth(1).click(); await vent(200)
ok('oppsett: valgt plass markeres', await p.locator('.mm__setup .marker--valgt').count()===1)
ok('oppsett: beskjeden spør hvem som skal spille der', /Hvem skal spille/.test(await p.locator('.mm__plan-hode').innerText()))
const forstePaBenken=(await p.locator('.mm__plan .mm__bchip').first().innerText()).trim()
await p.locator('.mm__plan .mm__bchip').first().click(); await vent(200)
ok('oppsett: plass + benk setter spilleren der', (await oppsett())[1]===forstePaBenken, (await oppsett())[1]+' / '+forstePaBenken)
// Plass + plass = de bytter.
await p.locator('.mm__setup .marker').nth(2).click(); await p.locator('.mm__plan .mm__bchip').first().click(); await vent(200)
const [x1,x2]=[(await oppsett())[1],(await oppsett())[2]]
await p.locator('.mm__setup .marker').nth(1).click(); await p.locator('.mm__setup .marker').nth(2).click(); await vent(200)
ok('oppsett: plass + plass bytter', (await oppsett())[1]===x2 && (await oppsett())[2]===x1)
// Til benken.
await p.locator('.mm__setup .marker').nth(2).click(); await p.getByRole('button',{name:'Til benken'}).click(); await vent(200)
ok('oppsett: Til benken tømmer plassen', await p.locator('.mm__setup .marker').nth(2).evaluate(e=>e.classList.contains('marker--empty')))
ok('oppsett: ingen ark', await p.locator('[role=dialog]').count()===0)
await p.getByRole('button',{name:'Fyll resten'}).click()
await p.getByRole('button',{name:'Start kamp'}).click(); await p.locator('.mm__live').waitFor(); await vent(1500)
const plassFor=n=>sql(`select position from match_stints where match_id='${M}' and player_id='${n}' and off_clock is null`)
const spillerI=slot=>sql(`select player_id from match_stints where match_id='${M}' and position='${slot}' and off_clock is null`)
const banen=()=>p.locator('.pitch--live').boundingBox()

// Trykk på en på banen: den markeres, benken sorteres, banen står stille.
const forBane=await banen()
const ut=p.locator('.marker--live:not(.marker--gk)').nth(0)
await ut.click(); await vent(300)
ok('valgt spiller markeres', await p.locator('.marker--valgt').count()===1)
ok('beskjeden spør hvem som går inn', /Hvem går inn for/.test(await p.locator('.mm__topslot').innerText()))
ok('én innbytter er anbefalt, først på benken', await p.locator('.mm__bench--bar .mm__bchip').first().evaluate(e=>e.classList.contains('mm__bchip--forslag')))
const etterBane=await banen()
ok('banen står stille mellom trykkene', Math.abs(forBane.y-etterBane.y)<1 && Math.abs(forBane.height-etterBane.height)<1, `${forBane.height} → ${etterBane.height}`)

// Samme spiller igjen avbryter.
await ut.click(); await vent(300)
ok('samme spiller igjen avbryter', await p.locator('.marker--valgt').count()===0)

// Banen + benken = bytte, så angre.
const perioderFor=sql(`select count(*) from match_stints where match_id='${M}'`)
await ut.click(); await p.locator('.mm__bench--bar .mm__bchip').first().click(); await vent(1200)
ok('banen + benken er et bytte', sql(`select count(*) from match_stints where match_id='${M}'`)===String(Number(perioderFor)+1) && apne()===plasser)
ok('angre står i linja over benken', await p.getByRole('button',{name:'Angre'}).count()===1)
await p.getByRole('button',{name:'Angre'}).click(); await vent(1500)
ok('angre setter banen tilbake', sql(`select count(*) from match_stints where match_id='${M}'`)===perioderFor && apne()===plasser)

// Banen + banen = plassbytte.
const [s1,s2]=['d1','m1']
const [a,bb]=[spillerI(s1),spillerI(s2)]
const markor=slot=>p.locator('.marker--live').nth(['gk','d1','d2','m1','m2','m3','f1'].indexOf(slot))
await p.locator('.marker--live').filter({has:p.locator('.marker__circle')}).nth(1).click()
await p.locator('.marker--live').filter({has:p.locator('.marker__circle')}).nth(3).click(); await vent(1200)
ok('banen + banen bytter plass', spillerI(s1)!==a || spillerI(s2)!==bb, `${a}/${bb}`)
ok('fortsatt én per plass', apne()===plasser && sql(`select count(distinct position) from match_stints where match_id='${M}' and off_clock is null`)===String(plasser))

// Keeper + utespiller = hanskene bytter.
const keeperFor=sql(`select player_id from match_stints where match_id='${M}' and role='keeper' and off_clock is null`)
await p.locator('.marker--live.marker--gk').click()
await p.locator('.marker--live:not(.marker--gk)').nth(2).click(); await vent(1500)
const keeperEtter=sql(`select player_id from match_stints where match_id='${M}' and role='keeper' and off_clock is null`)
ok('keeper + utespiller bytter hansker', keeperEtter && keeperEtter!==keeperFor)
ok('fortsatt én keeper og én per plass', sql(`select count(*) from match_stints where match_id='${M}' and role='keeper' and off_clock is null`)==='1' && apne()===plasser)

// Benk først virker som før.
await p.locator('.mm__bench--bar .mm__bchip').first().click()
await p.locator('.marker--live:not(.marker--gk)').nth(0).click(); await vent(1200)
ok('benken + banen er fortsatt et bytte', apne()===plasser)
ok('ingen ark åpnes på banen', await p.locator('[role=dialog]').count()===0)
ok('ingen sidefeil', !p.feil.length, p.feil.join(' | '))
await b.close()
nullstill()
console.log(feilet?`\n${feilet} FEIL`:'\nAlt grønt'); process.exit(feilet?1:0)
