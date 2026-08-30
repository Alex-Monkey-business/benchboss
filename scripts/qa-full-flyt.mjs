// QA: hele flyten fra Alex oppretter kullet til Sten har en app som virker.
// Alt går gjennom de ekte veiene — RPC, edge-funksjonen, e-posten, fotball.no.
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'

// Overstyrbare så pre-push-hooken kan kjøre riggen på en ledig port uten å
// slåss med dev-serveren du selv har gående.
const API=process.env.QA_API||'http://127.0.0.1:54321'
const APP=process.env.QA_APP||'http://localhost:5173'
const MAIL=process.env.QA_MAIL||'http://127.0.0.1:54324'
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
//
// redirect_to må peke på /auth/callback — det er dit appens egen sendCode()
// sender folk. Uten den lander lenka på `/` med tokenet i hashen, guarden
// rekker å se en ulogget bruker, og hele QA-en stoppet på «sendes rett i
// veiviseren». Riggen testet en vei appen aldri bruker.
const nyLenke = await(await fetch(`${API}/auth/v1/admin/generate_link`,{method:'POST',headers:{apikey:SVC,Authorization:'Bearer '+SVC,'Content-Type':'application/json'},body:JSON.stringify({type:'magiclink',email:STEN,redirect_to:`${APP}/auth/callback`})})).json()
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
ok('lander på Hjem', p.url().replace(/\/$/,'')===APP, p.url())
ok('Hjem ber om spillere', /Legg inn spillerne/.test(hjem))
ok('Hjem maser IKKE om kampprogram', !/Last opp kampprogrammet/.test(hjem))
ok('Hjem maser IKKE om å invitere trenere', !/Inviter trenerne/.test(hjem))

// ---------- 5b. Veiviseren én gang til ----------
//
// Sten kjørte den to ganger — han satt fast på siste steg og prøvde igjen — og
// forsøk to krasjet på «teams_cohort_id_slug_key». Vi testet bare forsøk én, og
// forsøk én er ikke det brukere gjør når noe går galt.
//
// Dette skjer FØR spillerne legges inn, med vilje: et kull uten spillere er
// fortsatt i oppsettet, og da skal treneren få ombestemme seg. Har det
// spillere, er det i bruk, og bb_cohort_setup nekter — som den skal.
const førLag = sql(`select count(*) from teams where cohort_id='${kullId}'`)
const førKamp = sql(`select count(*) from matches where cohort_id='${kullId}'`)
const førTC = sql(`select count(*) from team_coaches where cohort_id='${kullId}'`)

await p.goto(APP+'/kom-i-gang',{waitUntil:'networkidle'})
await p.waitForTimeout(1200)
const velkomstIgjen = p.getByRole('button',{name:'Kom i gang'})
if (await velkomstIgjen.count()) { await velkomstIgjen.click(); await p.waitForTimeout(600) }
await p.getByRole('button',{name:String(ARGANG),exact:true}).click().catch(()=>{})
await p.waitForTimeout(300)
await p.getByRole('button',{name:'Videre'}).click().catch(()=>{})
await p.waitForTimeout(700)
await p.getByRole('button',{name:/Hent lag og kamper/}).click().catch(()=>{})
await p.waitForTimeout(9000)

const feilIgjen = await p.locator('.kig__status--feil').innerText().catch(()=>'')
ok('andre gjennomkjøring gir ingen feil', !feilIgjen, feilIgjen)
await p.locator('.kig__tittel', {hasText:'Klart.'}).waitFor({timeout:60000}).catch(()=>{})
ok('andre gjennomkjøring når «Klart.»', await p.locator('.kig__tittel', {hasText:'Klart.'}).count()===1)
ok('ingen duplikate lag', sql(`select count(*) from teams where cohort_id='${kullId}'`)===førLag, `${førLag} → ${sql(`select count(*) from teams where cohort_id='${kullId}'`)}`)
ok('ingen duplikate kamper', sql(`select count(*) from matches where cohort_id='${kullId}'`)===førKamp, `${førKamp} → ${sql(`select count(*) from matches where cohort_id='${kullId}'`)}`)
ok('ingen duplikate trenerkoblinger', sql(`select count(*) from team_coaches where cohort_id='${kullId}'`)===førTC, `${førTC} → ${sql(`select count(*) from team_coaches where cohort_id='${kullId}'`)}`)

await p.getByRole('button',{name:'Til Hjem'}).click().catch(()=>{})
await p.waitForTimeout(1800)
ok('lander på Hjem også andre gang', p.url().replace(/\/$/,'')===APP, p.url())

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

// Bare TRENERE i dette kullet står på kampene. Sto det en igjen fra et annet
// kull — plattform-admin som satte opp skallet, for eksempel — ville han vært
// standardtrener på hver eneste kamp uten at noen hadde bedt om det.
const fremmede = sql(`select coalesce(string_agg(distinct co.name, ', '), '') from match_coaches mc
  join matches mm on mm.id=mc.match_id
  join coaches co on co.id=mc.coach_id
  where mm.cohort_id='${kullId}' and co.cohort_id <> '${kullId}'`)
ok('ingen fremmed trener på kampene', fremmede==='', fremmede)

