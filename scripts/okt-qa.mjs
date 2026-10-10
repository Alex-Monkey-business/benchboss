// QA av treningsdagen og økta på åtte telefonbredder, med ekte fingersveip.
//
// Det enkle testene ikke fanger: siden som scroller bak et ark, knapper som
// renner ut av bunnen, tekst som sprenger bredden på 320 px, og en scroll-
// lås som ikke slippes når du navigerer bort med arket åpent. Mot lokal base.
//
//   QA_APP=http://localhost:5179 node scripts/okt-qa.mjs
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'
const API = process.env.QA_API || 'http://127.0.0.1:54321'
const APP = process.env.QA_APP || 'http://localhost:5174'
const OUT = process.env.QA_OUT || '/tmp'
const SVC = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const KULL = 'af104bf3-02f4-4067-a0db-bf285f5d8f39'
const BREDDER = (process.env.QA_BREDDER || '320,360,375,390,393,412,414,430').split(',').map(Number)
let feilet = 0
const ok = (l, c, x = '') => { if (!c) feilet++; if (!c || process.env.QA_VERBOSE) console.log(`${c ? 'OK  ' : 'FEIL'} ${l}${x ? '  — ' + x : ''}`); return c }
const sql = q => execSync(`docker exec -e PGPASSWORD=postgres supabase_db_halsen-dommerutlegg psql -U postgres -Atc ${JSON.stringify(q)}`).toString().trim()
const vent = ms => new Promise(r => setTimeout(r, ms))

sql(`delete from player_levels where cohort_id='${KULL}'`)
sql(`insert into player_levels (player_id, level) select id, (array['A','B','C'])[1 + (row_number() over (order by name))::int % 3] from players where cohort_id='${KULL}'`)
const UKEDAG = new Date().getDay() || 7
// Den lengste dagen i uka: flest øvelser, mest innhold.
const DAG = sql(`select id from training_sessions where cohort_id='${KULL}' order by jsonb_array_length(drills) desc, position limit 1`)
if (!DAG) { console.log('FEIL ingen treningsdag i lokal base'); process.exit(1) }
const VD = sql(`select coalesce(weekday::text,'null') from training_sessions where id='${DAG}'`)
sql(`update training_sessions set weekday=${UKEDAG} where id='${DAG}'`)

