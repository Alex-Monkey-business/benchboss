// QA: hele flyten fra Alex oppretter kullet til Sten har en app som virker.
// Alt går gjennom de ekte veiene — RPC, edge-funksjonen, e-posten, fotball.no.
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'

const API='http://127.0.0.1:54321', APP='http://localhost:5173', MAIL='http://127.0.0.1:54324'
const ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SVC='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const STEN='alexander.samnoy+sten@gmail.com'
const KLUBB='Ørn Horten', KULL='Ørn G2016', ARGANG=2016, TOM_ARGANG=2017

let feilet=0
const ok=(l,c,x='')=>{ if(!c) feilet++; console.log(`${c?'OK  ':'FEIL'} ${l}${x?'  — '+x:''}`) }
const sql=q=>execSync(`docker exec -e PGPASSWORD=postgres supabase_db_halsen-dommerutlegg psql -U supabase_admin -h 127.0.0.1 -d postgres -qtAc "${q.replace(/"/g,'\\"')}"`).toString().trim()

async function token(epost){
  const l=await(await fetch(`${API}/auth/v1/admin/generate_link`,{method:'POST',headers:{apikey:SVC,Authorization:'Bearer '+SVC,'Content-Type':'application/json'},body:JSON.stringify({type:'magiclink',email:epost})})).json()
  const r=await fetch(l.action_link,{redirect:'manual'})
  const frag=(r.headers.get('location')||'').split('#')[1]||''
  return new URLSearchParams(frag).get('access_token')
}

// ---------- 0. Rydd bort en tidligere kjøring ----------
// Rydd på KLUBB, ikke på kullnavn: en tidligere kjøring kan ha lagd et kull
// med et annet navn, og da nekter FK-en på clubs å slette klubben.
const gamleKull = sql(`select string_agg(quote_literal(id::text), ',') from cohorts where club_id in (select id from clubs where name='${KLUBB}')`)
if (gamleKull) {
  for (const tabell of ['match_coaches','match_players','expenses','team_coaches','matches','players','teams','coaches','cohort_members']) {
    if (tabell === 'match_coaches' || tabell === 'match_players')
      sql(`delete from ${tabell} where match_id in (select id from matches where cohort_id in (${gamleKull}))`)
    else if (tabell === 'expenses')
      sql(`delete from expenses where match_id in (select id from matches where cohort_id in (${gamleKull}))`)
    else
      sql(`delete from ${tabell} where cohort_id in (${gamleKull})`)
  }
  sql(`update cohorts set active_season_id=null where id in (${gamleKull})`)
  sql(`delete from seasons where cohort_id in (${gamleKull})`)
  sql(`delete from cohorts where id in (${gamleKull})`)
}
sql(`delete from clubs where name='${KLUBB}'`)
// Sten skal være helt fersk. Har han en medlemsrad liggende i et annet kull
// lokalt (manuell testing), kobles den på idet brukeren gjenopprettes, og han
// våkner i DET kullet — som alt er satt opp — i stedet for i veiviseren.
sql(`delete from cohort_members where email='${STEN}'`)
sql(`delete from auth.users where email='${STEN}'`)

// Tøm postkassa: gamle invitasjoner til samme adresse ville blitt plukket
// først, og en brukt engangslenke gir «otp_expired» i stedet for innlogging.
await fetch(`${MAIL}/api/v1/messages`,{method:'DELETE'})

// ---------- 1. Alex oppretter kull-skallet ----------
const alex=await token('alexander.samnoy@gmail.com')
const H=a=>({apikey:ANON,Authorization:'Bearer '+a,'Content-Type':'application/json'})
const rpc=await fetch(`${API}/rest/v1/rpc/bb_create_cohort`,{method:'POST',headers:H(alex),body:JSON.stringify({
  p_club_id:null, p_club_name:KLUBB, p_club_short_name:'Ørn', p_name:KULL, p_slug:null,
  p_birth_year:null,                    // ← tomt med vilje: treneren velger selv
  p_players_on_pitch:null, p_period_count:null, p_period_minutes:null,
  p_teams:[],                           // ← ingen lag: FIKS gir dem
  p_season_name:'Høst 2026'
})})
const kullId=(await rpc.json())
ok('Alex oppretter kull-skallet (klubb, ingen lag, ingen årgang)', rpc.ok && !!kullId, String(kullId).slice(0,36))

// ---------- 2. Alex inviterer Sten som admin ----------
const inv=await fetch(`${API}/functions/v1/member-admin`,{method:'POST',headers:H(alex),body:JSON.stringify({
  action:'invite', cohort_id:kullId, name:'Sten', email:STEN, role:'admin', preferred_team:null
})})
const invSvar=await inv.json()
ok('invitasjonen sendes gjennom member-admin', inv.ok && !invSvar.error, invSvar.error || 'ok')

