// Oppfører arkene seg som i en app? Tilbake-knappen lukker øverste lag først,
// dra-ned glir ut uten å sprette, bakgrunnen blekner mens du drar, og
// historikken får ingen døde steg. Mot lokal base, ekte touch via CDP.
//
//   QA_APP=http://localhost:5179 node scripts/native-qa.mjs
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'
const API = process.env.QA_API || 'http://127.0.0.1:54321'
const APP = process.env.QA_APP || 'http://localhost:5174'
const SVC = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const KULL = 'af104bf3-02f4-4067-a0db-bf285f5d8f39'
let feilet = 0
const ok = (l, c, x = '') => { if (!c) feilet++; console.log(`${c ? 'OK  ' : 'FEIL'} ${l}${x ? '  — ' + x : ''}`); return c }
const sql = q => execSync(`docker exec -e PGPASSWORD=postgres supabase_db_halsen-dommerutlegg psql -U postgres -Atc ${JSON.stringify(q)}`).toString().trim()
const vent = ms => new Promise(r => setTimeout(r, ms))

const UKEDAG = new Date().getDay() || 7
const DAG = sql(`select id from training_sessions where cohort_id='${KULL}' order by jsonb_array_length(drills) desc, position limit 1`)
const VD = sql(`select coalesce(weekday::text,'null') from training_sessions where id='${DAG}'`)
sql(`update training_sessions set weekday=${UKEDAG} where id='${DAG}'`)
sql(`delete from training_runs where session_id='${DAG}'`)

