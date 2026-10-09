// «Start økta»: hvem er her → grupper og trenere fordelt, delt live mellom
// trenerne, oppmøtet i statistikken, og ingenting for foreldre. Mot lokal base.
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'
import { fordelTrenere } from '../src/lib/grupper.js'
const API = process.env.QA_API || 'http://127.0.0.1:54321'
const APP = process.env.QA_APP || 'http://localhost:5174'
const OUT = process.env.QA_OUT || '/tmp'
const SVC = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const KULL = 'af104bf3-02f4-4067-a0db-bf285f5d8f39'
let feilet = 0
const ok = (l, c, x = '') => { if (!c) feilet++; console.log(`${c ? 'OK  ' : 'FEIL'} ${l}${x ? '  — ' + x : ''}`) }
const sql = q => execSync(`docker exec -e PGPASSWORD=postgres supabase_db_halsen-dommerutlegg psql -U postgres -Atc ${JSON.stringify(q)}`).toString().trim()
const vent = ms => new Promise(r => setTimeout(r, ms))
async function inntil(fn, ms = 12000) {
  const slutt = Date.now() + ms
  while (Date.now() < slutt) { if (await fn()) return true; await vent(300) }
  return false
}

// Trenerfordelingen: C får to, A og B én; færre trenere enn grupper → A går uten.
{
  const abc = [{ niva: 'A' }, { niva: 'B' }, { niva: 'C' }]
  const f = fordelTrenere(abc, ['a', 'b', 'c', 'd'], 0)
  ok('4 trenere: C to, B én, A én', f[2].length === 2 && f[1].length === 1 && f[0].length === 1, JSON.stringify(f))
  const tre = fordelTrenere(abc, ['a', 'b'], 0)
  ok('2 trenere: A går uten', tre[0].length === 0 && tre[1].length === 1 && tre[2].length === 1, JSON.stringify(tre))
  const r0 = fordelTrenere(abc, ['a', 'b', 'c', 'd'], 0), r1 = fordelTrenere(abc, ['a', 'b', 'c', 'd'], 1)
  ok('neste trening står trenerne et annet sted', JSON.stringify(r0) !== JSON.stringify(r1))
}

sql(`delete from player_levels where cohort_id='${KULL}'`)
sql(`insert into player_levels (player_id, level) select id, (array['A','B','C'])[1 + (row_number() over (order by name))::int % 3] from players where cohort_id='${KULL}' order by name offset 2`)
sql(`delete from training_runs where cohort_id='${KULL}' and title like 'QA-%'`)
const antall = Number(sql(`select count(*) from players where cohort_id='${KULL}'`))
const trenere = Number(sql(`select count(*) from coaches where cohort_id='${KULL}'`))

const KLUBB = `(select club_id from cohorts where id='${KULL}')`
const DIFF = sql(`select id from training_exercises where type='diff' and club_id=${KLUBB} order by name limit 1`)
const MIX = sql(`select id from training_exercises where type='mix' and club_id=${KLUBB} order by name limit 1`)
const MIXNAVN = sql(`select name from training_exercises where id='${MIX}'`)
const FOR = sql(`select coalesce(per_gruppe::text,'null') from training_exercises where id='${DIFF}'`)
sql(`update training_exercises set per_gruppe=4 where id='${DIFF}'`)
const UKEDAG = new Date().getDay() || 7
const DAG = sql(`insert into training_sessions (cohort_id, title, weekday, position, drills) values ('${KULL}', 'QA-økt', ${UKEDAG}, 99, jsonb_build_array(jsonb_build_object('type','diff','text','QA diff','exercise_id','${DIFF}','minutes',20), jsonb_build_object('type','mix','text','QA mix','exercise_id','${MIX}','minutes',20))) returning id`).split('\n')[0]

