// Kampmodus, halvtid: klokka som står tar over toppen, en lang pause gir
// «Startet dere før du trykket?», og en klokkehandling som feiler står igjen
// til den er løst. Fra 14. okt, da 2. omgang startet ti minutter for sent.
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'
const API=process.env.QA_API||'http://127.0.0.1:54321'
const APP=process.env.QA_APP||'http://localhost:5174'
const SVC='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const KULL='af104bf3-02f4-4067-a0db-bf285f5d8f39', EPOST='alexander.samnoy@gmail.com'
const UT=process.env.QA_OUT||'/tmp'
let feilet=0
const ok=(l,c,x='')=>{ if(!c) feilet++; console.log(`${c?'OK  ':'FEIL'} ${l}${x?'  — '+x:''}`) }
const sql=q=>execSync(`docker exec -e PGPASSWORD=postgres supabase_db_halsen-dommerutlegg psql -U postgres -Atc ${JSON.stringify(q)}`).toString().trim()
const vent=ms=>new Promise(r=>setTimeout(r,ms))

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
const sesjon=()=>sql(`select status||'|'||period||'|'||clock_base_seconds||'|'||coalesce(extract(epoch from now()-running_since)::int::text,'') from match_sessions where match_id='${M}'`).split('|')
const klokkeTekst=async p=>{ const [m,s]=(await p.locator('.mm__clock').innerText()).trim().split(':').map(Number); return m*60+s }
const reload=async p=>{ await p.reload(); await p.locator('.mm__live').waitFor(); await vent(800) }

