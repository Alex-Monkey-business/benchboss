// Kampmodus, liste: banen og benken side om side, sortert på hvem som står for
// tur. Bryteren huskes, ett trykk i hver kolonne er et bytte, og tallet det
// sorteres på er det store.
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
const tekster=(p,kol)=>p.locator('.mm__lkol').nth(kol).locator('.mm__lrad:not(.mm__lrad--keeper)').evaluateAll(r=>r.map(e=>({navn:e.querySelector('.mm__lnavn').innerText.trim(),stor:e.querySelector('.mm__lstor').innerText.trim(),liten:e.querySelector('.mm__lliten').innerText.trim(),tur:e.classList.contains('mm__lrad--tur')})))
const sek=t=>{const [m,s]=t.split(':').map(Number);return m*60+s}
// Hopp klokka fram: klokka er base + tid siden running_since.
const klokke=s=>sql(`update match_sessions set clock_base_seconds=${s}, running_since=now() where match_id='${M}'`)

const b=await chromium.launch()
try {
const p=await telefon(b)
await p.getByRole('button',{name:'Fyll resten'}).click()
await p.getByRole('button',{name:'Start kamp'}).click(); await p.locator('.mm__live').waitFor(); await vent(1200)
ok('banen er standard', await p.locator('.pitch--live').isVisible() && await p.locator('.mm__liste').count()===0)
ok('sorteringen vises ikke på banen', await p.getByRole('button',{name:'Totalt',exact:true}).count()===0)

klokke(300); await p.reload(); await p.locator('.mm__live').waitFor(); await vent(800)
await p.getByRole('button',{name:'Liste',exact:true}).click(); await vent(300)
ok('liste: banen og benkebaren er borte', await p.locator('.pitch--live').count()===0 && await p.locator('.mm__bench--bar').count()===0)
let ban=await tekster(p,0), ben=await tekster(p,1)
const plasser=Number(sql(`select players_on_pitch from cohorts where id='${KULL}'`))
ok('liste: alle utespillerne + keeperen', ban.length===plasser-1 && await p.locator('.mm__lrad--keeper').count()===1, `${ban.length} + keeper`)
ok('liste: benken er med', ben.length>0, `${ben.length} på benken`)
ok('øverste i hver kolonne har ring', ban[0].tur && ben[0].tur && ban.filter(r=>r.tur).length===1 && ben.filter(r=>r.tur).length===1)
ok('siden bytte: stort tall er tid ute, lite er totalt', /^totalt /.test(ban[0].liten) && Math.abs(sek(ban[0].stor)-300)<=5, `${ban[0].stor} / ${ban[0].liten}`)

const ut=ban[0].navn, inn=ben[0].navn
await p.locator('.mm__lkol').nth(0).locator('.mm__lrad').first().click(); await vent(200)
ok('trykk på banen: valgt og spørsmålet', await p.locator('.mm__lrad--valgt').count()===1 && new RegExp(`Hvem går inn for ${ut}`).test(await p.locator('.mm__topslot').innerText()))
// Et nytt trykk på banen flytter valget — ingen plassbytte i lista.
const plassFor=sql(`select string_agg(player_id||':'||position, ',' order by player_id) from match_stints where match_id='${M}' and off_clock is null`)
await p.locator('.mm__lkol').nth(0).locator('.mm__lrad').nth(1).click(); await vent(600)
ok('banen + banen i lista flytter valget, ingen plassbytte', sql(`select string_agg(player_id||':'||position, ',' order by player_id) from match_stints where match_id='${M}' and off_clock is null`)===plassFor && await p.locator('.mm__lrad--valgt').count()===1)
await p.locator('.mm__lkol').nth(0).locator('.mm__lrad').first().click(); await vent(200)
await p.locator('.mm__lkol').nth(1).locator('.mm__lrad').first().click(); await vent(1500)
ok('trykk på benken: byttet er gjort', apne()===plasser)
ban=await tekster(p,0); ben=await tekster(p,1)
ok('innbytteren står på banen, den som gikk ut på benken', ban.some(r=>r.navn===inn) && ben.some(r=>r.navn===ut))
ok('angre vises', /Angre/.test(await p.locator('.mm__topslot').innerText()))

klokke(600); await p.reload(); await p.locator('.mm__live').waitFor(); await vent(800)
ok('lista huskes etter omlasting', await p.locator('.mm__liste').isVisible())
ban=await tekster(p,0); ben=await tekster(p,1)
ok('siden bytte: innbytteren nederst på banen (kortest ute)', ban.at(-1).navn===inn && Math.abs(sek(ban.at(-1).stor)-300)<=5, ban.map(r=>r.navn+' '+r.stor).join(', '))
ok('siden bytte: den som gikk ut nederst på benken (kortest sittet)', ben.at(-1).navn===ut, ben.map(r=>r.navn+' '+r.stor).join(', '))
ok('siden bytte: banen synker', ban.every((r,i)=>i===0||sek(ban[i-1].stor)>=sek(r.stor)))

await p.getByRole('button',{name:'Totalt',exact:true}).click(); await vent(300)
ban=await tekster(p,0); ben=await tekster(p,1)
ok('totalt: stort tall er totalen, lite er tid ute', /^ute /.test(ban[0].liten) && /^sittet /.test(ben[0].liten))
ok('totalt: mest spilt øverst på banen', ban.every((r,i)=>i===0||sek(ban[i-1].stor)>=sek(r.stor)))
ok('totalt: minst spilt øverst på benken', ben.every((r,i)=>i===0||sek(ben[i-1].stor)<=sek(r.stor)) && ben.at(-1).navn===ut)
await p.reload(); await p.locator('.mm__live').waitFor(); await vent(600)
ok('Totalt huskes', await p.getByRole('button',{name:'Totalt',exact:true}).getAttribute('aria-pressed')==='true')

// Benken først virker også.
await p.locator('.mm__lkol').nth(1).locator('.mm__lrad').first().click(); await vent(200)
ok('benken først: valgt', await p.locator('.mm__lkol').nth(1).locator('.mm__lrad--valgt').count()===1 && /Tapp spilleren som skal ut/.test(await p.locator('.mm__topslot').innerText()))
await p.locator('.mm__lkol').nth(0).locator('.mm__lrad').first().click(); await vent(1500)
ok('benken + banen er et bytte', apne()===plasser)

for (const [w, tema] of [[320,'light'],[390,'dark']]) {
  await p.setViewportSize({width:w,height:w===320?568:844}); await p.emulateMedia({colorScheme:tema}); await vent(400)
  ok(`${w} ${tema}: ingen sidescroll`, await p.evaluate(()=>{scrollTo(500,0);return scrollX})===0)
  await p.screenshot({path:`${process.env.QA_OUT||'/tmp'}/mm-liste-${w}-${tema}.png`})
}
await p.getByRole('button',{name:'Bane',exact:true}).click(); await vent(300)
ok('tilbake til banen', await p.locator('.pitch--live').isVisible())
ok('ingen sidefeil', !p.feil.length, p.feil.join(' | '))
} finally {
  await b.close()
  nullstill()
}
console.log(feilet?`\n${feilet} FEIL`:'\nAlt grønt'); process.exit(feilet?1:0)