const b = await chromium.launch()
const r = await fetch(`${API}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email: 'alexander.samnoy@gmail.com' }) })
const tok = (await r.json()).hashed_token
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
const p = await ctx.newPage()
const feil = []
p.on('pageerror', e => feil.push(e.message))
p.on('console', m => { if (m.type() === 'warning' && /\[Vue warn\]/.test(m.text())) feil.push(m.text().slice(0, 140)) })
await p.goto(`${APP}/auth/klar?t=${tok}&type=magiclink`)
await p.getByRole('button', { name: /Logg inn/ }).click()
await p.waitForURL(u => !/\/auth|\/login/.test(u.pathname), { timeout: 20000 })
await p.evaluate(k => localStorage.setItem('bb_active_cohort', k), KULL)
const cdp = await ctx.newCDPSession(p)

// Ekte fingersveip: dy < 0 = dra fingeren opp (innholdet scroller nedover).
async function sveip(sel, dy) {
  const bx = await p.locator(sel).first().boundingBox()
  await cdp.send('Input.synthesizeScrollGesture', { x: Math.round(bx.x + bx.width / 2), y: Math.round(bx.y + Math.min(bx.height / 2, 200)), yDistance: dy, speed: 1600, gestureSourceType: 'touch' })
  await vent(250)
}
const sideY = () => p.evaluate(() => document.querySelector('main, .okt, .uke')?.getBoundingClientRect().top ?? 0)
const laast = () => p.evaluate(() => document.body.style.position === 'fixed')
const scrollX = () => p.evaluate(() => { window.scrollTo(9999, window.scrollY); const x = window.scrollX; window.scrollTo(0, window.scrollY); return x })

// Elementer som stikker ut av skjermen sideveis (hopper over vannrette scrollere).
const utenfor = () => p.evaluate(() => {
  const w = document.documentElement.clientWidth, ut = []
  for (const el of document.querySelectorAll('body *')) {
    const rr = el.getBoundingClientRect()
    if (!rr.width || rr.right <= w + 1) continue
    let f = el.parentElement, skjult = false
    while (f && f !== document.body) { const o = getComputedStyle(f).overflowX; if (o !== 'visible') { skjult = true; break } f = f.parentElement }
    if (!skjult) ut.push(`${el.className || el.tagName} (${Math.round(rr.right)} > ${w})`)
  }
  return ut.slice(0, 3)
})
// Strekktest: 40+ tegn i alt som har ellipsis og ingen barn.
const strekk = () => p.evaluate(() => {
  for (const el of document.querySelectorAll('body *')) {
    if (el.children.length || getComputedStyle(el).textOverflow !== 'ellipsis') continue
    el.dataset.qaFor = el.textContent
    el.textContent = 'Kristoffer-Alexander Bjørnstad-Haugenvik Øvelse'
  }
})
const tilbakestill = () => p.evaluate(() => { for (const el of document.querySelectorAll('[data-qa-for]')) { el.textContent = el.dataset.qaFor; delete el.dataset.qaFor } })

// Knappetekst som er kuttet.
const kuttet = sel => p.evaluate(s => [...document.querySelectorAll(s)].filter(e => e.offsetParent && e.scrollWidth > e.clientWidth + 1).map(e => e.textContent.trim()), sel)

async function arkSjekk(navn, w) {
  ok(`${w} ${navn}: siden er låst bak arket`, await laast())
  const y0 = await sideY()
  await sveip('.ds-sheet__body', -600)
  await sveip('.ds-sheet__body', -600)
  await sveip('.ds-sheet__overlay, .ds-sheet-overlay', -400)
  ok(`${w} ${navn}: siden bak står stille ved sveip`, Math.abs((await sideY()) - y0) < 1, `${y0} → ${await sideY()}`)
  const fot = await p.locator('.ds-sheet__footer').boundingBox().catch(() => null)
  if (fot) ok(`${w} ${navn}: bunnen er innenfor skjermen`, fot.y + fot.height <= (await p.evaluate(() => innerHeight)) + 1, `${Math.round(fot.y + fot.height)}`)
  const k = await kuttet('.ds-sheet__footer button, .ark__om, .oppg__valg-knapp')
  ok(`${w} ${navn}: ingen kuttede knapper i bunnen`, !k.length, k.join(' | '))
  ok(`${w} ${navn}: ingenting sideveis`, !(await utenfor()).length, (await utenfor()).join(', '))
}

async function lukkArk() {
  await p.keyboard.press('Escape')
  await vent(400)
}

try {
  for (const w of BREDDER) {
    await p.setViewportSize({ width: w, height: w <= 360 ? 740 : 844 })
    sql(`delete from training_runs where session_id='${DAG}'`)

    // ── Treningsdagen ──
    await p.goto(`${APP}/trening?dag=${DAG}`)
    await p.locator('.okt-start').waitFor({ timeout: 15000 })
    await vent(500)
    ok(`${w} dag: ingen sideveis scroll`, (await scrollX()) === 0)
    await strekk()
    ok(`${w} dag: lange navn holder seg innenfor`, !(await utenfor()).length, (await utenfor()).join(', '))
    await tilbakestill()
    await p.evaluate(() => window.scrollTo(0, 260))
    const yFor = await p.evaluate(() => window.scrollY)
    await p.locator('.rigg-rad').click()
    await p.locator('.rigg__liste, .rigg__utstyr').first().waitFor({ timeout: 5000 })
    await vent(500)
    await arkSjekk('rigg', w)
    await lukkArk()
    ok(`${w} dag: låsen slippes`, !(await laast()))
    ok(`${w} dag: scrollen er der den var`, Math.abs((await p.evaluate(() => window.scrollY)) - yFor) <= 1, `${yFor} → ${await p.evaluate(() => window.scrollY)}`)

    // Øvelsesarket fra dagen (lesemodus).
    await p.locator('.steg__hode').first().click()
    await p.locator('.ex-view').waitFor({ timeout: 5000 })
    await vent(500)
    await arkSjekk('øvelse fra dagen', w)
    await lukkArk()
    ok(`${w} dag: låsen slippes etter øvelsen`, !(await laast()))

    // ── Hvem er her? ──
    await p.evaluate(() => window.scrollTo(0, 0))
    await p.locator('.okt-start').click()
    await p.locator('.oppg__navn').first().waitFor({ timeout: 10000 })
    await vent(400)
    ok(`${w} oppmøte: ingen sideveis scroll`, (await scrollX()) === 0)
    await p.evaluate(() => window.scrollTo(0, 99999))
    await vent(200)
    const sist = await p.locator('.oppg__navn').last().boundingBox()
    const knapp = await p.locator('.okt__start').boundingBox()
    ok(`${w} oppmøte: siste navn ligger over startknappen`, sist.y + sist.height <= knapp.y + 1, `${Math.round(sist.y + sist.height)} / ${Math.round(knapp.y)}`)
    const meny = await p.locator('.bottom-nav').boundingBox().catch(() => null)
    if (meny) ok(`${w} oppmøte: startknappen ligger over menyen`, knapp.y + knapp.height <= meny.y + 1)
    const kn = await kuttet('.oppg__navn, .okt__start')
    ok(`${w} oppmøte: ingen kuttede navn`, !kn.length, kn.join(' | '))
    await p.locator('.oppg__navn').nth(2).click()
    await p.locator('.okt__start').click()
    await p.locator('.rad').first().waitFor({ timeout: 10000 })
    await vent(400)

    // ── Kjøreplanen ──
    ok(`${w} plan: ingen sideveis scroll`, (await scrollX()) === 0)
    await strekk()
    ok(`${w} plan: lange navn holder seg innenfor`, !(await utenfor()).length, (await utenfor()).join(', '))
    await tilbakestill()
    const rader = await p.locator('.rad').count()
    for (let i = 0; i < rader; i++) {
      await p.locator('.rad').nth(i).click()
      await p.locator('.ds-sheet__footer').waitFor({ timeout: 5000 })
      await vent(500)
      ok(`${w} øvelse ${i + 1}: arket åpner på toppen`, (await p.evaluate(() => document.querySelector('.ds-sheet__body')?.scrollTop || 0)) === 0)
      await arkSjekk(`øvelse ${i + 1}`, w)
      // Øvelsen er lang: arket scroller, ikke siden.
      await p.evaluate(() => document.querySelector('.ds-sheet__body')?.scrollTo({ top: 0 }))
      await vent(100)
      const fr = await p.evaluate(() => document.querySelector('.ds-sheet__body')?.scrollTop || 0)
      await sveip('.ds-sheet__body', -500)
      const til = await p.evaluate(() => document.querySelector('.ds-sheet__body')?.scrollTop || 0)
      const lang = await p.evaluate(() => { const e = document.querySelector('.ds-sheet__body'); return e.scrollHeight > e.clientHeight + 10 })
      if (lang) ok(`${w} øvelse ${i + 1}: arket scroller innholdet sitt`, til > fr, `${fr} → ${til}`)
      await lukkArk()
      ok(`${w} plan: låsen slippes etter øvelse ${i + 1}`, !(await laast()))
    }

    // Endre gjengene og lagene: valgt spiller, mål i bunnen.
    const endre = await p.locator('.fase__endre').count()
    for (let i = 0; i < endre; i++) {
      await p.locator('.fase__endre').nth(i).scrollIntoViewIfNeeded()
      await p.locator('.fase__endre').nth(i).click()
      await p.locator('.brikke').first().waitFor({ timeout: 5000 })
      await vent(500)
      await p.locator('.brikke').first().click()
      await vent(200)
      await arkSjekk(`endre ${i + 1}`, w)
      const kb = await kuttet('.mal__knapp, .fot__tekst')
      ok(`${w} endre ${i + 1}: målknappene er hele`, !kb.length, kb.join(' | '))
      await lukkArk()
      ok(`${w} endre ${i + 1}: sluppet`, !(await laast()))
    }

    // Oppmøte-arket, og en som kommer for sent.
    await p.locator('.okt__her').click()
    await p.locator('.oppg__navn').first().waitFor()
    await vent(500)
    await arkSjekk('oppmøte-ark', w)
    await p.locator('.oppg__navn--borte').first().click()
    await p.locator('.inn').waitFor({ timeout: 5000 })
    await arkSjekk('kom for sent', w)
    await sveip('.ds-sheet__body', -2000)
    await lukkArk()
    ok(`${w} oppmøte-ark lukket: sluppet`, !(await laast()))

    // Nullstill-dialogen fra siden.
    await p.locator('.okt__slett').scrollIntoViewIfNeeded()
    await p.locator('.okt__slett').click()
    await vent(300)
    ok(`${w} nullstill-dialog: låst`, await laast())
    await p.getByRole('button', { name: 'Avbryt' }).click()
    await vent(300)
    ok(`${w} økt: alt sluppet til slutt`, !(await laast()))

    // Navigér bort med arket åpent: låsen må slippes, ellers står hele appen fast.
    await p.locator('.rad').first().click()
    await p.locator('.ds-sheet__footer').waitFor()
    await p.goBack()
    await vent(800)
    ok(`${w} tilbake med åpent ark: låsen er sluppet`, !(await laast()))
    await p.evaluate(() => window.scrollTo(0, 400))
    ok(`${w} tilbake med åpent ark: siden kan scrolles`, (await p.evaluate(() => window.scrollY)) > 0)

    if (w === 360) {
      await p.goto(`${APP}/trening/okt/${DAG}`)
      await p.locator('.rad').first().waitFor()
      await p.screenshot({ path: `${OUT}/qa-360-okt.png` })
    }
    console.log(`${w} ferdig`)
  }
} finally {
  ok('ingen sidefeil eller Vue-advarsler', feil.length === 0, [...new Set(feil)].slice(0, 4).join(' | '))
  sql(`delete from training_runs where session_id='${DAG}'; update training_sessions set weekday=${VD} where id='${DAG}'; delete from player_levels where cohort_id='${KULL}'`)
  await b.close()
}
console.log(feilet ? `${feilet} feil` : 'Alt grønt')
process.exit(feilet ? 1 : 0)
