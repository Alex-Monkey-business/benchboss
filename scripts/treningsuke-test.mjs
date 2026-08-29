// QA: treningsuka etter omleggingen til tidslinje + to moduser.
//
// Målingen som utløste jobben: en åpen dag med fire øvelser var 1140 px på en
// 390-skjerm — 1,35 skjermer — for 660 tegn innhold, og bar 16 knapper.
// Testen holder på at lesemodus er en LESEFLATE (ingen redigering i den) og at
// klokka aldri lyver.
//
// Krever lokal stack + `npm run dev` mot den. Usage: node scripts/treningsuke-test.mjs
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'

const API = 'http://127.0.0.1:54321'
const APP = process.env.APP || 'http://localhost:5175'
const SVC = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const EPOST = 'alexander.samnoy@gmail.com'

let feilet = 0
const ok = (l, c, x = '') => { if (!c) feilet++; console.log(`${c ? 'OK  ' : 'FEIL'} ${l}${x ? '  — ' + x : ''}`) }
const sql = q => execSync(`docker exec -e PGPASSWORD=postgres supabase_db_halsen-dommerutlegg psql -U supabase_admin -h 127.0.0.1 -d postgres -qtAc "${q.replace(/"/g, '\\"')}"`).toString().trim()

const lenke = await (await fetch(`${API}/auth/v1/admin/generate_link`, {
  method: 'POST',
  headers: { apikey: SVC, Authorization: 'Bearer ' + SVC, 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'magiclink', email: EPOST })
})).json()
const frag = ((await fetch(lenke.action_link, { redirect: 'manual' })).headers.get('location') || '').split('#')[1] || ''

const browser = await chromium.launch()
const p = await browser.newPage({ viewport: { width: 390, height: 844 } })
p.on('pageerror', e => ok('ingen sidefeil', false, String(e).slice(0, 120)))

await p.goto(`${APP}/#${frag}`)
await p.waitForFunction(() => !location.hash.includes('access_token'), null, { timeout: 20000 }).catch(() => {})
await p.waitForTimeout(1200)
await p.goto(`${APP}/trening`)
await p.waitForSelector('.dag', { timeout: 15000 })
await p.waitForTimeout(600)

async function apne(navn) {
  for (const d of await p.$$('.dag')) {
    const t = await d.$eval('.dag__name', e => e.textContent.trim()).catch(() => '')
    if (new RegExp(navn, 'i').test(t)) {
      if (!await d.evaluate(e => e.classList.contains('dag--open'))) await d.$eval('.dag__toggle', e => e.click())
      await p.waitForTimeout(500)
      return
    }
  }
  throw new Error(`fant ikke dagen «${navn}»`)
}
const tell = sel => p.$$eval(sel, els => els.length)

// ── 1. Lesemodus er en leseflate ────────────────────────────────────────────
await apne('lørdag')
const steg = await tell('.dag--open .steg:not(.steg--slutt)')
ok('fire øvelser står i tidslinja', steg === 4, `${steg}`)

// Chevronen er den ENESTE knappen per øvelse. Var 4 (tid, opp, ned, ×).
const knapper = await p.$$eval('.dag--open .steg', els =>
  els.reduce((n, e) => n + e.querySelectorAll('button, a').length, 0))
ok('ingen redigering i lesemodus', knapper === steg, `${knapper} knapper på ${steg} øvelser`)

const hoyde = await p.$eval('.dag--open', e => Math.round(e.getBoundingClientRect().height))
ok('åpen dag holder seg under én skjerm', hoyde < 844, `${hoyde} px (var 1140)`)

// ── 2. Klokka ───────────────────────────────────────────────────────────────
const merker = await p.$$eval('.dag--open .steg__klokke', els => els.map(e => e.textContent.trim()))
ok('klokka løper fra 0:00', merker[0] === '0:00', merker.join(' '))
ok('klokka summerer riktig', merker.slice(0, 4).join(' ') === '0:00 0:15 0:35 1:00', merker.join(' '))
ok('endestasjonen står nederst', merker[4] === '1:10', merker.join(' '))
ok('fordelingen står som setning, ikke etikett',
  /20 min ledig av 1 t 30 min/.test(await p.$eval('.steg__sum', e => e.textContent)),
  await p.$eval('.steg__sum', e => e.textContent.trim()))

