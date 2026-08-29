import { chromium } from 'playwright'
import { execSync } from 'node:child_process'
const SVC='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const STAG='30064ef2-2a5d-4f62-aea9-3cf9a1f18726', HALSEN='af104bf3-02f4-4067-a0db-bf285f5d8f39'
const ok=(l,c,x='')=>console.log(`${c?'OK  ':'FEIL'} ${l}${x?'  — '+x:''}`)
const sql=q=>execSync(`docker exec -e PGPASSWORD=postgres supabase_db_halsen-dommerutlegg psql -U supabase_admin -h 127.0.0.1 -d postgres -qtc "${q}"`).toString().trim()

const link=await(await fetch('http://127.0.0.1:54321/auth/v1/admin/generate_link',{method:'POST',headers:{apikey:SVC,Authorization:'Bearer '+SVC,'Content-Type':'application/json'},body:JSON.stringify({type:'magiclink',email:'alexander.samnoy@gmail.com'})})).json()
const b=await chromium.launch(); const c=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}); const p=await c.newPage()
const feil=[]; p.on('pageerror',e=>feil.push(e.message))
await p.goto(link.action_link,{waitUntil:'networkidle'})

async function gaTil(kull, sti='/'){
  await p.evaluate(id=>localStorage.setItem('bb_active_cohort',id),kull)
  await p.goto('http://localhost:5173'+sti,{waitUntil:'networkidle'}); await p.waitForTimeout(900)
}
const adminRader=async()=>(await p.$$eval('.admin-row__label',e=>e.map(x=>x.textContent.trim())))

// --- PÅ (default) ---
await gaTil(STAG,'/admin')
const pa=await adminRader()
ok('med dommere PÅ finnes Dommere-raden', pa.includes('Dommere'), pa.join(' · '))
ok('med dommere PÅ heter raden Sesongoppgjør', pa.includes('Sesongoppgjør'))

// --- Slå AV via UI ---
await p.getByRole('radio',{name:'Trenger ikke'}).click()
await p.waitForTimeout(1200)
ok('bryteren lagres i basen', sql(`select uses_referees from cohorts where id='${STAG}'`)==='f', sql(`select uses_referees from cohorts where id='${STAG}'`))

await gaTil(STAG,'/admin')
const av=await adminRader()
ok('Dommere-raden er borte', !av.includes('Dommere'), av.join(' · '))
ok('sesongraden heter «Sesong» og står igjen', av.includes('Sesong') && !av.includes('Sesongoppgjør'))

await gaTil(STAG,'/admin/dommere')
ok('/admin/dommere sender til Admin', p.url().endsWith('/admin'), p.url())

await gaTil(STAG,'/admin/dommerutlegg')
const settlTekst=await p.locator('.desktop-container').innerText()
ok('«Avslutt sesong» er fortsatt tilgjengelig', /Avslutt sesong/.test(settlTekst))
ok('utlegg-tabellen er skjult', !/Utlegg per trener/.test(settlTekst))

// --- Halsen skal være helt urørt ---
await gaTil(HALSEN,'/admin')
const h=await adminRader()
ok('Halsen har fortsatt Dommere og Sesongoppgjør', h.includes('Dommere') && h.includes('Sesongoppgjør'), h.join(' · '))

// --- Slå PÅ igjen ---
await gaTil(STAG,'/admin')
await p.getByRole('radio',{name:'Vi skaffer dommer'}).click()
await p.waitForTimeout(1200)
ok('kan slås på igjen', sql(`select uses_referees from cohorts where id='${STAG}'`)==='t')

ok('ingen sidefeil underveis', feil.length===0, feil.join(' | ') || '')
await b.close()
