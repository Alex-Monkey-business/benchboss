// Invitasjonen skal gå ut som VÅR e-post gjennom Resend — ikke som Supabase
// sin innloggingsmal. Krever at edge-funksjonen kjører med RESEND_API_KEY:
//   npx supabase functions serve --env-file <fil med RESEND_API_KEY>
import { execSync } from 'node:child_process'
const API='http://127.0.0.1:54321', MAIL='http://127.0.0.1:54324'
const ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SVC='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
// Resend sin testadresse: alltid akseptert, ingen ekte innboks.
const E='delivered@resend.dev'
let feil=0; const ok=(l,c,x='')=>{ if(!c) feil++; console.log(`${c?'OK  ':'FEIL'} ${l}${x?'  — '+x:''}`) }
const sql=q=>execSync(`docker exec -e PGPASSWORD=postgres supabase_db_halsen-dommerutlegg psql -U supabase_admin -h 127.0.0.1 -d postgres -qtAc "${q.replace(/"/g,'\\"')}"`).toString().trim()
const rydd=()=>{ sql(`delete from cohort_members where email='${E}'`); sql(`delete from auth.users where email='${E}'`); sql(`delete from coaches where name='Resendtest'`) }

rydd()
await fetch(`${MAIL}/api/v1/messages`,{method:'DELETE'})
const kull=sql(`select id from cohorts where name='Halsen G2015'`)
const l=await(await fetch(`${API}/auth/v1/admin/generate_link`,{method:'POST',headers:{apikey:SVC,Authorization:'Bearer '+SVC,'Content-Type':'application/json'},body:JSON.stringify({type:'magiclink',email:'alexander.samnoy@gmail.com'})})).json()
const t=new URLSearchParams(((await fetch(l.action_link,{redirect:'manual'})).headers.get('location')||'').split('#')[1]||'').get('access_token')
const r=await fetch(`${API}/functions/v1/member-admin`,{method:'POST',headers:{apikey:ANON,Authorization:'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify({action:'invite',cohort_id:kull,name:'Resendtest',email:E,role:'coach',preferred_team:null})})
const sv=await r.json()
ok('invitasjonen går gjennom', r.status===200 && !sv.error, sv.error||'ok')
ok('ingen advarsel om at e-posten ikke gikk ut', !sv.note, sv.note||'—')
// Faller den tilbake på Supabase-malen, havner e-posten i Mailpit. Gjør den
// ikke det, gikk den ut gjennom Resend.
const m=await(await fetch(`${MAIL}/api/v1/messages?limit=50`)).json()
const iMailpit=(m.messages||[]).some(x=>(x.To||[]).some(a=>a.Address===E))
ok('e-posten gikk gjennom Resend, ikke Supabase-malen', !iMailpit, iMailpit?'lå i Mailpit — fallbacken kjørte':'ikke i Mailpit')
rydd()
console.log(feil?`\n${feil} FEIL`:'\nAlt OK')