// Mangler én tid, er summen en løgn — da skal rekkefølgen stå der i stedet.
const torsdag = sql(`select id from training_sessions where title='Torsdag'`)
const foer = sql(`select drills from training_sessions where id='${torsdag}'`)
sql(`update training_sessions set drills=(select jsonb_agg(x - 'minutes') from jsonb_array_elements(drills) x) where id='${torsdag}'`)
await p.reload(); await p.waitForSelector('.dag'); await p.waitForTimeout(600)
await apne('torsdag')
const utenTid = await p.$$eval('.dag--open .steg__klokke', els => els.map(e => e.textContent.trim()))
ok('uten tider vises rekkefølge, ikke klokke', utenTid.join(' ') === '1 2', utenTid.join(' '))
sql(`update training_sessions set drills='${foer.replace(/'/g, "''")}'::jsonb where id='${torsdag}'`)
await p.reload(); await p.waitForSelector('.dag'); await p.waitForTimeout(600)

// ── 3. Detaljen bak ett trykk ───────────────────────────────────────────────
await apne('lørdag')
const foerAapning = await p.$eval('.dag--open', e => Math.round(e.getBoundingClientRect().height))
await p.$eval('.dag--open .steg .steg__hode', e => e.click()); await p.waitForTimeout(400)
ok('detaljen folder seg ut', await tell('.dag--open .steg__detalj') === 1)
ok('oppsettet står uten «OPPSETT»-etikett',
  !/OPPSETT/i.test(await p.$eval('.dag--open .steg__detalj', e => e.innerText)))
await p.$eval('.dag--open .steg .steg__hode', e => e.click()); await p.waitForTimeout(400)
ok('og lukker seg igjen', await p.$eval('.dag--open', e => Math.round(e.getBoundingClientRect().height)) === foerAapning)

// ── 3b. De seks kategoriene ─────────────────────────────────────────────────
//
// Navn, lengde, diff/mix, hva vi øver på, hvordan vi deler opp gruppa, hva du
// må ha med ut, og hva øvelsen går ut på. De tre siste lå før i ÉN tekst og
// måtte gjettes fra hverandre ved rendring. Tirsdag øvelse 1 har alle sju.
await apne('tirsdag')
await p.$eval('.dag--open .steg .steg__hode', e => e.click()); await p.waitForTimeout(400)
const kat = await p.evaluate(() => {
  const s = document.querySelector('.dag--open .steg')
  const t = sel => s.querySelector(sel)?.textContent.trim() || null
  return {
    navn: t('.steg__navn'),
    type: t('.ovelse__badge'),
    tema: t('.steg__tema'),
    lengde: t('.steg__len'),
    momenter: s.querySelectorAll('.ovelse__points li').length,
    rigg: [...s.querySelectorAll('.ovelse__rigg p')].map(e => e.textContent.trim()),
    beskrivelse: t('.ovelse__org'),
    hvitrom: s.querySelector('.ovelse__org') && getComputedStyle(s.querySelector('.ovelse__org')).whiteSpace
  }
})
ok('navn', !!kat.navn, kat.navn)
ok('diff/mix', kat.type === 'Diff', kat.type)
ok('hva vi øver på', kat.tema === 'Spille oss fremover', kat.tema)
ok('lengde', kat.lengde === '20 min', kat.lengde)
ok('momenter', kat.momenter === 3, `${kat.momenter}`)
ok('hvordan vi deler opp gruppa står for seg', kat.rigg[0] === 'To og to per stasjon.', kat.rigg.join(' | '))
ok('utstyret står for seg', /Kjegler, porter/.test(kat.rigg[1] || ''), kat.rigg[1])
ok('beskrivelsen bærer verken inndeling eller utstyr',
  !/To og to per stasjon|Kjegler, porter/.test(kat.beskrivelse || ''), (kat.beskrivelse || '').slice(0, 40))
// 6 av 15 øvelser i banken er skrevet med tomme linjer. Rendrer vi ikke
// pre-line, blir avsnittene til én klump — eller verre: én linje per setning.
ok('forfatterens avsnitt overlever', kat.hvitrom === 'pre-line', kat.hvitrom)
ok('avsnittet står faktisk i teksten', /\n/.test(kat.beskrivelse || ''), JSON.stringify((kat.beskrivelse || '').slice(-24)))
await p.$eval('.dag--open .steg .steg__hode', e => e.click()); await p.waitForTimeout(300)
await apne('lørdag')

