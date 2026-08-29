// Hva står det faktisk i invitasjonen? Resend-nøkkelen er «send only» og kan
// ikke lese en sendt e-post tilbake, så vi fanger den på vei ut: en liten
// server tar imot i stedet for Resend.
//
// Krever at edge-funksjonen kjører mot den:
//   RESEND_API_KEY=test RESEND_URL=http://host.docker.internal:54999
import { createServer } from 'node:http'
import { inviteHtml } from '../supabase/functions/member-admin/invite-mail.ts'
import { execSync } from 'node:child_process'
const API='http://127.0.0.1:54321'
const ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SVC='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const E='innholdstest@example.com'
let feil=0; const ok=(l,c,x='')=>{ if(!c) feil++; console.log(`${c?'OK  ':'FEIL'} ${l}${x?'  — '+x:''}`) }
const sql=q=>execSync(`docker exec -e PGPASSWORD=postgres supabase_db_halsen-dommerutlegg psql -U supabase_admin -h 127.0.0.1 -d postgres -qtAc "${q.replace(/"/g,'\\"')}"`).toString().trim()

let fanget=null
const server=createServer((req,res)=>{
  let b=''; req.on('data',d=>b+=d)
  req.on('end',()=>{ fanget=JSON.parse(b||'{}'); res.writeHead(200,{'Content-Type':'application/json'}); res.end('{"id":"test"}') })
})
await new Promise(r=>server.listen(54999,'0.0.0.0',r))

// Et skall slik Alex lager det: klubb, ingen årgang, arbeidsnavn.
const klubb=sql(`select id from clubs where name='Halsen IL'`)
sql(`delete from cohort_members where email='${E}'`); sql(`delete from auth.users where email='${E}'`)
let skall=sql(`select id from cohorts where slug='innholdstest-skall'`)
if(!skall) skall=sql(`insert into cohorts (club_id, slug, name) values ('${klubb}','innholdstest-skall','Halsen – nytt kull') returning id`)
sql(`delete from cohort_members where cohort_id='${skall}'`); sql(`delete from coaches where cohort_id='${skall}'`)

const l=await(await fetch(`${API}/auth/v1/admin/generate_link`,{method:'POST',headers:{apikey:SVC,Authorization:'Bearer '+SVC,'Content-Type':'application/json'},body:JSON.stringify({type:'magiclink',email:'alexander.samnoy@gmail.com'})})).json()
const t=new URLSearchParams(((await fetch(l.action_link,{redirect:'manual'})).headers.get('location')||'').split('#')[1]||'').get('access_token')
const kall=(kull)=>fetch(`${API}/functions/v1/member-admin`,{method:'POST',headers:{apikey:ANON,Authorization:'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify({action:'invite',cohort_id:kull,name:'Sten Innholdstest',email:E,role:'admin',preferred_team:null})}).then(r=>r.json())

// 1. Kull uten årgang → KLUBBEN skal stå der, ikke arbeidsnavnet
let sv=await kall(skall)
ok('invitasjonen går gjennom', !sv.error, sv.error||'ok')
ok('e-posten ble sendt vår vei', !!fanget, fanget?'ja':'nei')
const h=fanget?.html||''
ok('arbeidsnavnet står IKKE i e-posten', !/nytt kull/i.test(h+fanget?.subject), (h.match(/[^>]*nytt kull[^<]*/i)||[''])[0])
ok('klubben står i emnet', /Halsen IL/.test(fanget?.subject||''), fanget?.subject)
ok('fornavnet brukes, ikke hele navnet', /Velkommen til BenchBoss, Sten\./.test(h))
// Uten navn på profilen faller teksten tilbake på en upersonlig variant.
// Begge er riktige — men det skal ALLTID stå hvilket lag det gjelder.
ok('laget står i brødteksten', /(har gitt deg tilgang til|Du har fått tilgang til) Halsen IL/.test(h),
   (h.match(/[^>]*tilgang til[^<]*/)||[''])[0])
// Begge variantene, rett fra malen — profilen kan ha navn eller ikke.
const medNavn = inviteHtml('Sten','Halsen IL','Alexander Samnøy','123456','https://x')
const utenNavn = inviteHtml('Sten','Halsen IL','','123456','https://x')
ok('med navn: «X har gitt deg tilgang»', /Alexander Samnøy har gitt deg tilgang til Halsen IL/.test(medNavn))
ok('uten navn: upersonlig, men like tydelig', /Du har fått tilgang til Halsen IL/.test(utenNavn))
ok('koden er seks sifre', /letter-spacing:7px;font-weight:700">\d{6}</.test(h), (h.match(/">(\d{6})</)||[])[1]||'—')
ok('lenka peker på verify', /href="http[^"]*\/auth\/v1\/verify\?token=/.test(h))
ok('utløpet stemmer med innstillingen', /Gyldig i én time/.test(h))
ok('ingen emoji eller ikoner', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(h))
ok('ingen gradient på flater', !/gradient/i.test(h))

// 2. Samme kull med årgang → da er kullnavnet det riktige
sql(`update cohorts set birth_year=2018, name='Halsen G2018' where id='${skall}'`)
sql(`delete from cohort_members where email='${E}'`); sql(`delete from auth.users where email='${E}'`)
fanget=null
sv=await kall(skall)
ok('satt opp kull bruker kullnavnet', /Halsen G2018/.test(fanget?.subject||''), fanget?.subject)

// rydd
sql(`delete from cohort_members where cohort_id='${skall}'`); sql(`delete from coaches where cohort_id='${skall}'`)
sql(`delete from cohorts where id='${skall}'`)
sql(`delete from auth.users where email='${E}'`)
server.close()
console.log(feil?`\n${feil} FEIL`:'\nAlt OK')
