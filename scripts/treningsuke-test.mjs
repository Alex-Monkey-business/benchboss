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

// Hele blokka er den ENESTE knappen per øvelse. Var 4 (tid, opp, ned, ×).
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

// ── 3. Øvelsen bak ett trykk — samme visning som banken ─────────────────────
//
// Før foldet øvelsen seg ut på stedet som én tekstblokk, uten «Se etter dette»
// og «Si dette til barna». Nå åpner den i en sheet med bankens kort, og
// Forrige/Neste blar gjennom treninga.
await apne('tirsdag')
await p.$eval('.dag--open .steg .steg__hode', e => e.click()); await p.waitForTimeout(600)
ok('øvelsen åpner i en sheet', await tell('.ds-sheet') === 1)
ok('ingenting folder seg ut inne i dagen', await tell('.dag--open .steg__detalj') === 0)
const sheet = await p.evaluate(() => {
  const sh = document.querySelector('.ds-sheet')
  const t = sel => sh.querySelector(sel)?.textContent.trim() || null
  const rekkefolge = [...sh.querySelectorAll('.ex-view > *')].map(e => e.className.split(' ')[0])
  return {
    tittel: t('.ds-sheet__title'),
    hvor: t('.ex-view__hvor'),
    video: !!sh.querySelector('video'),
    videoForst: rekkefolge[0] === 'ex-video',
    kilde: t('.ex-video__tekst'),
    kort: [...sh.querySelectorAll('.ex-sek__tittel')].map(e => e.textContent.trim()),
    fakta: [...sh.querySelectorAll('.ex-fakta dt')].map(e => e.textContent.trim()),
    tidIDag: [...sh.querySelectorAll('.ex-fakta dt')].findIndex(e => e.textContent.trim() === 'Tid i dag'),
    tidVerdi: sh.querySelector('.ex-fakta dd')?.textContent.trim(),
    momenter: sh.querySelectorAll('.ex-punkter li').length,
    steg: sh.querySelectorAll('.ex-steg li').length,
    tekst: t('.ex-tekst'),
    hvitrom: sh.querySelector('.ex-tekst') && getComputedStyle(sh.querySelector('.ex-tekst')).whiteSpace,
    bla: [...sh.querySelectorAll('.bla')].map(b => ({ av: b.disabled, navn: b.querySelector('.bla__navn')?.textContent.trim() })),
    ingenLenkeDobbelt: sh.querySelectorAll('.ex-lenke').length
  }
})
ok('tittelen er øvelsens navn', /Medtak, dribling/.test(sheet.tittel || ''), sheet.tittel)
ok('hvor i treninga: dag, nummer og tidsrom', sheet.hvor === 'Tirsdag · 1 av 3 · 0:00–0:20', sheet.hvor)
ok('videoen står først', sheet.video && sheet.videoForst, `video=${sheet.video} først=${sheet.videoForst}`)
ok('videoen har avsender', /tiim\.no/.test(sheet.kilde || ''), sheet.kilde)
ok('tida i dag står øverst blant nøkkeltallene', sheet.tidIDag === 0 && sheet.tidVerdi === '20 min', `${sheet.fakta.join('/')} → ${sheet.tidVerdi}`)
ok('nøkkeltall: spillere, alder, plass, utstyr', ['Spillere', 'Alder', 'Plass', 'Utstyr'].every(k => sheet.fakta.includes(k)), sheet.fakta.join('/'))
ok('kortene i bankens rekkefølge',
  sheet.kort.join('/') === 'Læringsmål/Gruppe/Gjennomføring/Se etter dette/Si dette til barna/Vanlige feil', sheet.kort.join('/'))
ok('gjennomføringen er nummerert', sheet.steg >= 2, `${sheet.steg} steg`)
ok('gruppa står som tekst med avsnittene i behold', sheet.hvitrom === 'pre-line', sheet.hvitrom)
ok('tiim-lenka vises ikke to ganger (kilde + lenke)', sheet.ingenLenkeDobbelt === 0, `${sheet.ingenLenkeDobbelt} egne lenker`)
ok('Forrige er av på første øvelse', sheet.bla[0]?.av === true)
ok('Neste viser navnet på neste øvelse', sheet.bla[1]?.av === false && /3v3/.test(sheet.bla[1]?.navn || ''), sheet.bla[1]?.navn)

