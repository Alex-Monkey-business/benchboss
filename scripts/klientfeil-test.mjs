// Klientfeil: `node scripts/klientfeil-test.mjs`
//
// Rapportøren er verdiløs hvis den ikke faktisk skriver. Testen kaster ekte
// feil i en ekte nettleser og krever at radene står i basen etterpå — med
// riktig fingeravtrykk, riktig kull og riktig rolle.
//
// Krever `supabase start` og en dev-server mot LOKAL base (se pre-push-hooken).
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'

const API=process.env.QA_API||'http://127.0.0.1:54321'
const APP=process.env.QA_APP||'http://localhost:5173'
const SVC='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

let feilet=0
const ok=(l,c,x='')=>{ if(!c) feilet++; console.log(`${c?'OK  ':'FEIL'} ${l}${x?'  — '+x:''}`) }
const sql=q=>execSync(`docker exec -e PGPASSWORD=postgres supabase_db_halsen-dommerutlegg psql -U supabase_admin -h 127.0.0.1 -d postgres -qtAc "${q.replace(/"/g,'\\"')}"`).toString().trim()

sql("delete from client_errors")

const epost = sql("select p.email from profiles p join cohort_members m on m.profile_id=p.id where m.status='active' order by p.is_platform_admin desc limit 1")
const lenke = await (async () => {
  const l = await (await fetch(`${API}/auth/v1/admin/generate_link`,{method:'POST',headers:{apikey:SVC,Authorization:'Bearer '+SVC,'Content-Type':'application/json'},body:JSON.stringify({type:'magiclink',email:epost,redirect_to:`${APP}/auth/callback`})})).json()
  return l.action_link
})()

const b = await chromium.launch()
const p = await (await b.newContext({viewport:{width:390,height:844}})).newPage()
await p.goto(lenke,{waitUntil:'networkidle'})
await p.waitForURL(/\/(kom-i-gang|$)/,{timeout:20000}).catch(()=>{})
await p.waitForTimeout(1500)

// 1. En ekte, ubehandlet feil.
await p.evaluate(() => setTimeout(() => { throw new Error('QA-krasj: en ekte feil') }, 0))
// 2. Et avvist løfte ingen fanger.
await p.evaluate(() => { Promise.reject(new Error('QA-krasj: avvist løfte')) })
// 3. Samme feil en gang til — skal IKKE gi en ny rad.
await p.evaluate(() => setTimeout(() => { throw new Error('QA-krasj: en ekte feil') }, 0))
// 4. En ressurs som ikke finnes — er ikke en krasj og skal ikke meldes.
await p.evaluate(() => { const i = document.createElement('img'); i.src = '/finnes-ikke.png'; document.body.appendChild(i) })
await p.waitForTimeout(2500)

const antall = Number(sql("select count(*) from client_errors"))
const meldinger = sql("select coalesce(string_agg(message, ' | ' order by message), '') from client_errors")
const kinds = sql("select coalesce(string_agg(distinct kind, ',' order by kind), '') from client_errors")
const avtrykk = Number(sql("select count(distinct fingerprint) from client_errors"))
const medRolle = Number(sql("select count(*) from client_errors where role is not null"))
const medRelease = Number(sql("select count(*) from client_errors where release is not null"))
const medQuery = Number(sql("select count(*) from client_errors where route like '%?%'"))

console.log(`\n  ${antall} rader · ${avtrykk} avtrykk · kinds: ${kinds}\n  ${meldinger}\n`)

ok('en kastet feil blir meldt', /en ekte feil/.test(meldinger))
ok('et avvist løfte blir meldt', /avvist løfte/.test(meldinger), kinds)
ok('samme feil meldes bare én gang', antall===2, `${antall} rader`)
ok('ressursfeil meldes ikke', !/finnes-ikke/.test(meldinger))
ok('hver sak har sitt eget avtrykk', avtrykk===2, String(avtrykk))
ok('rollen følger med', medRolle===antall, `${medRolle}/${antall}`)
ok('release følger med', medRelease===antall, `${medRelease}/${antall}`)
ok('ruten bærer ingen query', medQuery===0, `${medQuery} med query`)

// RLS er den viktigste egenskapen her. En stacktrace kan bære ruter og
// kull-id-er fra andre lag, og en trener har ingenting der å gjøre.
// SQL-en går inn på stdin, ikke som argument. JWT-claimsene er JSON inni en
// streng inni et shell-argument, og den escapingen er ikke verdt å vinne.
const sqlInn = tekst => execSync(
  'docker exec -i -e PGPASSWORD=postgres supabase_db_halsen-dommerutlegg psql -U supabase_admin -h 127.0.0.1 -d postgres -qtA',
  { input: tekst }
).toString().trim()

const somRolle = (uid, q) => sqlInn(`
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true);
${q};
rollback;
`).split('\n').filter(Boolean).pop().trim()

const admin = sql("select id from profiles where is_platform_admin limit 1")
const trener = sql("select m.profile_id from cohort_members m join profiles p on p.id=m.profile_id where m.role='coach' and m.status='active' and not p.is_platform_admin limit 1")

ok('plattform-admin ser krasjene', somRolle(admin, 'select count(*) from client_errors') === String(antall), somRolle(admin, 'select count(*) from client_errors'))
if (trener) {
  ok('en trener ser dem IKKE', somRolle(trener, 'select count(*) from client_errors') === '0', somRolle(trener, 'select count(*) from client_errors'))
} else {
  ok('en trener ser dem IKKE', false, 'fant ingen trener å teste med')
}

await b.close()
console.log(feilet ? `\n${feilet} FEIL` : '\nAlt grønt')
process.exit(feilet ? 1 : 0)
