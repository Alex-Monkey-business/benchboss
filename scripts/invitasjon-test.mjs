// Invitasjonsveiene i member-admin: ny konto, konto som finnes fra før, og
// «Send på nytt». Alle skal ende med en e-post der LENKA faktisk logger inn.
import { execSync } from 'node:child_process'
const API='http://127.0.0.1:54321', APP='http://localhost:5173', MAIL='http://127.0.0.1:54324'
const ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SVC='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const NY='invitasjonstest@example.com', GAMMEL='invitasjonstest2@example.com'
let feil=0; const ok=(l,c,x='')=>{ if(!c) feil++; console.log(`${c?'OK  ':'FEIL'} ${l}${x?'  — '+x:''}`) }
const sql=q=>execSync(`docker exec -e PGPASSWORD=postgres supabase_db_halsen-dommerutlegg psql -U supabase_admin -h 127.0.0.1 -d postgres -qtAc "${q.replace(/"/g,'\\"')}"`).toString().trim()
const H=a=>({apikey:ANON,Authorization:'Bearer '+a,'Content-Type':'application/json'})
async function token(epost){
  const l=await(await fetch(`${API}/auth/v1/admin/generate_link`,{method:'POST',headers:{apikey:SVC,Authorization:'Bearer '+SVC,'Content-Type':'application/json'},body:JSON.stringify({type:'magiclink',email:epost})})).json()
  const r=await fetch(l.action_link,{redirect:'manual'})
  return new URLSearchParams((r.headers.get('location')||'').split('#')[1]||'').get('access_token')
}
// Siste e-post til en adresse, og lenka i den
async function sisteLenke(epost){
  const m=await(await fetch(`${MAIL}/api/v1/messages?limit=50`)).json()
  const treff=(m.messages||[]).find(x=>(x.To||[]).some(t=>t.Address===epost))
  if(!treff) return null
  const tekst=await(await fetch(`${MAIL}/api/v1/message/${treff.ID}`)).json()
  const raw=(tekst.Text||'')+(tekst.HTML||'')
  const l=raw.match(/https?:\/\/[^\s"'<>]*verify[^\s"'<>]*/)
  return { emne: treff.Subject, lenke: l ? l[0].replace(/&amp;/g,'&') : null }
}
const virker=async lenke=>{
  const r=await fetch(lenke,{redirect:'manual'})
  const frag=(r.headers.get('location')||'')
  return frag.includes('access_token') ? 'ok' : frag.split('#')[1]?.slice(0,60) || String(r.status)
}

// rydd
const kull=sql(`select id from cohorts where name='Halsen G2015'`)
for (const e of [NY,GAMMEL]) { sql(`delete from cohort_members where email='${e}'`); sql(`delete from auth.users where email='${e}'`) }
sql(`delete from coaches where cohort_id='${kull}' and name in ('Invitasjonstest','Invitasjonstest To')`)
await fetch(`${MAIL}/api/v1/messages`,{method:'DELETE'})

const alex=await token('alexander.samnoy@gmail.com')
const kall=(b)=>fetch(`${API}/functions/v1/member-admin`,{method:'POST',headers:H(alex),body:JSON.stringify(b)}).then(async r=>({status:r.status,...await r.json()}))

// 1. Helt ny person
let sv=await kall({action:'invite',cohort_id:kull,name:'Invitasjonstest',email:NY,role:'coach',preferred_team:null})
ok('ny person inviteres', sv.status===200 && !sv.error, sv.error||sv.note||'ok')
let post=await sisteLenke(NY)
ok('e-post ut til ny person', !!post?.lenke, post?.emne||'ingen e-post')
ok('kontoen er bekreftet', sql(`select case when email_confirmed_at is null then 'UBEKREFTET' else 'bekreftet' end from auth.users where email='${NY}'`)==='bekreftet')
// Bekreftet konto, men IKKE aktivt medlem ennå — status flippes først når han
// faktisk logger inn. Sjekkes før lenka brukes, for lenka logger ham inn.
const st=sql(`select status from cohort_members where email='${NY}'`)
ok('medlemsraden står som invitert før han logger inn', st==='invited', st||'(ingen rad)')
let sjekk=await virker(post.lenke)
ok('LENKA VIRKER for ny person', sjekk==='ok', sjekk)
ok('medlemsraden aktiveres av innloggingen', sql(`select status from cohort_members where email='${NY}'`)==='active')

// 2. Samme e-post en gang til i samme kull
sv=await kall({action:'invite',cohort_id:kull,name:'Invitasjonstest',email:NY,role:'coach',preferred_team:null})
ok('dobbel invitasjon avvises', sv.status!==200 && /allerede/i.test(sv.error||''), sv.error||'')

// 3. Send på nytt. GoTrue har en frekvenssperre per adresse, så vi puster.
await new Promise(r=>setTimeout(r,3000))
await fetch(`${MAIL}/api/v1/messages`,{method:'DELETE'})
const medlem=sql(`select id from cohort_members where email='${NY}'`)
sv=await kall({action:'resend',member_id:medlem})
ok('«Send på nytt» går gjennom', sv.status===200 && !sv.error, sv.error||'ok')
post=await sisteLenke(NY)
ok('ny e-post ut', !!post?.lenke, post?.emne||'ingen')
sjekk=post?.lenke ? await virker(post.lenke) : 'ingen e-post'
ok('LENKA VIRKER etter Send på nytt', sjekk==='ok', sjekk)

// 4. Konto som finnes fra før (ubekreftet, slik gamle invitasjoner ble stående)
await fetch(`${API}/auth/v1/admin/users`,{method:'POST',headers:{apikey:SVC,Authorization:'Bearer '+SVC,'Content-Type':'application/json'},body:JSON.stringify({email:GAMMEL,email_confirm:false})})
ok('testkonto står ubekreftet', sql(`select case when email_confirmed_at is null then 'UBEKREFTET' else 'bekreftet' end from auth.users where email='${GAMMEL}'`)==='UBEKREFTET')
await fetch(`${MAIL}/api/v1/messages`,{method:'DELETE'})
sv=await kall({action:'invite',cohort_id:kull,name:'Invitasjonstest To',email:GAMMEL,role:'coach',preferred_team:null})
ok('eksisterende konto inviteres', sv.status===200 && !sv.error, sv.error||sv.note||'ok')
ok('den ubekreftede kontoen ble bekreftet', sql(`select case when email_confirmed_at is null then 'UBEKREFTET' else 'bekreftet' end from auth.users where email='${GAMMEL}'`)==='bekreftet')
post=await sisteLenke(GAMMEL)
ok('e-post ut til eksisterende konto', !!post?.lenke, post?.emne||'ingen')
sjekk=post?.lenke ? await virker(post.lenke) : 'ingen e-post'
ok('LENKA VIRKER for eksisterende konto', sjekk==='ok', sjekk)

// rydd
for (const e of [NY,GAMMEL]) { sql(`delete from cohort_members where email='${e}'`); sql(`delete from auth.users where email='${e}'`) }
sql(`delete from coaches where cohort_id='${kull}' and name in ('Invitasjonstest','Invitasjonstest To')`)
console.log(feil?`\n${feil} FEIL`:'\nAlt OK')
