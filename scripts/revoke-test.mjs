// Revoke: `node scripts/revoke-test.mjs`
//
// Å fjerne tilgang satte bare status='revoked'. Trenerraden skulle overleve —
// den er identiteten expenses.paid_by og match_coaches peker på, og historikk
// skal ikke forsvinne fordi noen slutter. Men lagkoblingen overlevde også, og
// den er ikke historikk for sesongen som går: den er dagens tropp.
//
// En tilbakekalt testbruker sto som trener på Grønn i Høst 2026 og var synlig
// for hele trenerteamet. Ingen visste at raden måtte fjernes for hånd.
//
// Skillet testen holder fast på: en OPPGJORT sesong husker hvem som trente
// laget. En ÅPEN sesong gjør det ikke.
//
// Krever `supabase start`. Kjører mot den lokale edge-funksjonen, ikke prod.
import { execSync } from 'node:child_process'

const API='http://127.0.0.1:54321'
const SVC='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const sql = q => execSync(`docker exec -e PGPASSWORD=postgres supabase_db_halsen-dommerutlegg psql -U supabase_admin -h 127.0.0.1 -d postgres -qtAc "${q.replace(/"/g,'\\"')}"`).toString().trim()

let feil = 0
const ok = (l,c,x='') => { if(!c) feil++; console.log(`${c?'OK  ':'FEIL'} ${l}${x?'  — '+x:''}`) }

const KULL = sql("select c.id from cohorts c where exists (select 1 from teams t where t.cohort_id=c.id) and exists (select 1 from cohort_members m where m.cohort_id=c.id and m.role='admin' and m.status='active') order by (select count(*) from matches m2 where m2.cohort_id=c.id) desc limit 1")
const ADMIN = sql("select profile_id from cohort_members where cohort_id='"+KULL+"' and role='admin' and status='active' limit 1")

// Ryddig utgangspunkt
sql(`delete from cohort_members where cohort_id='${KULL}' and email='revoke-test@example.com'`)
sql(`delete from team_coaches where coach_id in (select id from coaches where cohort_id='${KULL}' and name='Revoke Test')`)
sql(`delete from coaches where cohort_id='${KULL}' and name='Revoke Test'`)

// En åpen og en oppgjort sesong — testen lager sine egne, så den ikke er
// avhengig av hva som tilfeldigvis ligger i den lokale basen.
sql(`delete from team_coaches where season_id in (select id from seasons where cohort_id='${KULL}' and name like 'RT-%')`)
sql(`delete from seasons where cohort_id='${KULL}' and name like 'RT-%'`)
const APEN = sql(`insert into seasons (cohort_id, name, status) values ('${KULL}','RT-apen','active') returning id`)
const OPPGJORT = sql(`insert into seasons (cohort_id, name, status, settled_at) values ('${KULL}','RT-oppgjort','active', now()) returning id`)
const LAG = sql(`select id from teams where cohort_id='${KULL}' limit 1`)

// Trener + koblinger i BEGGE sesonger
const COACH = sql(`insert into coaches (cohort_id, name) values ('${KULL}','Revoke Test') returning id`)
const MEMBER = sql(`insert into cohort_members (cohort_id, role, status, coach_id, name, email, preferred_team)
  values ('${KULL}','coach','active','${COACH}','Revoke Test','revoke-test@example.com','gronn') returning id`)
sql(`insert into team_coaches (cohort_id, team_id, coach_id, season_id) values ('${KULL}','${LAG}','${COACH}','${APEN}')`)
sql(`insert into team_coaches (cohort_id, team_id, coach_id, season_id) values ('${KULL}','${LAG}','${COACH}','${OPPGJORT}')`)
// Historikk som MÅ overleve
sql(`insert into match_coaches (cohort_id, match_id, coach_id) select '${KULL}', id, '${COACH}' from matches where cohort_id='${KULL}' limit 1`)

ok('utgangspunkt: 2 lagkoblinger', sql(`select count(*) from team_coaches where coach_id='${COACH}'`) === '2')

const token = await (async () => {
  const l = await (await fetch(`${API}/auth/v1/admin/generate_link`,{method:'POST',headers:{apikey:SVC,Authorization:'Bearer '+SVC,'Content-Type':'application/json'},body:JSON.stringify({type:'magiclink',email:sql(`select email from profiles where id='${ADMIN}'`)})})).json()
  const r = await fetch(l.action_link,{redirect:'manual'})
  return new URLSearchParams((r.headers.get('location')||'').split('#')[1]||'').get('access_token')
})()

const res = await fetch(`${API}/functions/v1/member-admin`,{
  method:'POST',
  headers:{apikey:SVC,Authorization:'Bearer '+token,'Content-Type':'application/json'},
  body:JSON.stringify({action:'revoke',member_id:MEMBER})
})
const svar = await res.json()
ok('revoke gikk gjennom', !!svar.ok, JSON.stringify(svar).slice(0,120))

ok('status er revoked', sql(`select status from cohort_members where id='${MEMBER}'`) === 'revoked')
ok('preferred_team er nullet', sql(`select coalesce(preferred_team,'NULL') from cohort_members where id='${MEMBER}'`) === 'NULL')
ok('lagkobling i APEN sesong er borte', sql(`select count(*) from team_coaches where coach_id='${COACH}' and season_id='${APEN}'`) === '0')
ok('lagkobling i OPPGJORT sesong star igjen', sql(`select count(*) from team_coaches where coach_id='${COACH}' and season_id='${OPPGJORT}'`) === '1')
ok('trenerraden lever', sql(`select count(*) from coaches where id='${COACH}'`) === '1')
ok('kamphistorikken lever', sql(`select count(*) from match_coaches where coach_id='${COACH}'`) === '1')

// Rydd
sql(`delete from match_coaches where coach_id='${COACH}'`)
sql(`delete from team_coaches where coach_id='${COACH}'`)
sql(`delete from cohort_members where id='${MEMBER}'`)
sql(`delete from coaches where id='${COACH}'`)
sql(`delete from seasons where cohort_id='${KULL}' and name like 'RT-%'`)

console.log(feil ? `\n${feil} FEIL` : '\nAlt grønt.')
process.exit(feil ? 1 : 0)