const b = await chromium.launch()
const r = await fetch(`${API}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email: 'alexander.samnoy@gmail.com' }) })
const tok = (await r.json()).hashed_token
const ctx = await b.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
const p = await ctx.newPage()
const feil = []
p.on('pageerror', e => feil.push(e.message))
await p.goto(`${APP}/auth/klar?t=${tok}&type=magiclink`)
await p.getByRole('button', { name: /Logg inn/ }).click()
await p.waitForURL(u => !/\/auth|\/login/.test(u.pathname), { timeout: 20000 })
await p.evaluate(k => localStorage.setItem('bb_active_cohort', k), KULL)
const cdp = await ctx.newCDPSession(p)

const arkApent = async () => (await p.locator('.ds-sheet').count()) > 0
const tilbake = async () => { await p.goBack({ waitUntil: 'commit' }).catch(() => {}); await vent(500) }
const sti = () => new URL(p.url()).pathname

// Dra med fingeren fra (x, y) dy piksler ned over n bilder, og slipp.
async function dra(x, y, dy, n = 12, msPer = 16) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  for (let i = 1; i <= n; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + Math.round(dy * i / n) }] })
    await vent(msPer)
  }
}
async function slipp() { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }) }

try {
  // ── Uka → dagen → økta, og tilbake ──
  await p.goto(`${APP}/trening`)
  await p.locator('.dag').first().waitFor({ timeout: 15000 })
  await p.locator(`#dag-${DAG} .dag__toggle`).click()
  await p.waitForURL(/\/trening\/dag\//)
  await p.locator('.okt-start').click()
  await p.locator('.oppg__navn').first().waitFor()
  await p.locator('.okt__start').click()
  await p.locator('.rad').first().waitFor()
  await vent(400)

  // Tilbake lukker arket, ikke siden.
  await p.locator('.rad').first().click()
  await p.locator('.ds-sheet__footer').waitFor()
  await vent(400)
  await tilbake()
  ok('tilbake lukker øvelsesarket', !(await arkApent()))
  ok('og blir på økta', sti() === `/trening/okt/${DAG}` && await p.locator('.rad').count() > 0, sti())

  // Endre gjengene: tilbake lukker arket, ikke siden.
  await p.locator('.fase__endre').first().click()
  await p.locator('.brikke').first().waitFor()
  await vent(400)
  await p.locator('.brikke').first().click()
  await tilbake()
  ok('tilbake lukker Endre-arket', !(await arkApent()) && sti() === `/trening/okt/${DAG}`)

  // Lukket med krysset: neste tilbake går rett til dagen, ingen døde steg.
  await p.locator('.rad').first().click()
  await p.locator('.ds-sheet__footer').waitFor()
  await vent(400)
  await p.locator('.ds-sheet__close').click()
  await vent(500)
  ok('krysset lukker', !(await arkApent()))
  await p.locator('.rad').nth(1).click()
  await p.locator('.ds-sheet__footer').waitFor()
  await vent(400)
  await p.keyboard.press('Escape')
  await vent(500)

  // Nullstill-dialog → tilbake. Oppmøte-ark → tilbake.
  await p.locator('.okt__slett').click()
  await vent(300)
  await tilbake()
  ok('tilbake lukker nullstill-dialogen, oppmøtet står', (await p.locator('.ds-dialog').count()) === 0 && await p.locator('.rad').count() > 0)
  await p.locator('.okt__her').click()
  await p.locator('.oppg__navn').first().waitFor()
  await vent(400)
  await tilbake()
  ok('tilbake lukker oppmøte-arket', !(await arkApent()) && sti() === `/trening/okt/${DAG}`)

  await tilbake()
  ok('neste tilbake går rett til dagen (ingen døde steg)', sti() === `/trening/dag/${DAG}`, sti())
  await tilbake()
  ok('og så til uka', sti() === '/trening', sti())

  // ── Dra ned ──
  await p.goto(`${APP}/trening/okt/${DAG}`)
  await p.locator('.rad').first().waitFor()
  await p.locator('.rad').first().click()
  await p.locator('.ds-sheet__footer').waitFor()
  await vent(500)
  const hode = await p.locator('.ds-sheet__header').boundingBox()
  const x = Math.round(hode.x + hode.width / 2), y = Math.round(hode.y + hode.height / 2)
  const top0 = (await p.locator('.ds-sheet').boundingBox()).y

  // Litt dra, sakte: glir tilbake, forblir åpent.
  await dra(x, y, 60, 12, 30)
  const bg0 = await p.evaluate(() => getComputedStyle(document.querySelector('.ds-sheet-overlay')).backgroundColor)
  await slipp()
  await vent(450)
  ok('kort dra glir tilbake', await arkApent() && Math.abs((await p.locator('.ds-sheet').boundingBox()).y - top0) < 2)

  // Dra langt: bakgrunnen blekner underveis.
  await dra(x, y, 320, 14, 16)
  const bg1 = await p.evaluate(() => getComputedStyle(document.querySelector('.ds-sheet-overlay')).backgroundColor)
  ok('bakgrunnen blekner mens du drar', bg1 !== bg0, `${bg0} → ${bg1}`)
  // Mål arkets topp hvert bilde etter slipp: skal bare gå nedover.
  await p.evaluate(() => {
    window.__spor = []
    const t0 = performance.now()
    const f = () => {
      const el = document.querySelector('.ds-sheet')
      if (el) window.__spor.push(Math.round(el.getBoundingClientRect().top))
      if (performance.now() - t0 < 700) requestAnimationFrame(f)
    }
    requestAnimationFrame(f)
  })
  await slipp()
  await vent(800)
  const spor = await p.evaluate(() => window.__spor)
  let hopp = 0
  for (let i = 1; i < spor.length; i++) if (spor[i] < spor[i - 1] - 2) hopp = Math.max(hopp, spor[i - 1] - spor[i])
  ok('dra-ned glir ut uten å sprette opp', hopp === 0, `største hopp opp: ${hopp}px, spor ${spor.slice(0, 8).join(',')}…`)
  ok('og arket er lukket', !(await arkApent()))
  await tilbake()
  ok('dra-lukket: ett tilbake forlater økta (ingen døde steg)', sti() === '/trening', sti())

  // Lenke inne i et ark: til banken og tilbake skal gi dagen, uten dødt steg.
  await p.goto(`${APP}/trening/dag/${DAG}`)
  await p.locator('.steg__hode').first().waitFor()
  await p.locator('.steg__hode').first().click()
  await p.locator('.ovelse-sheet__bank').waitFor()
  await vent(400)
  await p.locator('.ovelse-sheet__bank').click()
  await p.waitForURL(/\/trening\/ovelser/, { timeout: 5000 }).catch(() => {})
  ok('lenken i arket går til banken', sti() === '/trening/ovelser', sti())
  await tilbake()
  ok('tilbake fra banken gir dagen, arket lukket', sti() === `/trening/dag/${DAG}` && !(await arkApent()), sti())
  await tilbake()
  ok('neste tilbake forlater dagen (ingen døde steg)', sti() !== `/trening/dag/${DAG}`, sti())

  // Siden er ikke låst etter alt dette.
  ok('ingen scroll-lås hengende', await p.evaluate(() => document.body.style.position === ''))
} finally {
  ok('ingen sidefeil', feil.length === 0, feil.slice(0, 3).join(' | '))
  sql(`delete from training_runs where session_id='${DAG}'; update training_sessions set weekday=${VD} where id='${DAG}'`)
  await b.close()
}
console.log(feilet ? `${feilet} feil` : 'Alt grønt')
process.exit(feilet ? 1 : 0)
