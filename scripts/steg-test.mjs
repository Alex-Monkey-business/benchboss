import { chromium } from 'playwright'
const APP='http://localhost:5173'
const SVC='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const STAG='30064ef2-2a5d-4f62-aea9-3cf9a1f18726'
const ok=(l,c,x='')=>console.log(`${c?'OK  ':'FEIL'} ${l}${x?'  — '+x:''}`)
const link=await(await fetch('http://127.0.0.1:54321/auth/v1/admin/generate_link',{method:'POST',headers:{apikey:SVC,Authorization:`Bearer ${SVC}`,'Content-Type':'application/json'},body:JSON.stringify({type:'magiclink',email:'alexander.samnoy@gmail.com'})})).json()
const browser=await chromium.launch()
const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})
const page=await ctx.newPage()
await page.goto(link.action_link,{waitUntil:'networkidle'})
await page.evaluate(id=>localStorage.setItem('bb_active_cohort',id),STAG)
await page.goto(APP+'/',{waitUntil:'networkidle'})
await page.getByRole('button',{name:/Legg inn spillerne/}).click()
await page.locator('#onb-paste').waitFor()

const hode=async()=>[(await page.locator('.onb-steg').textContent()).trim(), (await page.locator('.ds-sheet__title').textContent()).trim()].join(' · ')
ok('overskriften ER laget', (await hode())==='LAG 1 AV 3 · Grønn'||(await hode())==='Lag 1 av 3 · Grønn', await hode())
ok('ingen lag-chips på steget', (await page.locator('.ds-sheet .onb-chip').count())===0)

await page.locator('#onb-paste').fill('Ola Nordmann\nKari Nordmann\nPer Hansen')
await page.waitForTimeout(200)
ok('knappen nevner laget', /Legg inn 3 på Grønn/.test((await page.locator('.onb-actions .ds-btn--primary').textContent()).trim()))

// fjern én rad
await page.locator('.onb-player__fjern').first().click()
await page.waitForTimeout(150)
ok('rad kan fjernes fra forhåndsvisningen', (await page.locator('.onb-player').count())===2)

await page.locator('.onb-actions .ds-btn--primary').click()
await page.waitForTimeout(800)
ok('steget går videre og overskriften følger', (await hode()).endsWith('Gul'), await hode())
ok('feltet er tomt på nytt steg', (await page.locator('#onb-paste').inputValue())==='')

// hopp over Gul
await page.getByRole('button',{name:'Hopp over'}).click()
await page.waitForTimeout(400)
ok('«Hopp over» går til neste lag', (await hode()).endsWith('Hvit'), await hode())

await page.locator('#onb-paste').fill('Sigurd Halvorsen')
await page.waitForTimeout(200)
await page.locator('.onb-actions .ds-btn--primary').click()
await page.waitForTimeout(900)
const apent=await page.locator('.onb-steg').count()
ok('arket lukker seg — et hoppet lag mases det ikke om', apent===0)

await page.waitForTimeout(400)
const kortTekst=await page.getByRole('button',{name:/Legg inn spillerne/}).textContent().catch(()=>'')
ok('kortet på Hjem sier hvilket lag som mangler', /Gul/.test(kortTekst), kortTekst.replace(/\s+/g,' ').trim())
await browser.close()
