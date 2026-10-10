// Bilder av hele treningsflyten for øyekontroll. Mot lokal base.
//   QA_APP=http://localhost:5179 UT=/tmp/bilder node scripts/trening-bilder.mjs
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'
const API = process.env.QA_API || 'http://127.0.0.1:54321'
const APP = process.env.QA_APP || 'http://localhost:5179'
const UT = process.env.UT || '/tmp/bilder'
const B = Number(process.env.B || 375)
const SVC = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const KULL = 'af104bf3-02f4-4067-a0db-bf285f5d8f39'
const sql = q => execSync(`docker exec -e PGPASSWORD=postgres supabase_db_halsen-dommerutlegg psql -U postgres -Atc ${JSON.stringify(q)}`).toString().trim()
const vent = ms => new Promise(r => setTimeout(r, ms))
const UKEDAG = new Date().getDay() || 7
const DAG = sql(`select id from training_sessions where cohort_id='${KULL}' order by jsonb_array_length(drills) desc, position limit 1`)
const VD = sql(`select coalesce(weekday::text,'null') from training_sessions where id='${DAG}'`)
sql(`update training_sessions set weekday=${UKEDAG} where id='${DAG}'`)
sql(`delete from training_runs where session_id='${DAG}'`)
// Nivåer så gjengene blir ekte: annenhver tredjedel A, B, C.
const HADDE_NIVA = sql(`select count(*) from player_levels where cohort_id='${KULL}'`) !== '0'
if (!HADDE_NIVA) sql(`insert into player_levels (player_id, cohort_id, level) select id, cohort_id, (array['A','B','B','C'])[1 + (row_number() over (order by name))::int % 4] from players where cohort_id='${KULL}'`)
const b = await chromium.launch()
const r = await fetch(`${API}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email: 'alexander.samnoy@gmail.com' }) })
const tok = (await r.json()).hashed_token
const ctx = await b.newContext({ viewport: { width: B, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
const p = await ctx.newPage()
const feil = []; p.on('pageerror', e => feil.push(e.message))
await p.goto(`${APP}/auth/klar?t=${tok}&type=magiclink`)
await p.getByRole('button', { name: /Logg inn/ }).click()
await p.waitForURL(u => !/\/auth|\/login/.test(u.pathname), { timeout: 20000 })
await p.evaluate(k => localStorage.setItem('bb_active_cohort', k), KULL)
let n = 0
const bilde = async (navn, full = false) => { await vent(600); await p.screenshot({ path: `${UT}/${String(++n).padStart(2, '0')}-${navn}.png`, fullPage: full }) }
const steg = async (navn, fn) => { try { await fn() } catch (e) { console.log('STEG FEILET', navn, e.message.split('\n')[0]) } }
try {
  await p.goto(`${APP}/trening`); await p.locator('.dag').first().waitFor({ timeout: 15000 })
  await bilde('uka', true)
  await p.goto(`${APP}/trening/dag/${DAG}`); await p.locator('.steg__hode').first().waitFor()
  await bilde('dagen', true)
  await steg('rigg', async () => { await p.locator('.rigg-rad').click(); await bilde('rigg-ark'); await p.keyboard.press('Escape') })
  await vent(400)
  await p.goto(`${APP}/trening/okt/${DAG}`); await p.locator('.oppg__navn').first().waitFor()
  await bilde('oppmote'); await bilde('oppmote-hel', true)
  for (const i of [1, 4, 7]) await p.locator('.oppg__navn').nth(i).click()
  await bilde('oppmote-tre-borte')
  await p.locator(process.env.START || '.okt__start').click()
  await p.locator('.rad').first().waitFor(); await bilde('plan'); await bilde('plan-hel', true)
  await steg('ovelse', async () => {
    await p.locator('.rad').nth(1).click(); await bilde('ovelse')
    await p.keyboard.press('Escape'); await vent(400)
  })
  await steg('endre', async () => {
    await p.locator('.fase__endre').first().click(); await vent(500)
    await p.locator('.brikke').nth(2).click(); await bilde('endre-gjengene')
    await p.keyboard.press('Escape'); await vent(400)
  })
  await steg('kom-for-sent', async () => {
    await p.locator('.okt__her').click(); await vent(500)
    await p.locator('.oppg__navn--borte').first().click(); await bilde('kom-for-sent')
    await p.keyboard.press('Escape'); await vent(400)
  })
  await steg('ekstra', async () => { if (process.env.EKSTRA) await eval(process.env.EKSTRA) })
  await p.goto(`${APP}/trening/dag/${DAG}`); await p.locator('.steg__hode').first().waitFor(); await bilde('dagen-etter')
  await p.goto(`${APP}/statistikk`); await vent(1500); await bilde('statistikk', true)
} finally {
  console.log('sidefeil:', feil.length ? feil.join(' | ') : 'ingen')
  if (!process.env.BEHOLD) sql(`delete from training_runs where session_id='${DAG}'`)
  sql(`update training_sessions set weekday=${VD} where id='${DAG}'`)
  if (!HADDE_NIVA) sql(`delete from player_levels where cohort_id='${KULL}'`)
  await b.close()
}
