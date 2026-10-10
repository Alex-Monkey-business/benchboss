// Mørk modus: hver side i mørkt tema, med bilde og kontrastmåling på all
// synlig tekst. Mot lokal base. FEIL = tekst under WCAG AA (4,5:1, eller 3:1
// for stor tekst), eller lyse flater som lyser opp en mørk side.
//   QA_APP=http://localhost:5179 node scripts/morkt-qa.mjs
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'
const API = process.env.QA_API || 'http://127.0.0.1:54321'
const APP = process.env.QA_APP || 'http://localhost:5174'
const OUT = process.env.QA_OUT || '/tmp/morkt'
const TEMA = process.env.QA_TEMA || 'dark'
const SVC = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const KULL = 'af104bf3-02f4-4067-a0db-bf285f5d8f39'
const sql = q => execSync(`docker exec -e PGPASSWORD=postgres supabase_db_halsen-dommerutlegg psql -U postgres -Atc ${JSON.stringify(q)}`).toString().trim()
const vent = ms => new Promise(r => setTimeout(r, ms))
execSync(`mkdir -p ${OUT}`)

const spiller = sql(`select id from players where cohort_id='${KULL}' order by name limit 1`)
const trener = sql(`select id from coaches where cohort_id='${KULL}' order by name limit 1`)
const dag = sql(`select id from training_sessions where cohort_id='${KULL}' and jsonb_array_length(drills) > 0 order by position limit 1`)
const spilt = sql(`select id from matches where cohort_id='${KULL}' and home_score is not null order by match_date desc limit 1`)
const neste = sql(`select id from matches where cohort_id='${KULL}' and home_score is null and match_date >= current_date order by match_date limit 1`)

const SIDER = [
  ['hjem', '/'],
  ['kamper', '/kamper'],
  ['kamp-spilt', `/kamp/${spilt}`],
  ['kamp-neste', `/kamp/${neste}`],
  ['statistikk', '/statistikk'],
  ['spiller', `/spiller/${spiller}`],
  ['trener', `/trener/${trener}`],
  ['trening', '/trening'],
  ['trening-dag', `/trening/dag/${dag}`],
  ['okt', `/trening/okt/${dag}`],
  ['ovelser', '/trening/ovelser'],
  ['handbok', '/trening/handbok'],
  ['admin', '/admin'],
  ['admin-niva', '/admin/niva'],
  ['admin-tilgang', '/admin/tilgang'],
  ['admin-dommere', '/admin/dommere'],
  ['admin-referater', '/admin/referater'],
  ['serie', '/serie']
]

// I siden: tekst og flater. Bakgrunnen er første ugjennomsiktige farge
// oppover i treet (gjennomsiktige lag blandes inn).
function skann() {
  const rgba = s => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [r, g, b, a] }
  const lum = ([r, g, b]) => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const bland = (over, under) => { const a = over[3]; return [0, 1, 2].map(i => over[i] * a + under[i] * (1 - a)).concat(1) }
  function bak(el) {
    const lag = []
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e)
      if (cs.backgroundImage !== 'none' && !/gradient/.test(cs.backgroundImage)) return null
      const c = rgba(cs.backgroundColor)
      if (c && c[3] > 0) { lag.push(c); if (c[3] >= 1) break }
    }
    let ut = [255, 255, 255, 1]
    if (!lag.length || lag[lag.length - 1][3] < 1) ut = rgba(getComputedStyle(document.body).backgroundColor) || ut
    for (let i = lag.length - 1; i >= 0; i--) ut = lag[i][3] >= 1 ? lag[i] : bland(lag[i], ut)
    return ut
  }
  const navn = el => {
    const k = [...el.classList].slice(0, 2).join('.')
    return `${el.tagName.toLowerCase()}${k ? '.' + k : ''}`
  }
  const sti = el => { const d = []; for (let e = el; e && d.length < 3; e = e.parentElement) if (e.classList.length) d.unshift(navn(e)); return d.join(' > ') }
  const funn = []
  const sett = new Set()
  const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05 }
  for (const el of document.querySelectorAll('body *')) {
    if (['SCRIPT', 'STYLE', 'SVG', 'PATH', 'NOSCRIPT'].includes(el.tagName.toUpperCase())) continue
    const tekst = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').trim()
    if (!tekst || !vis(el)) continue
    if (el.closest('[aria-hidden="true"], .ds-sheet:not(.ds-sheet--open)')) continue
    const cs = getComputedStyle(el)
    let fg = rgba(cs.color); const b = bak(el)
    if (!fg || !b) continue
    let op = 1; for (let e = el; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity)
    fg = bland([fg[0], fg[1], fg[2], fg[3] * op], b)
    const [l1, l2] = [lum(fg), lum(b)].sort((x, y) => y - x)
    const k = (l1 + 0.05) / (l2 + 0.05)
    const px = parseFloat(cs.fontSize), vekt = Number(cs.fontWeight) || 400
    const stor = px >= 24 || (px >= 18.66 && vekt >= 700)
    const krav = el.disabled || el.closest('[disabled], [aria-disabled="true"]') ? 0 : stor ? 3 : 4.5
    if (k < krav) {
      const nokkel = `${sti(el)}|${cs.color}|${b.join()}`
      if (sett.has(nokkel)) continue
      sett.add(nokkel)
      funn.push({ type: 'kontrast', hvor: sti(el), tekst: tekst.slice(0, 40), k: Math.round(k * 100) / 100, krav, fg: cs.color, bak: `rgb(${b.slice(0, 3).map(Math.round).join(',')})` })
    }
  }
  // Lyse flater i mørk modus: større felt med nesten hvit bakgrunn.
  const side = rgba(getComputedStyle(document.body).backgroundColor) || [0, 0, 0, 1]
  if (lum(side) < 0.2) {
    for (const el of document.querySelectorAll('body *')) {
      if (!vis(el)) continue
      const c = rgba(getComputedStyle(el).backgroundColor)
      if (!c || c[3] < 0.9) continue
      const r = el.getBoundingClientRect()
      if (r.width * r.height < 1500 || lum(c) < 0.5) continue
      const nokkel = `flate|${sti(el)}`
      if (sett.has(nokkel)) continue
      sett.add(nokkel)
      funn.push({ type: 'lys flate', hvor: sti(el), farge: getComputedStyle(el).backgroundColor, str: `${Math.round(r.width)}×${Math.round(r.height)}` })
    }
  }
  return funn
}

