// Utløpt sesjon som ikke kan fornyes (16. nov: PWA-en hang på lasteskjermen).
// Appen skal sende til innlogging, ikke stå og vente.
//   QA_APP=http://localhost:5176 node scripts/dod-sesjon-test.mjs
import { chromium } from 'playwright'
const API = process.env.QA_API || 'http://127.0.0.1:54321'
const APP = process.env.QA_APP || 'http://localhost:5176'
const SVC = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
let feilet = 0
const ok = (l, c, x = '') => { if (!c) feilet++; console.log(`${c ? 'OK  ' : 'FEIL'} ${l}${x ? '  — ' + x : ''}`) }
const b = await chromium.launch()
try {
  const r = await fetch(`${API}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email: 'alexander.samnoy@gmail.com' }) })
  const j = await r.json(); const tok = j.hashed_token || j.properties?.hashed_token
  const c = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await c.newPage()
  await p.goto(`${APP}/auth/klar?t=${tok}&type=magiclink`)
  await p.getByRole('button', { name: /Logg inn/ }).click()
  await p.waitForURL(u => !/\/auth|\/login/.test(u.pathname), { timeout: 20000 })
  await p.locator('.hjem-delinn[href="/del-inn"]').waitFor({ timeout: 15000 })
  // Ødelegg sesjonen: utløpt access-token og en refresh-token serveren ikke kjenner.
  await p.evaluate(() => {
    const k = Object.keys(localStorage).find(n => /-auth-token$/.test(n))
    const s = JSON.parse(localStorage.getItem(k))
    s.expires_at = Math.floor(Date.now() / 1000) - 3600
    s.refresh_token = 'ugyldig-' + Date.now()
    localStorage.setItem(k, JSON.stringify(s))
  })
  await p.reload()
  const tilLogin = await p.waitForURL(u => /\/login/.test(u.pathname), { timeout: 15000 }).then(() => true).catch(() => false)
  const tekst = (await p.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 200)
  await p.screenshot({ path: (process.env.QA_OUT || '/tmp') + '/dod-sesjon.png' })
  const auth = await p.evaluate(() => { const k = Object.keys(localStorage).find(n => /-auth-token$/.test(n)); return k ? 'token finnes' : 'token borte' })
  // Sesjonen skal ryddes (ikke holdes som «offline»), så appen ikke står
  // innlogget uten å få hentet noe.
  ok('Død sesjon ryddes bort', tilLogin || auth === 'token borte', p.url() + ' · ' + auth + ' · ' + tekst)
} catch (e) { feilet++; console.log('FEIL', e.message) } finally { await b.close() }
console.log(feilet ? `\n${feilet} feilet` : '\nAlt ok')
process.exit(feilet ? 1 : 0)