// ── 4. Planmodus ────────────────────────────────────────────────────────────
await p.$$eval('.dag--open .dag__action', els => els[0].click()); await p.waitForTimeout(500)
ok('planmodus viser hele økta som rader', await tell('.dag--open .rad') === 4)
ok('hele økta får plass på én skjerm i planmodus',
  await p.$eval('.dag--open', e => e.getBoundingClientRect().height) < 844)

const navnFoer = await p.$$eval('.dag--open .rad__navn', els => els.map(e => e.textContent.trim()))
// Pil ned på rad 1: bytter plass med rad 2. Så tilbake — testen skal ikke
// etterlate seg en omstokket plan.
await p.$$eval('.dag--open .rad', els => els[0].querySelectorAll('.ovelse__action')[1].click())
await p.waitForTimeout(900)
const navnEtter = await p.$$eval('.dag--open .rad__navn', els => els.map(e => e.textContent.trim()))
ok('pil ned bytter rekkefølge', navnEtter[0] === navnFoer[1] && navnEtter[1] === navnFoer[0], navnEtter.join(' | '))
await p.$$eval('.dag--open .rad', els => els[1].querySelectorAll('.ovelse__action')[0].click())
await p.waitForTimeout(900)
ok('og tilbake igjen',
  (await p.$$eval('.dag--open .rad__navn', els => els.map(e => e.textContent.trim()))).join('|') === navnFoer.join('|'))

// Stepperen bor i planmodus, ikke i leseflata.
await p.$eval('.dag--open .rad__tid', e => e.click()); await p.waitForTimeout(400)
ok('tidsstepperen åpner i planmodus', await tell('.dag--open .rad__timeset') === 1)
await p.$eval('.dag--open .ovelse__done', e => e.click()); await p.waitForTimeout(300)

// ── 5. Modus følger ikke med til neste dag ──────────────────────────────────
await apne('tirsdag')
ok('ny dag åpner i lesemodus', await tell('.dag--open .rad') === 0 && await tell('.dag--open .steg') > 0)

// ── 6. Bredder ──────────────────────────────────────────────────────────────
// scrollX er fasit — kortet har overflow: hidden, så et navn som stikker ut
// blir klippet i stillhet uten at siden får vannrett scroll å avsløre det med.
await apne('lørdag')
for (const w of [320, 360, 390, 430]) {
  await p.setViewportSize({ width: w, height: 844 }); await p.waitForTimeout(350)
  const scrollX = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  const stikkerUt = await p.$$eval('.dag--open .steg__navn', els =>
    els.some(e => e.getBoundingClientRect().right > e.closest('.dag').getBoundingClientRect().right - 8))
  ok(`${w} px: ingen vannrett scroll`, !scrollX)
  ok(`${w} px: ingen navn stikker ut av kortet`, !stikkerUt)
}

// ── 7. Øvelsesbanken kjenner de samme kategoriene ───────────────────────────
await p.setViewportSize({ width: 390, height: 844 })
await p.goto(`${APP}/trening/ovelser`)
await p.waitForSelector('.bank-row', { timeout: 15000 }); await p.waitForTimeout(500)
for (const r of await p.$$('.bank-row')) {
  if (/Medtak, dribling/.test(await r.innerText())) { await r.click(); break }
}
await p.waitForTimeout(600)
const bank = await p.$$eval('.ex-view__label', els => els.map(e => e.textContent.trim()))
ok('banken viser kategoriene hver for seg',
  bank.includes('Gruppa') && bank.includes('Øvelsen'), bank.join(' / '))

// Feltene i skjemaet heter det samme som kategoriene — ellers må du oversette
// mellom det du skriver og det du leser. Arket ligger over lista, så det må
// lukkes før neste rad kan treffes.
await p.keyboard.press('Escape')
await p.goto(`${APP}/trening/ovelser`)
await p.waitForSelector('.bank-row', { timeout: 15000 }); await p.waitForTimeout(500)
for (const r of await p.$$('.bank-row')) {
  if (/1v1 vende/.test(await r.innerText())) { await r.click(); break }
}
await p.waitForTimeout(500)
const utstyrsrad = await p.$$eval('.ex-view__section', els =>
  els.map(e => e.querySelector('.ex-view__label')?.textContent.trim()))
ok('utstyr er en egen kategori i banken', utstyrsrad.includes('Utstyr og bane'), utstyrsrad.join(' / '))

await browser.close()
console.log(feilet ? `\n${feilet} feilet` : '\nAlt grønt')
process.exit(feilet ? 1 : 0)