const b = await chromium.launch()
let feil = 0
try {
  const r = await fetch(`${API}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email: 'alexander.samnoy@gmail.com' }) })
  const j = await r.json(); const tok = j.hashed_token || j.properties?.hashed_token
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: TEMA === 'dark' ? 'dark' : 'light' })
  await c.addInitScript(([t, k]) => { localStorage.setItem('bb-theme', t); if (!localStorage.getItem('bb_active_cohort')) localStorage.setItem('bb_active_cohort', k) }, [TEMA, KULL])
  const p = await c.newPage()
  await p.goto(`${APP}/auth/klar?t=${tok}&type=magiclink`)
  await p.getByRole('button', { name: /Logg inn/ }).click()
  await p.waitForURL(u => !/\/auth|\/login/.test(u.pathname), { timeout: 20000 })
  await p.evaluate(k => localStorage.setItem('bb_active_cohort', k), KULL)

  async function mal(navn, fullPage = true) {
    await vent(700)
    const tema = await p.evaluate(() => document.documentElement.dataset.theme)
    await p.screenshot({ path: `${OUT}/${navn}.png`, fullPage })
    const funn = await p.evaluate(skann)
    feil += funn.length
    console.log(`${funn.length ? 'FEIL' : 'OK  '} ${navn} (${tema}) — ${funn.length} funn`)
    for (const f of funn) console.log(f.type === 'kontrast'
      ? `       ${f.k}:1 (krav ${f.krav})  ${f.hvor}  «${f.tekst}»  ${f.fg} på ${f.bak}`
      : `       lys flate  ${f.hvor}  ${f.farge}  ${f.str}`)
  }
  for (const [navn, sti] of SIDER) {
    await p.goto(`${APP}${sti}`)
    await p.waitForLoadState('networkidle').catch(() => {})
    await vent(200)
    await mal(navn)
  }

  // Kjøreplanen og arkene: oppmøtet registreres lokalt og slettes etterpå.
  // Midlertidige nivåer, så gjengene får bokstaver.
  const hadde = Number(sql(`select count(*) from player_levels pl join players p on p.id = pl.player_id where p.cohort_id='${KULL}'`))
  if (!hadde) sql(`insert into player_levels (player_id, level) select id, (array['A','B','C'])[1 + (row_number() over (order by name))::int % 3] from players where cohort_id='${KULL}'`)
  try {
    await p.goto(`${APP}/trening/okt/${dag}`)
    await p.locator('.okt__start').click()
    await p.locator('.plan').waitFor()
    await mal('kjoreplan')
    await p.locator('.rad').first().click()
    await mal('ark-ovelse', false)
    await p.locator('.fot__knapp', { hasText: 'Lukk' }).click()
    await vent(400)
    await p.locator('.fase__endre').first().click()
    await p.locator('.brikke').first().click()
    await mal('ark-endre', false)
    await p.locator('.ds-sheet__close, [aria-label="Lukk"]').first().click().catch(() => p.keyboard.press('Escape'))
    await vent(400)
    await p.locator('.okt__her').click()
    await mal('ark-oppmote', false)
    await p.locator('.fot__knapp', { hasText: 'Ferdig' }).click()
    await vent(400)
    await p.locator('.plan__fordel').click()
    await p.locator('.fordel .gjeng').first().waitFor()
    await mal('del-i-grupper', false)
    await p.locator('.antall__knapp', { hasText: 'Likt' }).click()
    await mal('del-i-grupper-likt', false)
    await p.locator('.okt__back').click()
    await p.locator('.okt__slett').click()
    await mal('nullstill-dialog', false)
  } finally {
    sql(`delete from training_runs where session_id='${dag}' and dato = current_date`)
    if (!hadde) sql(`delete from player_levels where player_id in (select id from players where cohort_id='${KULL}')`)
  }
} finally {
  await b.close()
}
console.log(feil ? `${feil} funn` : 'Alt grønt')
process.exit(feil ? 1 : 0)