const b=await chromium.launch()
try {
const p=await telefon(b)
await p.getByRole('button',{name:'Fyll resten'}).click()
await p.getByRole('button',{name:'Start kamp'}).click(); await p.locator('.mm__live').waitFor(); await vent(1000)
ok('klokka går: ingen pause-flate', await p.locator('.mm__pause').count()===0)

// 1. Halvtid tar over toppen.
sql(`update match_sessions set clock_base_seconds=1797, running_since=now() where match_id='${M}'`)
await reload(p); await p.locator('.mm__pause').waitFor({timeout:8000}); await vent(300)
let [st,per,base]=sesjon()
ok('auto-pause på 30:00', st==='paused' && per==='1' && base==='1800', `${st} ${per} ${base}`)
ok('halvtid: stor flate med navn og knapp', /Halvtid/.test(await p.locator('.mm__pause-navn').innerText()) && await p.locator('.mm__pause-start').innerText()==='Start 2. omgang')
ok('halvtid: den lille knappen i toppen er borte', await p.locator('.mm__clockrow .mm__ctrl:not(.mm__ctrl--end)').count()===0)
ok('halvtid: viser hvor lenge klokka har stått', /Stått i 0:0\d/.test(await p.locator('.mm__pause-tid').innerText()), await p.locator('.mm__pause-tid').innerText())
await p.screenshot({path:`${UT}/mm-halvtid.png`})

// Låst skjerm gjennom 30:00: pausen telles fra 30:00, ikke fra når skjermen våknet.
await p.locator('.mm__pause-start').click(); await vent(800)
sql(`update match_sessions set status='running', period=1, clock_base_seconds=1500, running_since=now()-interval '10 minutes' where match_id='${M}'`)
await reload(p); await p.locator('.mm__pause').waitFor({timeout:8000}); await vent(300)
ok('låst skjerm: auto-pause på 30:00', sesjon()[2]==='1800')
ok('låst skjerm: stått i ~5 min', /Stått i 5:0\d/.test(await p.locator('.mm__pause-tid').innerText()), await p.locator('.mm__pause-tid').innerText())

// En vanlig halvtid (4 min) gir ikke spørsmålet.
sql(`update match_sessions set updated_at=now()-interval '4 minutes' where match_id='${M}'`)
await reload(p)
ok('pausetida leses fra serveren', /4:0\d/.test(await p.locator('.mm__pause-tid').innerText()))
await p.locator('.mm__pause-start').click(); await vent(800)
ok('kort pause: startet, ingen spørsmål', sesjon()[0]==='running' && await p.locator('.mm__senstart').count()===0)

// 2. Lang pause: 17 min, som 14. okt.
sql(`update match_sessions set status='paused', period=1, clock_base_seconds=1800, running_since=null, updated_at=now()-interval '17 minutes' where match_id='${M}'`)
await reload(p)
await p.locator('.mm__pause-start').click(); await vent(800)
ok('lang pause: spørsmålet kommer', await p.locator('.mm__senstart').isVisible())
ok('gjetning: 17 − 8 = 9 min', /^For 9 min siden$/.test(await p.locator('.mm__senstart-verdi strong').innerText()))
for (let i=0;i<10 && await p.locator('.mm__senstart-steg').nth(1).isEnabled();i++) await p.locator('.mm__senstart-steg').nth(1).click()
ok('taket: pausen minus ett minutt (16)', /^For 16 min siden$/.test(await p.locator('.mm__senstart-verdi strong').innerText()) && await p.locator('.mm__senstart-steg').nth(1).isDisabled())
for (let i=0;i<5;i++) await p.locator('.mm__senstart-steg').nth(0).click()
ok('ned til 11 min, klokka-forhåndsvisning', /^For 11 min siden$/.test(await p.locator('.mm__senstart-verdi strong').innerText()) && /Klokka settes til 4[01]:/.test(await p.locator('.mm__senstart-verdi span').innerText()), await p.locator('.mm__senstart-verdi span').innerText())
await p.screenshot({path:`${UT}/mm-senstart.png`})

// Et bytte og et mål ført etter trykket skal følge med, det som skjedde i pausen skal stå.
const [en,to]=sql(`select player_id from match_stints where match_id='${M}' and off_clock is null and role='field' limit 2`).split('\n')
sql(`update match_stints set off_clock=1800 where match_id='${M}' and player_id='${en}' and off_clock is null; insert into match_stints(match_id,player_id,role,position,on_clock,cohort_id) select match_id,player_id,role,position,1800,cohort_id from match_stints where match_id='${M}' and player_id='${en}' limit 1`)
sql(`update match_stints set off_clock=1801 where match_id='${M}' and player_id='${to}' and off_clock is null; insert into match_goals(match_id,player_id,clock_seconds,cohort_id) values ('${M}','${to}',1801,'${KULL}')`)
await p.getByRole('button',{name:'Sett klokka'}).click(); await vent(1000)
const k=await klokkeTekst(p)
ok('klokka flyttet 11 min', k>=1800+660 && k<=1800+660+6, String(k))
ok('spørsmålet er borte', await p.locator('.mm__senstart').count()===0)
ok('bytte i pausen står på 30:00', sql(`select count(*) from match_stints where match_id='${M}' and player_id='${en}' and (off_clock=1800 or on_clock=1800)`)==='2')
ok('bytte etter trykket flyttet', sql(`select off_clock from match_stints where match_id='${M}' and player_id='${to}' and off_clock is not null order by off_clock desc limit 1`)==='2461')
ok('mål etter trykket flyttet', sql(`select clock_seconds from match_goals where match_id='${M}'`)==='2461')
ok('serveren nekter forbi omgangsslutt', sql(`select (public.mm_klokkehandling('${M}','tidligere_start','running',1200)->>'ok')`)==='false')

// 3. Uten nett: Pause feiler, meldingen står, Prøv igjen løser det.
await p.context().setOffline(true)
await p.locator('.mm__clockrow .mm__ctrl:not(.mm__ctrl--end)').click(); await vent(1500)
ok('uten nett: meldingen står', /Klokka stoppet ikke — ingen nett/.test(await p.locator('.mm__klokkefeil').innerText()))
ok('uten nett: klokka går fortsatt', sesjon()[0]==='running' && await p.locator('.mm__pause').count()===0)
await vent(4000)
ok('meldingen står etter 4 sek', await p.locator('.mm__klokkefeil').isVisible())
await p.screenshot({path:`${UT}/mm-klokkefeil.png`})
await p.context().setOffline(false); await vent(500)
await p.getByRole('button',{name:'Prøv igjen'}).click(); await vent(1000)
ok('prøv igjen: klokka står, meldingen borte', sesjon()[0]==='paused' && await p.locator('.mm__klokkefeil').count()===0)
ok('pauset midt i omgangen: samme flate, Fortsett', /Pauset/.test(await p.locator('.mm__pause-navn').innerText()) && await p.locator('.mm__pause-start').innerText()==='Fortsett')

for (const [w, tema] of [[320,'light'],[390,'dark']]) {
  await p.setViewportSize({width:w,height:w===320?568:844}); await p.emulateMedia({colorScheme:tema}); await vent(400)
  ok(`${w} ${tema}: ingen sidescroll`, await p.evaluate(()=>{scrollTo(500,0);return scrollX})===0)
  await p.screenshot({path:`${UT}/mm-pause-${w}-${tema}.png`})
}
// 4. Full tid: samme flate, men neste handling er å avslutte.
await p.setViewportSize({width:390,height:844}); await p.emulateMedia({colorScheme:'light'})
sql(`update match_sessions set status='running', period=2, clock_base_seconds=3597, running_since=now() where match_id='${M}'`)
await reload(p); await vent(4000)
ok('full tid: Full tid + Avslutt kamp, ingen Fortsett', sesjon()[2]==='3600' && /Full tid/.test(await p.locator('.mm__pause-navn').innerText()) && await p.locator('.mm__pause-start').innerText()==='Avslutt kamp' && await p.getByRole('button',{name:'Fortsett'}).count()===0)
ok('full tid: ingen byttforslag', await p.locator('.mm__forslag').count()===0)
ok('ingen sidefeil', !p.feil.length, p.feil.join(' | '))
} finally {
  await b.close()
  nullstill()
}
console.log(feilet?`\n${feilet} FEIL`:'\nAlt grønt'); process.exit(feilet?1:0)
