// Midlertidig: sjekker det nye «Nytt kull»-skjemaet i nettleseren.
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'
const API='http://127.0.0.1:54321', APP='http://localhost:5173'
const SVC='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const sql=q=>execSync(`docker exec -e PGPASSWORD=postgres supabase_db_halsen-dommerutlegg psql -U supabase_admin -h 127.0.0.1 -d postgres -qtAc "${q.replace(/"/g,'\\"')}"`).toString().trim()
let feil=0; const ok=(l,c,x='')=>{ if(!c) feil++; console.log(`${c?'OK  ':'FEIL'} ${l}${x?'  — '+x:''}`) }

// rydd tidligere kjøring
const gamle=sql(`select string_agg(quote_literal(id::text),',') from cohorts where club_id in (select id from clubs where name='Testklubben BK')`)
if (gamle){ sql(`update cohorts set active_season_id=null where id in (${gamle})`); for(const t of ['cohort_members','coaches','teams','seasons']) sql(`delete from ${t} where cohort_id in (${gamle})`); sql(`delete from cohorts where id in (${gamle})`) }
sql(`delete from clubs where name='Testklubben BK'`)

const l=await(await fetch(`${API}/auth/v1/admin/generate_link`,{method:'POST',headers:{apikey:SVC,Authorization:'Bearer '+SVC,'Content-Type':'application/json'},body:JSON.stringify({type:'magiclink',email:'alexander.samnoy@gmail.com'})})).json()
const b=await chromium.launch(); const c=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}); const p=await c.newPage()
const sidefeil=[]; p.on('pageerror',e=>sidefeil.push(e.message))
await p.goto(l.action_link.replace('http://localhost:3000',APP),{waitUntil:'networkidle'})
await p.waitForFunction(()=>!location.hash.includes('access_token'),null,{timeout:20000}).catch(()=>{})
await p.waitForTimeout(1200)
await p.goto(APP+'/admin/plattform',{waitUntil:'networkidle'}); await p.waitForTimeout(1200)
ok('plattformsida åpner', /Klubber og kull/.test(await p.locator('body').innerText()))

await p.getByRole('button',{name:'Nytt kull'}).click(); await p.waitForTimeout(400)
const skjema=await p.locator('.plattform-form').innerText()
ok('spør ikke om årskull', await p.locator('#nk-year').count()===0)
ok('spør ikke om spillform', !/Spillform|Omganger|Minutter per omgang/.test(skjema))
ok('spør ikke om lag', !/^Lag/m.test(skjema))
ok('spør ikke om kullnavn', !/Kullets navn/.test(skjema))
ok('sier hva treneren gjør', /settes av treneren/i.test(skjema), skjema.split('\n').find(r=>/settes av treneren/i.test(r))||'')
ok('spør om klubb og sesong', /Klubb/.test(skjema) && /Første sesong/.test(skjema))

await p.locator('#nk-club-name').fill('Testklubben BK')
await p.locator('#nk-club-short').fill('Test')
await p.getByRole('button',{name:/Opprett kull/}).click()
await p.waitForTimeout(2500)
const rad=sql(`select c.name||'|'||c.slug||'|'||coalesce(c.birth_year::text,'-')||'|'||c.players_on_pitch||'|'||(select count(*) from teams t where t.cohort_id=c.id)||'|'||(select coalesce(s.name,'-') from seasons s where s.id=c.active_season_id)||'|'||c.uses_referees from cohorts c join clubs cl on cl.id=c.club_id where cl.name='Testklubben BK'`)
const [navn,slug,ar,form,lag,sesong,dommere]=rad.split('|')
ok('kullet får midlertidig navn', navn==='Test – nytt kull', navn)
ok('slugen er unik per skall', /^nytt-kull-/.test(slug), slug)
ok('årskull står tomt', ar==='-', ar)
ok('spillform får NFF-default', form==='7', form+'er')
ok('ingen lag opprettet', lag==='0', lag)
ok('sesongen er satt', sesong!=='-', sesong)
// Dommere er en Halsen-greie. Nye kull starter uten.
ok('dommere er av for et nytt kull', dommere==='false', dommere)
ok('landet på Tilgang', p.url().includes('/admin/tilgang'), p.url())

// to skall i samme klubb skal ikke kollidere på slug
await p.goto(APP+'/admin/plattform',{waitUntil:'networkidle'}); await p.waitForTimeout(1000)
await p.getByRole('button',{name:'Nytt kull'}).click(); await p.waitForTimeout(300)
await p.locator('#nk-club').selectOption({label:'Testklubben BK'}); await p.waitForTimeout(200)
await p.getByRole('button',{name:/Opprett kull/}).click(); await p.waitForTimeout(2500)
ok('skall nr. 2 i samme klubb går gjennom', sql(`select count(*) from cohorts c join clubs cl on cl.id=c.club_id where cl.name='Testklubben BK'`)==='2')

await p.goto(APP+'/admin/plattform',{waitUntil:'networkidle'}); await p.waitForTimeout(1200)
const liste=await p.locator('.plattform-list').first().innerText().catch(()=>'')
const alle=await p.locator('body').innerText()
ok('lista sier at kullet venter på treneren', /Venter på treneren/.test(alle), (alle.match(/Test – nytt kull[\s\S]{0,40}/)||[''])[0].replace(/\n/g,' · '))
ok('ingen sidefeil', sidefeil.length===0, sidefeil[0]||'')
await b.close()
console.log(feil? `\n${feil} FEIL` : '\nAlt OK')
