// Kampmodus med to trenere på samme kamp, hver på sin telefon.
//
// Fanget 27. sep 2026: en trener som bare ÅPNET oppsettet mens den andre
// sparket av, skrev kampen tilbake til «oppsett» med sju spillere på banen.
// Her kjøres samme kamp i to nettlesere mot lokal base.
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
const A=await telefon(b)
await A.getByRole('button',{name:'Fyll resten'}).click()
await vent(1200)
const plasser=await A.locator('.mm__setup .marker:not(.marker--empty)').count()
ok('A har satt opp hele laget', plasser>=5, `${plasser} plasser`)

const forB=sql(`select updated_at from match_sessions where match_id='${M}'`)
const B=await telefon(b)
await vent(4000)
ok('B ser As oppstilling', await B.locator('.mm__setup .marker:not(.marker--empty)').count()===plasser)
ok('å åpne oppsettet skriver ingenting', sql(`select updated_at from match_sessions where match_id='${M}'`)===forB)

await A.getByRole('button',{name:'Start kamp'}).click()
await A.locator('.mm__live').waitFor({timeout:10000})
await B.locator('.mm__live').waitFor({timeout:8000}).catch(()=>{})
ok('B følger med inn i kampen', await B.locator('.mm__live').count()===1)
await vent(3500)
ok('kampen står fortsatt i gang etter at B har vært innom', status()==='running', status())
ok('én åpen periode per plass', apne()===plasser, `${apne()} åpne`)

// Samtidige bytter på samme spiller: bare ett skal gå gjennom.
const ut=await A.locator('.marker--live:not(.marker--empty):not(.marker--gk)').first()
const utNavn=(await ut.locator('.marker__label').innerText()).split('\n')[0].trim()
await A.locator('.mm__bench--bar .mm__bchip').nth(0).click(); await B.locator('.mm__bench--bar .mm__bchip').nth(1).click()
await Promise.all([
  A.locator('.marker--live', {hasText:utNavn}).first().click(),
  B.locator('.marker--live', {hasText:utNavn}).first().click(),
])
await vent(4500)
const pos=sql(`select string_agg(position, ',' order by position) from match_stints where match_id='${M}' and off_clock is null`)
ok('samtidige bytter gir fortsatt én spiller per plass', apne()===plasser && new Set(pos.split(',')).size===plasser, pos)
ok('begge telefonene viser samme bane', JSON.stringify(await A.locator('.marker--live .marker__circle').allInnerTexts())===JSON.stringify(await B.locator('.marker--live .marker__circle').allInnerTexts()))

// To mål samtidig blir to mål.
await Promise.all([A.locator('.mm__score-btn--plus').last().click(), B.locator('.mm__score-btn--plus').last().click()])
await vent(4000)
const res=sql(`select coalesce(home_score,0)+coalesce(away_score,0) from matches where id='${M}'`)
ok('to samtidige mål blir to', res==='2', res)
ok('B viser begge målene', (await B.locator('.mm__score-num').allInnerTexts()).map(Number).reduce((a,b)=>a+b,0)===2)

// Pause på A, B ser den; samme klokke på begge.
await A.getByRole('button',{name:'Pause'}).click()
await vent(4000)
ok('B ser pausen', await B.locator('.mm__clock--paused').count()===1)
const [ka,kb]=[await A.locator('.mm__clock').innerText(), await B.locator('.mm__clock').innerText()]
ok('samme klokke på begge telefonene', ka===kb, `${ka} / ${kb}`)
ok('B kan ikke pause en kamp som står', (await B.getByRole('button',{name:'Fortsett'}).count())===1)

// Avslutt på B, A går til spilletid.
await B.getByRole('button',{name:'Avslutt'}).click()
await B.getByRole('button',{name:/Avslutt kamp|Avslutt$/}).last().click()
await vent(4500)
ok('kampen er avsluttet', status()==='finished', status())
ok('ingen åpne perioder etter slutt', apne()===0)
ok('ingen sidefeil', !A.feil.length && !B.feil.length, [...A.feil,...B.feil].join(' | '))

await b.close()
nullstill()
console.log(feilet?`\n${feilet} FEIL`:'\nAlt grønt'); process.exit(feilet?1:0)