// ---------- 3. E-posten kommer fram ----------
let epost=null
for (let i=0;i<20 && !epost;i++){
  const m=await(await fetch(`${MAIL}/api/v1/messages?limit=30`)).json()
  const treff=(m.messages||[]).find(x=>(x.To||[]).some(t=>t.Address===STEN))
  if (treff) epost=await(await fetch(`${MAIL}/api/v1/message/${treff.ID}`)).json()
  else await new Promise(r=>setTimeout(r,400))
}
ok('Sten får e-post', !!epost, epost?.Subject||'ingen e-post')
// Kun ren tekst: HTML-versjonen har &amp; i URL-en. Og lenka brukes UROERT —
// skriver man om redirect_to (selv til samme adresse, url-enkodet), avviser
// GoTrue den som ugyldig. Det kostet meg to kjøringer.
const lenke=((epost?.Text||'').match(/https?:\/\/[^\s)<>"']*verify[^\s)<>"']*/)||[])[0]
ok('e-posten inneholder innloggingslenke', !!lenke, (lenke||'').slice(0,60)+'…')
// FUNN: lenka i invitasjonsmailen er død når den kommer fram. member-admin
// kaller confirmUser rett etter inviteUserByEmail, og e-postbekreftelsen
// nuller confirmation_token — altså nettopp den lenka bruker fikk.
// Verifisert: email_confirmed_at satt, confirmation_token tom, lenke → otp_expired.
const dodLenke = await fetch(lenke, {redirect:'manual'})
const dodFrag = (dodLenke.headers.get('location')||'').split('#')[1]||''
ok('LENKA I INVITASJONSMAILEN VIRKER', !/otp_expired/.test(dodFrag), dodFrag.slice(0,60) || 'ok')

// Resten av QA-en kjører den veien som FAKTISK virker i dag: Sten går til
// /login og ber om en ny kode. Da får vi testet onboardingen.
const nyLenke = await(await fetch(`${API}/auth/v1/admin/generate_link`,{method:'POST',headers:{apikey:SVC,Authorization:'Bearer '+SVC,'Content-Type':'application/json'},body:JSON.stringify({type:'magiclink',email:STEN})})).json()
const lokalLenke = nyLenke.action_link

// ---------- 4. Sten går gjennom onboardingen ----------
const b=await chromium.launch()
const c=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})
const p=await c.newPage()
const sidefeil=[]; p.on('pageerror',e=>sidefeil.push(e.message))
await p.goto(lokalLenke,{waitUntil:'networkidle'})
// Guarden kjører først når sesjonen er lest. Vent på at ruten faktisk lander,
// ikke på en fast tid — 1,5 s holdt av og til, og ikke av og til.
await p.waitForFunction(() => !location.hash.includes('access_token'), null, {timeout:20000}).catch(()=>{})
await p.waitForURL(/\/(kom-i-gang|hjem)/,{timeout:20000}).catch(()=>{})
await p.waitForTimeout(800)
ok('innlogget som Sten', await p.locator('body').innerText().then(t=>!/Logg inn/i.test(t)))
ok('sendes rett i veiviseren', p.url().includes('/kom-i-gang'), p.url())

// Veiviseren åpner på velkomstskjermen — den må klikkes bort først.
await p.getByRole('button',{name:'Kom i gang'}).click()
await p.waitForTimeout(400)

await p.locator('.kig__sok').fill(KLUBB)
await p.locator('.kig__klubb').first().waitFor({timeout:20000})
const treffTekst=await p.locator('.kig__klubb').first().innerText()
ok('finner klubben på fotball.no', /Ørn/i.test(treffTekst), treffTekst.replace(/\n/g,' · '))
await p.locator('.kig__klubb').first().click()
await p.waitForTimeout(500)

// Ekte FIKS-data er hullete: Ørn Horten har ingen G9. Sjekk at den tomme
// tilstanden er ærlig før vi går videre med en årgang som finnes.
await p.getByRole('button',{name:String(TOM_ARGANG),exact:true}).click()
await p.waitForTimeout(300)
const tomStatus=await p.locator('.kig__status').innerText().catch(()=>'')
ok('tom årgang sier det rett ut', /— 0 lag/.test(tomStatus), tomStatus)
await p.getByRole('button',{name:'Videre'}).click()
await p.waitForTimeout(500)
const tomLead=await p.locator('.kig__lead').innerText()
ok('tomt lag-steg forklarer hvorfor', /ingen lag registrert/i.test(tomLead), tomLead.replace(/\s+/g,' '))
ok('hele klubbens lagliste er tilgjengelig som utvei', await p.getByRole('button',{name:/Vis alle \d+ lagene/}).count()===1)
await p.goBack().catch(()=>{})
await p.goto(APP+'/kom-i-gang',{waitUntil:'networkidle'}); await p.waitForTimeout(1200)
// Etter en reload står velkomsten der igjen. Klubben er lagret i basen, så
// veiviseren hopper videre til årgang av seg selv.
const igjen=p.getByRole('button',{name:'Kom i gang'})
if (await igjen.count()) { await igjen.click(); await p.waitForTimeout(600) }