await p.$eval('.ds-sheet .bla--neste', e => e.click()); await p.waitForTimeout(500)
ok('Neste blar til øvelse 2', (await p.$eval('.ds-sheet__title', e => e.textContent.trim())) === '3v3 med press i ryggen')
ok('… og eyebrowen følger med', (await p.$eval('.ex-view__hvor', e => e.textContent.trim())) === 'Tirsdag · 2 av 3 · 0:20–0:40',
  await p.$eval('.ex-view__hvor', e => e.textContent.trim()))
ok('uten video står øvelsen uten tom videoboks', await tell('.ds-sheet video') === 0)
ok('sheeten starter på toppen etter blaing', await p.$eval('.ds-sheet__body', e => e.scrollTop) === 0)
await p.$eval('.ds-sheet .bla--neste', e => e.click()); await p.waitForTimeout(400)
ok('Neste er av på siste øvelse', await p.$eval('.ds-sheet .bla--neste', e => e.disabled))
await p.$eval('.ds-sheet__close', e => e.click()); await p.waitForTimeout(400)
ok('sheeten lukker', await tell('.ds-sheet') === 0)
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
await p.waitForSelector('.kort', { timeout: 15000 }); await p.waitForTimeout(500)
for (const r of await p.$$('.kort')) {
  if (/Medtak, dribling/.test(await r.innerText())) { await r.click(); break }
}
await p.waitForTimeout(600)
// Seksjonene har egne kort med navn på — én øvelse har hele flaten her, og da
// skanner du etter overskriften. Inne i uka står stakken tett med vilje.
const bank = await p.$$eval('.ex-sek__tittel', els => els.map(e => e.textContent.trim()))
ok('banken viser seksjonene som egne kort',
  bank.includes('Læringsmål') && bank.includes('Gruppe') && bank.includes('Gjennomføring'),
  bank.join(' / '))
ok('banken og dagen er samme rendring (ExerciseView)', await tell('.ds-sheet .ex-view') === 1)
ok('banken viser ikke «Tid i dag» — tida er dagens, ikke øvelsens',
  !(await p.$$eval('.ex-fakta dt', els => els.some(e => e.textContent.trim() === 'Tid i dag'))))
ok('videoen står i banken også', await tell('.ds-sheet video') === 1)
ok('læringsmomentene har markør, ikke bare innrykk',
  await p.$eval('.ex-punkter li', el => getComputedStyle(el, '::before').width !== 'auto'))

// Flere linjer i gjennomføringen er en rekkefølge, og da nummererer appen den.
// Én linje blir stående som avsnitt — «1.» alene er et skilt uten veikryss.
const stegtall = await p.$$eval('.ex-steg li', els =>
  els.map(e => getComputedStyle(e, '::before').content))
// Chromium gir ::before-content tilbake som spesifisert («counter(steg) "."»),
// ikke som tegnet tekst — så vi sjekker at telleren er der, ikke tallet.
ok('flerlinjet gjennomføring nummereres', stegtall.length === 0 || /counter|1/.test(stegtall[0]),
  stegtall.join(' '))

// Feltene i skjemaet heter det samme som kategoriene — ellers må du oversette
// mellom det du skriver og det du leser. Arket ligger over lista, så det må
// lukkes før neste rad kan treffes.
await p.keyboard.press('Escape')
await p.goto(`${APP}/trening/ovelser`)
await p.waitForSelector('.kort', { timeout: 15000 }); await p.waitForTimeout(500)
for (const r of await p.$$('.kort')) {
  if (/1v1 vende/.test(await r.innerText())) { await r.click(); break }
}
await p.waitForTimeout(500)
const riggrader = await p.$$eval('.ex-fakta dt', els => els.map(e => e.textContent.trim()))
ok('utstyret står som eget nøkkeltall', riggrader.includes('Utstyr'), riggrader.join(' / '))

await browser.close()
console.log(feilet ? `\n${feilet} feilet` : '\nAlt grønt')
process.exit(feilet ? 1 : 0)
