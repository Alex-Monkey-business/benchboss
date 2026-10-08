// «Start økta»: hvem er her → grupper og trenere fordelt, delt live mellom
// trenerne, oppmøtet i statistikken, og ingenting for foreldre. Mot lokal base.
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'
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
const gruppe = (p, kort, g) => p.locator('.kort__rad').nth(kort).locator('.grp__gruppe').nth(g)

try {
  const p = await logginn('alexander.samnoy@gmail.com')
  await p.goto(`${APP}/trening?dag=${DAG}`)
  await p.locator('.okt-start').waitFor({ timeout: 15000 })
  ok('dagen har «Start økta»', true)
  const rigg = await p.locator('.rigg').innerText()
  ok('riggen står på dagen, for hele kullet', new RegExp(`hele kullet \\(${antall}\\)`).test(rigg) && /stasjoner/.test(rigg), rigg.replace(/\n/g, ' | '))
  ok('diff med 4 per gruppe gir 7 stasjoner for 27', /7 stasjoner/.test(rigg))
  await p.locator('.okt-start').click()
  await p.locator('.oppm__navn').first().waitFor({ timeout: 15000 })
  ok('«Hvem er her?» med hele kullet på', await p.locator('.oppm__grid').first().locator('.oppm__navn').count() === antall && await p.locator('.oppm__navn--borte').count() === 0)
  // Seks spillere og én trener borte.
  for (let k = 0; k < 6; k++) await p.locator('.oppm__grid').first().locator('.oppm__navn').nth(k * 3).click()
  await p.locator('.oppm__grid').nth(1).locator('.oppm__navn').last().click()
  ok('telleren viser 21 av 27', /21\s*av\s*27/.test(await p.locator('.oppm__teller').first().innerText()))
  await p.screenshot({ path: `${OUT}/okt-oppmote.png` })
  await p.locator('.okt__start').click()
  await p.locator('.kort__rad').first().waitFor({ timeout: 10000 })
  const RUN = sql(`select id from training_runs where session_id='${DAG}'`)
  ok('økta lagret med 21 spillere', sql(`select count(*) from training_run_players where run_id='${RUN}'`) === '21')
  ok(`og ${trenere - 1} trenere`, sql(`select count(*) from training_run_coaches where run_id='${RUN}'`) === String(trenere - 1))
  ok('sesongen satt på økta', sql(`select season_id is not null from training_runs where id='${RUN}'`) === 't')

  const deling = await p.locator('.kort__rad').first().locator('.kort__deling').innerText()
  ok('diff med 4 per gruppe: 5 grupper · 4–5 i hver', /5 grupper · 4–5 i hver/.test(deling), deling)
  ok('første øvelse er markert «Nå»', await p.locator('.kort__rad').first().locator('.kort__na').count() === 1)
  ok('første kort er åpent med gruppene', await p.locator('.kort__rad').first().locator('.grp__gruppe').count() === 5)
  ok('trenerne står på gruppene', await p.locator('.kort__rad').first().locator('.grp__trener').count() >= 1)
  ok('nivået står som bokstav', /^[ABC]$/.test((await gruppe(p, 0, 0).locator('.grp__niva').innerText().catch(() => '')).trim()))
  await p.screenshot({ path: `${OUT}/okt-okta.png`, fullPage: true })

  // Trenerne står fast hele økta: den som har gruppe 1 på første øvelse, har
  // gruppe 1 på neste også. Rotasjonen er fra trening til trening.
  const t1 = (await gruppe(p, 0, 0).locator('.grp__trener').innerText()).trim()
  await p.locator('.kort__rad').nth(1).locator('.kort__hode').click()
  await gruppe(p, 1, 0).waitFor()
  const t2 = (await gruppe(p, 1, 0).locator('.grp__trener').innerText().catch(() => '')).trim()
  ok('samme trener på gruppe 1 hele økta', t1 && t2.split(' og ').includes(t1), `${t1} / ${t2}`)
  ok('økta har rotasjonsrunden lagret', /^\d+$/.test(sql(`select state->>'_runde' from training_runs where id='${RUN}'`)))
  await p.locator('.kort__rad').nth(0).locator('.kort__hode').click()

  // En annen trener ser samme økt og samme grupper.
  const iver = await logginn('iver.vestre@gmail.com')
  await iver.goto(`${APP}/trening/okt/${DAG}`)
  await iver.locator('.kort__rad').first().waitFor({ timeout: 15000 })
  ok('Iver lander rett i økta', /21/.test(await iver.locator('.okt__sum').innerText()))
  const mine = await gruppe(p, 0, 0).locator('.grp__spiller').allInnerTexts()
  const hans = await gruppe(iver, 0, 0).locator('.grp__spiller').allInnerTexts()
  ok('samme gruppe 1 på begge telefonene', JSON.stringify(mine) === JSON.stringify(hans), `${mine} / ${hans}`)

  // Iver melder en borte; jeg ser 20.
  await gruppe(iver, 0, 0).locator('.grp__spiller').first().click()
  await iver.locator('.grp__knapp').click()
  ok('Ivers «ikke her» når meg uten omlasting', await inntil(async () => /^20 spillere/.test((await p.locator('.okt__sum').innerText()).trim())), await p.locator('.okt__sum').innerText())
  ok('og står i basen', sql(`select count(*) from training_run_players where run_id='${RUN}'`) === '20')

  // Jeg bytter to; Iver ser byttet.
  const a = (await gruppe(p, 0, 0).locator('.grp__spiller').first().innerText()).trim()
  const z = (await gruppe(p, 0, 4).locator('.grp__spiller').first().innerText()).trim()
  await gruppe(p, 0, 0).locator('.grp__spiller').first().click()
  await gruppe(p, 0, 4).locator('.grp__spiller').first().click()
  ok('byttet hos meg', (await gruppe(p, 0, 4).locator('.grp__spiller').allInnerTexts()).includes(a))
  ok('byttet når Iver', await inntil(async () => (await gruppe(iver, 0, 4).locator('.grp__spiller').allInnerTexts()).includes(a)), `${a}↔${z}`)

  // Kom for sent: tilbake via Oppmøte.
  await p.locator('.okt__lenke').click()
  await p.locator('.oppm__navn--borte').first().click()
  await vent(800)
  await p.locator('.okt__start').click()
  ok('kom for sent: 21 igjen', /^21 spillere/.test((await p.locator('.okt__sum').innerText()).trim()))
  await p.evaluate(() => window.scrollTo(9999, 0))
  ok('ingen sideveis scroll på 360', await p.evaluate(() => window.scrollX) === 0)

  // Om øvelsen.
  await p.locator('.kort__om').first().click()
  await p.locator('.ex-view').waitFor({ timeout: 5000 })
  ok('«Om øvelsen» åpner innholdet', true)
  await p.keyboard.press('Escape')

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
  ok('forelder ser ikke økta', await forelder.locator('.kort__rad').count() === 0 && await forelder.locator('.oppm__navn').count() === 0)
  ok('forelder får null rader fra basen', await forelder.evaluate(async () => {
    const m = await import('/src/supabase.js')
    const [a, b] = await Promise.all([m.supabase.from('training_runs').select('id'), m.supabase.from('training_run_players').select('player_id')])
    return (a.data || []).length + (b.data || []).length
  }) === 0)

  // Slett økta.
  await p.goto(`${APP}/trening/okt/${DAG}`)
  await p.locator('.okt__lenke').click()
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