const b = await chromium.launch()
const feil = []
async function logginn(epost) {
  const r = await fetch(`${API}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email: epost }) })
  const j = await r.json(); const tok = j.hashed_token || j.properties?.hashed_token
  const c = await b.newContext({ viewport: { width: 360, height: 780 } }); const p = await c.newPage()
  p.on('pageerror', e => feil.push(e.message))
  await p.goto(`${APP}/auth/klar?t=${tok}&type=magiclink`)
  await p.getByRole('button', { name: /Logg inn/ }).click()
  await p.waitForURL(u => !/\/auth|\/login/.test(u.pathname), { timeout: 20000 })
  await p.evaluate(k => localStorage.setItem('bb_active_cohort', k), KULL)
  return p
}
const likt = (a, b) => Math.abs(a - b) <= 1

try {
  const p = await logginn('alexander.samnoy@gmail.com')
  await p.goto(`${APP}/trening?dag=${DAG}`)
  await p.locator('.okt-start').waitFor({ timeout: 15000 })
  ok('dagen har «Start økta»', true)
  await p.locator('.rigg-rad').click()
  await p.locator('.rigg__liste').waitFor({ timeout: 5000 })
  const rigg = await p.locator('.ds-sheet').innerText()
  ok('riggen åpnes fra dagen', /stasjoner/.test(rigg) && !/bedre med/.test(rigg), rigg.replace(/\n/g, ' | '))
  ok('diff med 4 per gruppe gir 7 stasjoner for 27', /7 stasjoner/.test(rigg))
  await p.keyboard.press('Escape')
  await vent(400)
  await p.locator('.okt-start').click()
  await p.locator('.oppg__navn').first().waitFor({ timeout: 15000 })
  ok('«Hvem er her?» med hele kullet på', await p.locator('.oppg__grid').first().locator('.oppg__navn').count() === antall && await p.locator('.oppg__navn--borte').count() === 0)
  await vent(600)
  const startY = (await p.locator('.okt__start').boundingBox()).y
  for (let k = 0; k < 6; k++) await p.locator('.oppg__grid').first().locator('.oppg__navn').nth(k * 3).click()
  await p.locator('.oppg__grid').nth(1).locator('.oppg__navn').last().click()
  const riggerNavn = (await p.locator('.oppg__valg-knapp').nth(1).innerText()).trim()
  await p.locator('.oppg__valg-knapp').nth(1).click()
  ok('telleren viser 21 av 27', /21\s*av\s*27/.test(await p.locator('.oppm__teller').first().innerText()))
  const sluttY = (await p.locator('.okt__start').boundingBox()).y
  ok('startknappen står stille mens du trykker', likt(sluttY, startY), `${startY} → ${sluttY}`)
  await p.screenshot({ path: `${OUT}/okt-oppmote.png` })
  await p.locator('.okt__start').click()
  await p.locator('.rad').first().waitFor({ timeout: 10000 })
  const RUN = sql(`select id from training_runs where session_id='${DAG}'`)
  ok('økta lagret med 21 spillere', sql(`select count(*) from training_run_players where run_id='${RUN}'`) === '21')
  ok(`og ${trenere - 1} trenere`, sql(`select count(*) from training_run_coaches where run_id='${RUN}'`) === String(trenere - 1))
  ok('sesongen satt på økta', sql(`select season_id is not null from training_runs where id='${RUN}'`) === 't')
  ok('økta viser riggeren', (await p.locator('.okt__rigger').innerText()).includes(riggerNavn))
  ok('oversikten er én rad per øvelse', await p.locator('.rad').count() === 2)
  const meta = await p.locator('.rad').first().locator('.rad__meta').innerText()
  ok('diff med 4 per gruppe: 5 grupper · 4–5 i hver', /5 grupper · 4–5 i hver/.test(meta), meta)
  ok('første øvelse er markert «Nå»', await p.locator('.rad').first().locator('.rad__na').count() === 1)
  ok('oversikten får plass uten scroll', await p.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 140))
  await p.screenshot({ path: `${OUT}/okt-okta.png` })

  // Arket: grupper som tekst, trenere, nivå.
  await p.locator('.rad').first().click()
  await p.locator('.grp__gruppe').first().waitFor()
  ok('arket viser 5 grupper', await p.locator('.grp__gruppe').count() === 5)
  ok('riggeren står på økta', sql(`select state->>'_rigger' is not null from training_runs where id='${RUN}'`) === 't')
  ok('riggeren står utenfor gruppene', !(await p.locator('.grp__trener').allInnerTexts()).join(' ').includes(riggerNavn), riggerNavn)
  ok('lesemodus: navnene som brikker, ingen knapper', await p.locator('.grp__spiller').count() === 0 && await p.locator('.grp__brikker--les').count() === 5 && await p.locator('.grp__gruppe button').count() === 0)
  ok('trenerne står på gruppene', await p.locator('.grp__trener').count() >= 1)
  ok('nivået står som bokstav', /^[ABC]$/.test((await p.locator('.grp__niva').first().innerText()).trim()))
  const bunn = async () => (await p.locator('.ds-sheet__footer').boundingBox()).y
  await vent(600)
  const b0 = await bunn()
  await p.locator('.fot__pil[aria-label="Neste øvelse"]').click()
  await vent(300)
  const bn = await bunn()
  ok('Neste blar uten at bunnen flytter seg', likt(bn, b0), `${b0} → ${bn}`)
  ok('økta har rotasjonsrunden lagret', /^\d+$/.test(sql(`select state->>'_runde' from training_runs where id='${RUN}'`)))
  await p.locator('.fot__pil[aria-label="Forrige øvelse"]').click()
  await vent(300)
  const gruppe = i => p.locator('.grp__gruppe').nth(i)
  const navnI = async i => (await gruppe(i).locator('.grp__navn').allInnerTexts()).map(x => x.trim())

  // En annen trener ser samme økt og samme grupper.
  const iver = await logginn('iver.vestre@gmail.com')
  await iver.goto(`${APP}/trening/okt/${DAG}`)
  await iver.locator('.rad').first().waitFor({ timeout: 15000 })
  ok('Iver lander rett i økta', /21/.test(await iver.locator('.okt__her').innerText()))
  await iver.locator('.rad').first().click()
  await iver.locator('.grp__gruppe').first().waitFor()
  const mine = await navnI(0)
  const hans = (await iver.locator('.grp__gruppe').first().locator('.grp__navn').allInnerTexts()).map(x => x.trim())
  ok('samme gruppe 1 på begge telefonene', JSON.stringify(mine) === JSON.stringify(hans), `${mine} / ${hans}`)

  // Iver melder en borte i endremodus; jeg ser 20.
  await iver.locator('.fot__knapp', { hasText: 'Endre' }).click()
  await iver.locator('.grp__spiller').first().click()
  await iver.locator('.fot__knapp', { hasText: 'Ikke her' }).click()
  ok('Ivers «ikke her» når meg uten omlasting', await inntil(async () => /^20/.test((await p.locator('.okt__her').innerText()).trim())), await p.locator('.okt__her').innerText())
  ok('og står i basen', sql(`select count(*) from training_run_players where run_id='${RUN}'`) === '20')

  // Jeg bytter to i endremodus; bunnen står stille; Iver ser byttet.
  await p.locator('.fot__knapp', { hasText: 'Endre' }).click()
  const g2y = (await gruppe(1).boundingBox()).y
  const b1 = await bunn()
  const a = (await gruppe(0).locator('.grp__spiller').first().innerText()).trim()
  await gruppe(0).locator('.grp__spiller').first().click()
  ok('valg skyver ikke gruppene', likt((await gruppe(1).boundingBox()).y, g2y))
  const bv = await bunn()
  ok('og bunnen står stille', likt(bv, b1) && likt(b1, b0), `${b0} / ${b1} / ${bv}`)
  await gruppe(4).locator('.grp__spiller').first().click()
  ok('byttet hos meg', (await gruppe(4).locator('.grp__spiller').allInnerTexts()).includes(a))
  await iver.locator('.fot__knapp', { hasText: 'Ferdig' }).click()
  ok('byttet når Iver', await inntil(async () => (await iver.locator('.grp__gruppe').nth(4).locator('.grp__navn').allInnerTexts()).includes(a)), a)
  await p.locator('.fot__knapp', { hasText: 'Ferdig' }).click()

  // Om øvelsen: arket bytter innhold, bunnen står.
  await p.locator('.ark__om').click()
  await p.locator('.ex-view').waitFor({ timeout: 5000 })
  const bo = await bunn()
  ok('«Om øvelsen» bytter innhold i arket, bunnen står', likt(bo, b0), `${b0} → ${bo}`)
  await p.locator('.fot__knapp', { hasText: 'Tilbake' }).click()
  ok('og tilbake til gruppene', await p.locator('.grp__gruppe').count() > 0)
  await p.keyboard.press('Escape')
  await vent(400)

  // Kom for sent: oppmøte-arket.
  await p.locator('.okt__her').click()
  await p.locator('.oppg__navn--borte').first().click()
  await vent(600)
  await p.locator('.fot__knapp', { hasText: 'Ferdig' }).click()
  await vent(400)
  ok('kom for sent: 21 igjen', /^21/.test((await p.locator('.okt__her').innerText()).trim()))
  await p.evaluate(() => window.scrollTo(9999, 0))
  ok('ingen sideveis scroll på 360', await p.evaluate(() => window.scrollX) === 0)

  // Statistikken.
  await p.goto(`${APP}/statistikk`)
  await p.locator('.stat-collapse-head', { hasText: 'Oppmøte trening' }).waitFor({ timeout: 15000 })
  ok('Statistikk har «Oppmøte trening»', /1 økt/.test(await p.locator('.stat-collapse-head', { hasText: 'Oppmøte trening' }).innerText()))
  await p.locator('.stat-collapse-head', { hasText: 'Oppmøte trening' }).click()
  ok('21 med «1 av 1»', await p.locator('.oppmote-row', { hasText: '1 av 1' }).count() === 21)
  await p.locator('.stat-collapse-head', { hasText: 'Oppmøte trening' }).scrollIntoViewIfNeeded()
  await p.screenshot({ path: `${OUT}/okt-statistikk.png` })

  // Forelder.
  const forelder = await logginn('susannetenfjord@hotmail.com')
  await forelder.goto(`${APP}/trening/okt/${DAG}`)
  await vent(3000)
  ok('forelder ser ikke økta', await forelder.locator('.rad').count() === 0 && await forelder.locator('.oppg__navn').count() === 0)
  ok('forelder får null rader fra basen', await forelder.evaluate(async () => {
    const m = await import('/src/supabase.js')
    const [a, b] = await Promise.all([m.supabase.from('training_runs').select('id'), m.supabase.from('training_run_players').select('player_id')])
    return (a.data || []).length + (b.data || []).length
  }) === 0)

  // Slett økta.
  await p.goto(`${APP}/trening/okt/${DAG}`)
  await p.locator('.okt__her').click()
  await p.locator('.okt__slett').click()
  await p.getByRole('button', { name: 'Slett' }).last().click()
  await vent(1200)
  ok('slett økta fjerner den', sql(`select count(*) from training_runs where session_id='${DAG}'`) === '0')
} finally {
  ok('ingen sidefeil', feil.length === 0, feil.join(' | '))
  sql(`delete from training_runs where cohort_id='${KULL}' and title like 'QA-%'; delete from training_sessions where id='${DAG}'; delete from player_levels where cohort_id='${KULL}'; update training_exercises set per_gruppe=${FOR} where id='${DIFF}'`)
  await b.close()
}
process.exit(feilet ? 1 : 0)
