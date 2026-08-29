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
await page.getByRole('button',{name:/Har du en fil/}).click()

await page.setInputFiles('input[type=file]', 'spillere.xlsx')
await page.waitForTimeout(900)

const rader = await page.$$eval('.onb-player', els => els.map(e => ({
  navn: e.querySelector('.onb-player__name').textContent.trim(),
  lag: e.querySelector('.onb-player__team')?.textContent.trim(),
  ukjent: e.querySelector('.onb-player__ukjent')?.textContent.trim() || ''
})))
console.log(rader.map(r => `  ${r.navn.padEnd(34)} → ${r.lag}${r.ukjent ? '   ' + r.ukjent : ''}`).join('\n'))

ok('filen åpner sin egen flate', (await page.locator('.ds-sheet__title').textContent()).trim()==='Fra fil')
ok('alle 7 radene er lest', rader.length===7, `${rader.length} rader`)
ok('«Grønn» og «gronn» treffer samme lag', rader[0].lag==='Grønn' && rader[1].lag==='Grønn')
ok('«Stag G9 Gul» og «GUL» treffer Gul', rader[2].lag==='Gul' && rader[3].lag==='Gul')
ok('«Hvit» treffer Hvit', rader[4].lag==='Hvit' && rader[5].lag==='Hvit')
ok('ukjent lag gjettes IKKE', rader[6].lag==='Velg lag', rader[6].lag)
ok('ukjent lag forklares på raden', /Rosa/.test(rader[6].ukjent), rader[6].ukjent)

const knapp = page.locator('.onb-actions .ds-btn--primary')
ok('lagring er sperret mens en rad mangler lag', await knapp.isDisabled())

// plukk lag på den ukjente raden
await page.locator('.onb-player__team').nth(6).click()
await page.waitForTimeout(200)
await page.locator('.onb-lagvalg--rad .onb-chip', { hasText: 'Hvit' }).first().click()
await page.waitForTimeout(200)
ok('lagring åpnes når alle rader har lag', await knapp.isEnabled())

await knapp.click()
await page.waitForTimeout(1200)
const kortIgjen=await page.getByRole('button',{name:/Legg inn spillerne/}).count()
ok('hele kullet er dekket av én fil', kortIgjen===0)
await browser.close()