const adminSomTrener = sql(`select coalesce(string_agg(m2.name, ', '), '') from cohort_members m2
  join profiles pr on pr.id=m2.profile_id
  where m2.cohort_id='${kullId}' and pr.is_platform_admin and m2.coach_id is not null`)
ok('plattform-admin har ingen trenerrad her', adminSomTrener==='', adminSomTrener)

// ---------- 8. Tomhetssveip: et nytt kull skal føles nytt ----------
//
// Alt Sten fant utenom den døde knappen var det samme: appen var ikke tom. Tre
// treningsøkter på Halsens dager, to Halsen-lag i cup-fanen, en trener som ikke
// trente. Ingen av dem kastet en feil. Den eneste måten å oppdage dem på var å
// åpne flatene i et ferskt kull og se etter.
//
// Så det er det denne gjør. Den leter ikke etter kjente feil — den slår fast en
// egenskap: INGEN flate i Ørn-kullet skal nevne Halsen, Stag eller noen annen
// klubb enn sin egen. Den fanger neste lekkasje også, den vi ikke vet om ennå.
const ANDRE_KLUBBER = sql(`select coalesce(string_agg(distinct name, '|'), '') from clubs
  where id <> (select club_id from cohorts where id='${kullId}')`).split('|').filter(Boolean)
const KORTNAVN = sql(`select coalesce(string_agg(distinct short_name, '|'), '') from clubs
  where id <> (select club_id from cohorts where id='${kullId}')`).split('|').filter(Boolean)
const FREMMEDORD = [...new Set([...ANDRE_KLUBBER, ...KORTNAVN])]

// Motstanderne er unntaket, og de er et EKTE unntak: Ørn møter Halsen G10 Rød
// 21. september. Et klubbnavn i en kampliste er terminlista, ikke en lekkasje.
// Så flatene som viser kamper får nevne klubber vi faktisk spiller mot — og
// bare dem. Alt annet skal ikke kjenne til noen annen klubb i det hele tatt.
const MOTSTANDERE = sql(`select coalesce(string_agg(distinct home_team || ' ' || away_team, ' '), '')
  from matches where cohort_id='${kullId}'`).toLowerCase()

const FLATER = [
  ['Hjem', '/', true],
  ['Kamper', '/kamper', true],
  ['Statistikk', '/statistikk', true],
  ['Serie', '/serie', true],
  ['Tropp', '/serie/tropp', false],
  ['Cup', '/cup', false],
  ['Cup-tropp', '/cup/tropp', false],
  ['Treningsplan', '/trening', false],
  ['Øvelsesbank', '/trening/ovelser', false],
  ['Håndbok', '/trening/handbok', false],
  ['Admin', '/admin', false],
  ['Tilgang', '/admin/tilgang', false],
  ['Dommerutlegg', '/admin/dommerutlegg', true],
  ['Sesong-kamper', '/admin/sesong-kamper', true]
]

const lekkasjer = []
const krasj = []
for (const [navn, rute, viserKamper] of FLATER) {
  const førFeil = sidefeil.length
  await p.goto(`${APP}${rute}`, {waitUntil:'networkidle'}).catch(()=>{})
  await p.waitForTimeout(600)
  const tekst = (await p.locator('body').innerText().catch(()=>'')).replace(/\s+/g,' ')
  const truffet = FREMMEDORD.filter(o => {
    if (!new RegExp(`\\b${o.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`,'i').test(tekst)) return false
    // På en kampflate er et navn vi faktisk møter helt i orden.
    return !(viserKamper && MOTSTANDERE.includes(o.toLowerCase()))
  })
  if (truffet.length) lekkasjer.push(`${navn}: ${truffet.join(', ')}`)
  if (sidefeil.length > førFeil) krasj.push(`${navn}: ${sidefeil[førFeil]}`)
}
ok('ingen annen klubb nevnes utenfor terminlista', lekkasjer.length===0, lekkasjer.join(' | '))
ok('ingen flate krasjer i et ferskt kull', krasj.length===0, krasj.join(' | '))

// Treningsplanen skal være tom — ikke arve noen andres uke.
const okter = Number(sql(`select count(*) from training_sessions ts
  join training_periods tp on tp.id=ts.period_id where tp.cohort_id='${kullId}'`))
ok('treningsplanen er tom i et nytt kull', okter===0, `${okter} økter`)

// Cup-lagene utledes av cupens egne data. Ingen cup ⇒ ingen lag.
await p.goto(`${APP}/cup/tropp`, {waitUntil:'networkidle'}).catch(()=>{})
await p.waitForTimeout(500)
// `.teamcard` deles med «Ikke plassert»-seksjonen, som er noe annet. Det er
// lagKORTENE som ikke skal finnes uten en cup — de var Halsen IF og Halsen IF 2.
ok('ingen cup-lag uten en cup', (await p.locator('.teamcard:not(.teamcard--muted)').count())===0)
ok('ingen sidefeil gjennom hele flyten', sidefeil.length===0, sidefeil.slice(0,2).join(' | '))

await b.close()
console.log(feilet ? `\n${feilet} FEIL` : '\nAlt grønt')
console.log(`kullet «${KULL}» ligger igjen i basen for manuell inspeksjon`)