await p.getByRole('button',{name:String(ARGANG),exact:true}).click()
await p.waitForTimeout(300)
const statusAr=await p.locator('.kig__status').innerText().catch(()=>'')
ok('årgang gir riktig klasse og lagtall', /\d+ år i \d{4} — [1-9]\d* lag/.test(statusAr), statusAr)
ok('kjønn er et eget valg', await p.getByRole('radio',{name:'Gutter'}).count()===1 || await p.locator('.kig__kjonnknapp').count()===2)
await p.getByRole('button',{name:'Videre'}).click()
await p.waitForTimeout(600)

const lagKort=await p.locator('.kig__lag').count()
const valgte=await p.locator('.kig__lag--valgt').count()
ok('lagene er huket av på forhånd', lagKort>0 && valgte===lagKort, `${valgte}/${lagKort}`)
const hentKnapp=p.getByRole('button',{name:/Hent lag og kamper/})
await hentKnapp.click()
await p.waitForTimeout(9000)
const feilLinje=await p.locator('.kig__status--feil').innerText().catch(()=>'')
if (feilLinje) ok('IMPORTEN FEILET', false, feilLinje)
await p.locator('.kig__tittel', {hasText:'Klart.'}).waitFor({timeout:60000})
const ferdigTekst=await p.locator('.kig__lead').innerText()
ok('lag og kamper er hentet', /\d+ lag og \d+ kamper/.test(ferdigTekst), ferdigTekst.replace(/\s+/g,' ').slice(0,80))
await p.getByRole('button',{name:'Til Hjem'}).click()
await p.waitForTimeout(1800)

// ---------- 5. Hjem etter onboardingen ----------
const hjem=(await p.locator('body').innerText()).replace(/\s+/g,' ')
ok('lander på Hjem', p.url().endsWith('5173/'), p.url())
ok('Hjem ber om spillere', /Legg inn spillerne/.test(hjem))
ok('Hjem maser IKKE om kampprogram', !/Last opp kampprogrammet/.test(hjem))
ok('Hjem maser IKKE om å invitere trenere', !/Inviter trenerne/.test(hjem))

// ---------- 6. Spillere, ett lag om gangen ----------
await p.getByRole('button',{name:/Legg inn spillerne/}).click()
await p.locator('#onb-paste').waitFor()
const antallLag=Number(sql(`select count(*) from teams where cohort_id='${kullId}'`))
for (let i=0;i<antallLag;i++){
  const hode=await p.locator('.onb-steg').innerText().catch(()=>'')
  if (!hode) break
  await p.locator('#onb-paste').fill(['Ola Nordmann','Kari Nordmann','Per Hansen'].map(n=>`${n} ${i+1}`).join('\n'))
  await p.waitForTimeout(200)
  await p.locator('.onb-actions .ds-btn--primary').click()
  await p.waitForTimeout(900)
}
await p.waitForTimeout(800)
const hjem2=(await p.locator('body').innerText()).replace(/\s+/g,' ')
ok('spillerkortet er borte når alle lag er fylt', !/Legg inn spillerne/.test(hjem2))

// ---------- 7. Fasit i basen ----------
const t=Number(sql(`select count(*) from teams where cohort_id='${kullId}'`))
const m=Number(sql(`select count(*) from matches where cohort_id='${kullId}'`))
const sp=Number(sql(`select count(*) from players where cohort_id='${kullId}'`))
const tc=Number(sql(`select count(*) from team_coaches where cohort_id='${kullId}'`))
const mc=Number(sql(`select count(distinct mc.match_id) from match_coaches mc join matches mm on mm.id=mc.match_id where mm.cohort_id='${kullId}'`))
const ar=sql(`select coalesce(birth_year::text,'null') from cohorts where id='${kullId}'`)
const fmt=sql(`select players_on_pitch::text from cohorts where id='${kullId}'`)
console.log(`\n  lag ${t} · kamper ${m} · spillere ${sp} · lag-trener ${tc} · kamper m/trener ${mc} · årgang ${ar} · spillform ${fmt}er`)
ok('lag opprettet', t>0)
ok('terminlista importert', m>0, `${m} kamper`)
ok('årgangen er lagret på kullet', ar===String(ARGANG), ar)
ok('spillformen følger årgangen', fmt==='7', fmt+'er')  // 10 år ⇒ 7er etter NFF
ok('Sten er trener på alle lagene', tc===t, `${tc}/${t}`)
ok('alle kampene har en trener', mc===m, `${mc}/${m}`)
ok('ingen sidefeil gjennom hele flyten', sidefeil.length===0, sidefeil.slice(0,2).join(' | '))

await b.close()
console.log(feilet ? `\n${feilet} FEIL` : '\nAlt grønt')
console.log(`kullet «${KULL}» ligger igjen i basen for manuell inspeksjon`)
