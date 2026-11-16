// Treningen: kjøreplanen med øvelsene og lenke til Del inn, oppmøtet i Del
// inn (trening → hvem er her → inndeling) delt live mellom trenerne, oppmøtet
// i statistikken, og ingenting for foreldre. Mot lokal base.
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
  const fem = fordelTrenere(abc, ['a', 'b', 'c', 'd', 'e'], 0).map(g => g.length)
  ok('5 trenere: aldri tre på C', JSON.stringify(fem) === '[1,2,2]', JSON.stringify(fem))
  let skjev = 0
  for (let n = 1; n <= 9; n++) for (let r = 0; r < 5; r++) {
    const l = fordelTrenere(abc, [...'abcdefghi'].slice(0, n), r).map(g => g.length)
    if (n >= 3 && Math.max(...l) - Math.min(...l) > 1) skjev++
  }
  ok('ingen gruppe har to trenere mer enn en annen (1–9 trenere)', skjev === 0, skjev)
  const r0 = fordelTrenere(abc, ['a', 'b', 'c', 'd'], 0), r1 = fordelTrenere(abc, ['a', 'b', 'c', 'd'], 1)
  ok('neste trening står trenerne et annet sted', JSON.stringify(r0) !== JSON.stringify(r1))
}

// En kamp i dag tar toppen på Hjem, og da vises ikke treningskortet. Dagens
// kamper flyttes et år fram mens testen går, og tilbake etterpå.
const KAMPER = sql(`select string_agg(id::text, ',') from matches where cohort_id='${KULL}' and match_date=current_date`)
const kampIder = KAMPER ? `('${KAMPER.split(',').join("','")}')` : null
if (kampIder) sql(`update matches set match_date = match_date + 365 where id in ${kampIder}`)
sql(`delete from player_levels where cohort_id='${KULL}'`)
sql(`insert into player_levels (player_id, level) select id, (array['A','B','C'])[1 + (row_number() over (order by name))::int % 3] from players where cohort_id='${KULL}' order by name offset 2`)
sql(`delete from training_runs where cohort_id='${KULL}' and (title like 'QA-%' or dato = current_date)`)
sql(`delete from del_inn where cohort_id='${KULL}'`)
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
  const overskrift = (side = p) => side.locator('.del__h1').innerText().catch(() => '')
  const spillerBrikker = (side = p) => side.locator('.oppg__grid').first().locator('.oppg__navn')
  const trenerBrikker = (side = p) => side.locator('.oppg__grid').nth(1).locator('.oppg__navn')
  const oppsummering = async (side = p) => (await side.locator('.del__oppsummering').innerText()).replace(/\s+/g, ' ')

  // Trening fra menyen: uka lukket, og bare dagens kort har «Del inn».
  await p.goto(`${APP}/trening`)
  await p.locator('.dag').first().waitFor({ timeout: 15000 })
  await vent(600)
  ok('Trening fra menyen: alle dagene lukket', await p.locator('.dag--open').count() === 0)
  const chip = p.locator('.dag', { hasText: 'QA-økt' }).locator('.dag__start')
  ok('dagens trening har «Del inn» på det lukkede kortet', await chip.count() === 1 && (await chip.innerText()).trim() === 'Del inn')
  ok('«Del inn» på kortet går til Del inn', (await chip.getAttribute('href')) === '/del-inn')
  const andre = await p.locator('.dag__start').count()
  const iDagEkte = Number(sql(`select count(*) from training_sessions where cohort_id='${KULL}' and weekday=${UKEDAG} and title <> 'QA-økt'`))
  ok('bare dagens treninger har knappen', andre === 1 + iDagEkte, `${andre} (ekte i dag: ${iDagEkte})`)
  ok('uka har ingen åpne dager å skyve rundt', await p.locator('.dag__body').count() === 0)
  await p.locator('.dag', { hasText: 'QA-økt' }).locator('.dag__toggle').click()
  await p.waitForURL(/\/trening\/dag\//, { timeout: 5000 }).catch(() => {})
  ok('trykk på dagen åpner dagens egen side', p.url().endsWith(`/trening/dag/${DAG}`), p.url())
  ok('dagsiden viser bare den dagen', await p.locator('.dag').count() === 1 && await p.locator('.okt-start').count() === 1)
  await p.screenshot({ path: `${OUT}/dagside.png` })
  await p.goBack()
  await p.waitForURL(u => u.pathname === '/trening', { timeout: 5000 }).catch(() => {})
  ok('tilbake gir uka', new URL(p.url()).pathname === '/trening' && await p.locator('.dag').count() > 1)
  await p.goto(`${APP}/trening?dag=${DAG}`)
  await p.waitForURL(/\/trening\/dag\//, { timeout: 5000 }).catch(() => {})
  ok('gammel lenke (?dag=) sendes til dagsiden', p.url().endsWith(`/trening/dag/${DAG}`), p.url())
  await p.locator('.okt-start').waitFor({ timeout: 15000 })
  ok('dagen har «Kjøreplanen», ikke «Registrer oppmøte»', /Kjøreplanen/.test(await p.locator('.okt-start').innerText()) && !/Registrer oppmøte|her/.test(await p.locator('.okt-start').innerText()))
  await p.locator('.rigg-rad').click()
  await p.locator('.rigg__liste').waitFor({ timeout: 5000 })
  const rigg = await p.locator('.ds-sheet').innerText()
  ok('riggen åpnes fra dagen', /stasjoner/.test(rigg) && !/bedre med/.test(rigg), rigg.replace(/\n/g, ' | '))
  ok('diff med 4 per gruppe gir 7 stasjoner for 27', /7 stasjoner/.test(rigg))
  await p.keyboard.press('Escape')
  await vent(400)

  // Kjøreplanen: lenke til Del inn og øvelsene. Ingen opptelling her.
  await p.locator('.okt-start').click()
  await p.locator('.rad').first().waitFor({ timeout: 15000 })
  const delinn = p.locator('.plan__delinn')
  ok('kjøreplanen lenker til Del inn', await delinn.count() === 1 && (await delinn.getAttribute('href')) === '/del-inn')
  ok('ingen opptelling, gjenger, lag, baner eller Endre i kjøreplanen', await p.locator('.oppg__navn, .okt__start, .okt__her, .okt__slett, .gjeng, .bane, .fase__endre, .plan__rigger').count() === 0)
  ok('én seksjon «Øvelsene» med 40 min', await p.locator('.fase').count() === 1 && /Øvelsene[\s\S]*40 min/.test(await p.locator('.fase').innerText()))
  ok('én rad per øvelse', await p.locator('.rad').count() === 2)
  const meta = await p.locator('.rad').first().locator('.rad__meta').innerText()
  ok('diff-øvelsen: tid og «grupper på nivå»', /20 min · grupper på nivå/.test(meta), meta)
  ok('mix-øvelsen: «lag, blandet»', /lag, blandet/.test(await p.locator('.rad').nth(1).locator('.rad__meta').innerText()))
  ok('ingen klokkeslett', !/\d{2}:\d{2}/.test(await p.locator('.plan').innerText()))
  await p.screenshot({ path: `${OUT}/okt-plan.png`, fullPage: true })

  // Øvelsen i et ark, bla uten at bunnen flytter seg.
  await p.locator('.rad').first().click()
  await p.locator('.ark__nr').waitFor()
  ok('arket sier «Øvelse 1 av 2»', /Øvelse 1 av 2/.test(await p.locator('.ark__nr').innerText()))
  const bunn = async () => (await p.locator('.ds-sheet__footer').boundingBox()).y
  await vent(600)
  const b0 = await bunn()
  await p.locator('.fot__pil[aria-label="Neste øvelse"]').click()
  await vent(300)
  ok('Neste blar uten at bunnen flytter seg', likt(await bunn(), b0) && /Øvelse 2 av 2/.test(await p.locator('.ark__nr').innerText()))
  ok('arket har ikke valg for antall lag', await p.locator('.antall').count() === 0)
  await p.locator('.fot__knapp', { hasText: 'Lukk' }).click()
  await vent(400)
  ok('kjøreplanen lagrer ikke oppmøte', sql(`select count(*) from training_runs where session_id='${DAG}'`) === '0')

  // ── Del inn fra Hjem: trening → hvem er her → inndeling ──
  await p.goto(`${APP}/`)
  await p.locator('.hjem-delinn').waitFor({ timeout: 15000 })
  ok('dagens trening på Hjem går til kjøreplanen', (await p.locator('.today-training').getAttribute('href')) === `/trening/okt/${DAG}`)
  await p.locator('.hjem-delinn').click()
  await p.waitForURL(/\/del-inn$/, { timeout: 5000 })
  await p.locator('.valg__rad').first().waitFor({ timeout: 15000 })
  ok('Del inn spør «Hvilken trening?» med dagens valgt', (await overskrift()) === 'Hvilken trening?' && (await p.getByRole('radio', { name: /QA-økt/ }).getAttribute('aria-checked')) === 'true')
  await p.locator('.del__hoved', { hasText: 'Neste' }).click()
  await p.locator('.oppg__navn').first().waitFor({ timeout: 15000 })
  ok('«Hvem er her?» med hele kullet på', await spillerBrikker().count() === antall && await p.locator('.oppg__navn--borte').count() === 0)
  await vent(600)
  ok('ingen riggervalg i oppmøtet', await p.locator('.oppg__rigger').count() === 0 && await p.locator('.oppg__navn--rigger').count() === 0)
  const startY = (await p.locator('.del__hoved').boundingBox()).y
  for (let k = 0; k < 6; k++) await spillerBrikker().nth(k * 3).click()
  await trenerBrikker().last().click()
  ok('telleren viser 21 av 27', /21\s*av\s*27/.test(await p.locator('.del__teller').innerText()), await p.locator('.del__teller').innerText())
  const sluttY = (await p.locator('.del__hoved').boundingBox()).y
  ok('knappen står stille mens du trykker', likt(sluttY, startY), `${startY} → ${sluttY}`)
  await p.screenshot({ path: `${OUT}/okt-oppmote.png` })
  ok('oppmøtet lagres på økta', await inntil(() => sql(`select count(*) from training_runs where session_id='${DAG}'`) === '1'))
  const RUN = sql(`select id from training_runs where session_id='${DAG}'`)
  ok('oppmøtet lagret med 21 spillere', await inntil(() => sql(`select count(*) from training_run_players where run_id='${RUN}'`) === '21'))
  ok(`og ${trenere - 1} trenere`, await inntil(() => sql(`select count(*) from training_run_coaches where run_id='${RUN}'`) === String(trenere - 1)))
  ok('oppmøtet gjelder i dag', sql(`select dato = current_date from training_runs where id='${RUN}'`) === 't')
  ok('ingen gjenger, lag eller rigger lagret på økta', sql(`select state ?| array['_gjenger','_lag','_rigger','_antall'] from training_runs where id='${RUN}'`) === 'f')
  ok('sesongen satt på økta', sql(`select season_id is not null from training_runs where id='${RUN}'`) === 't')
  ok('økta har rotasjonsrunden lagret', /^\d+$/.test(sql(`select state->>'_runde' from training_runs where id='${RUN}'`)))
  await p.locator('.del__hoved', { hasText: 'Del inn' }).click()
  await p.locator('.kort').first().waitFor({ timeout: 15000 })
  ok('oppsummeringen: 21 spillere og trenerne', new RegExp(`QA-økt.*21 spillere · ${trenere - 1} trenere`).test(await oppsummering()), await oppsummering())
  const kortNavn = async (side = p) => (await side.locator('.kort__navn').allInnerTexts()).map(t => t.split(' · '))
  let dk = await kortNavn()
  ok('Grupper: alle 21 én gang, ingen A og C sammen', dk.flat().length === 21 && new Set(dk.flat()).size === 21 && !(await p.locator('.kort__niva').allInnerTexts()).some(t => t.includes('A') && t.includes('C')))
  await p.locator('.steg__knapp[aria-label="Færre"]').click()
  await vent(200)
  ok('− gir én gruppe mindre', (await kortNavn()).length === dk.length - 1)
  await p.getByRole('tab', { name: 'Lag' }).click()
  await vent(200)
  ok('Lag-fanen: baner og vestfarger', await p.locator('.bane').count() >= 1 && /Gul/.test((await p.locator('.kort').allInnerTexts()).join(' ')))
  ok('Lag-fanen: «Trekk på nytt»', await p.locator('.del__sekundar', { hasText: 'Trekk på nytt' }).count() === 1)
  const forTrekk = JSON.stringify(await kortNavn())
  await p.locator('.del__sekundar').click()
  await vent(200)
  ok('Trekk på nytt gir nye lag', JSON.stringify(await kortNavn()) !== forTrekk)
  ok('ingen «Bruk som dagens …» eller «Start dagens trening»', await p.getByText(/Bruk som dagens|Start dagens trening/).count() === 0)
  await p.getByRole('tab', { name: 'Grupper' }).click()
  await vent(200)
  ok('Grupper-fanen husker sitt antall', (await kortNavn()).length === dk.length - 1)

  // Dagen og uka viser oppmøtet.
  const d = await logginn('alexander.samnoy@gmail.com')
  await d.goto(`${APP}/trening/dag/${DAG}`)
  await d.locator('.okt-start').waitFor({ timeout: 15000 })
  await inntil(async () => /21 her/.test(await d.locator('.okt-start').innerText()))
  ok('dagen viser «Kjøreplanen · 21 her»', /Kjøreplanen[\s\S]*21 her/.test(await d.locator('.okt-start').innerText()), await d.locator('.okt-start').innerText())
  await d.goto(`${APP}/trening`)
  const chip2 = d.locator('.dag', { hasText: 'QA-økt' }).locator('.dag__start')
  await chip2.waitFor({ timeout: 15000 })
  await inntil(async () => /21 her/.test(await chip2.innerText()))
  ok('uka viser «21 her» på dagens kort', (await chip2.innerText()).trim() === '21 her')
  await d.context().close()

  // En annen trener ser samme Del inn: rett på inndelingen, samme grupper.
  dk = await kortNavn()
  const iver = await logginn('iver.vestre@gmail.com')
  await iver.goto(`${APP}/del-inn`)
  await iver.locator('.kort').first().waitFor({ timeout: 15000 })
  ok('Iver lander rett på inndelingen', await iver.locator('.del__h1').count() === 0 && /21 spillere/.test(await oppsummering(iver)), await oppsummering(iver))
  ok('Iver ser de samme gruppene i Del inn', await inntil(async () => JSON.stringify(await kortNavn(iver)) === JSON.stringify(dk)), `${dk.length} grupper`)
  ok('Iver ser at Alex endret sist', await inntil(async () => /endret \d{2}[:.]\d{2}/.test(await iver.locator('.del__delt').innerText().catch(() => ''))))

  // Iver melder en borte; jeg ser 20 uten omlasting.
  await iver.locator('.del__oppsummering').click()
  await iver.locator('.oppg__navn').first().waitFor()
  await spillerBrikker(iver).and(iver.locator(':not(.oppg__navn--borte)')).first().click()
  ok('Ivers «ikke her» når meg uten omlasting', await inntil(async () => /20 spillere/.test(await oppsummering())), await oppsummering())
  ok('og står i basen', await inntil(() => sql(`select count(*) from training_run_players where run_id='${RUN}'`) === '20'))

  // Kom for sent: inn igjen.
  await p.locator('.del__oppsummering').click()
  await p.locator('.oppg__navn').first().waitFor()
  await spillerBrikker().and(p.locator('.oppg__navn--borte')).first().click()
  ok('kom for sent: 21 i basen', await inntil(() => sql(`select count(*) from training_run_players where run_id='${RUN}'`) === '21'))
  ok('og Iver ser 21', await inntil(async () => /21\s*av/.test(await iver.locator('.del__teller').innerText())), await iver.locator('.del__teller').innerText())

  // En trener til tas bort: det lagres på dagens økt.
  await trenerBrikker().and(p.locator(':not(.oppg__navn--borte)')).first().click()
  ok('ingen riggervalg i Del inn', await p.locator('.oppg__rigger').count() === 0)
  ok('en trener til tatt bort står på dagens økt', await inntil(() => sql(`select count(*) from training_run_coaches where run_id='${RUN}'`) === String(trenere - 2)))
  await p.locator('.del__hoved', { hasText: 'Del inn' }).click()
  await p.locator('.kort').first().waitFor()
  ok('oppsummeringen sier én trener færre', (await oppsummering()).includes(`${trenere - 2} trener`), await oppsummering())
  await p.screenshot({ path: `${OUT}/del-inn.png` })
  await iver.locator('.del__hoved', { hasText: 'Del inn' }).click()
  await iver.locator('.kort').first().waitFor()
  dk = await kortNavn()
  ok('Iver ser fortsatt de samme gruppene', await inntil(async () => JSON.stringify(await kortNavn(iver)) === JSON.stringify(dk)), `${dk.length} grupper`)

  await p.evaluate(() => window.scrollTo(9999, 0))
  ok('ingen sideveis scroll på 360', await p.evaluate(() => window.scrollX) === 0)

  // Gammel Endre-lenke sendes til Del inn.
  ok('gammel Endre-lenke sendes til Del inn', await (async () => {
    await p.goto(`${APP}/trening/okt/${DAG}/endre/grupper`)
    await p.waitForURL(/\/del-inn$/, { timeout: 5000 }).catch(() => {})
    return /\/del-inn$/.test(p.url())
  })(), p.url())

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
  await forelder.goto(`${APP}/`)
  await vent(2500)
  ok('forelder har ingen Del inn på Hjem', await forelder.locator('.hjem-delinn').count() === 0)
  await forelder.goto(`${APP}/del-inn`)
  await vent(2500)
  ok('forelder sendes bort fra Del inn', !/\/del-inn/.test(forelder.url()) && await forelder.locator('.kort, .oppg__navn').count() === 0, forelder.url())
  ok('forelder får null rader fra basen', await forelder.evaluate(async () => {
    const m = await import('/src/supabase.js')
    const [a, b, c] = await Promise.all([m.supabase.from('training_runs').select('id'), m.supabase.from('training_run_players').select('player_id'), m.supabase.from('del_inn').select('dato')])
    return (a.data || []).length + (b.data || []).length + (c.data || []).length
  }) === 0)

  // Ikke treningsdag: kjøreplanen vises, ingenting lagres.
  sql(`delete from training_runs where session_id='${DAG}'; delete from del_inn where cohort_id='${KULL}'`)
  sql(`update training_sessions set weekday=${UKEDAG % 7 + 1} where id='${DAG}'`)
  await p.goto(`${APP}/trening/okt/${DAG}`)
  await p.locator('.rad').first().waitFor({ timeout: 15000 })
  await vent(6000)
  ok('kjøreplanen vises og står etter neste henting', await p.locator('.rad').count() === 2 && await p.locator('.plan__delinn').count() === 1)
  ok('ingenting i basen', sql(`select count(*) from training_runs where session_id='${DAG}'`) === '0')

  // Del inn uten trening: hele kullet og alle trenerne, med blanke valg.
  await p.goto(`${APP}/del-inn`)
  await p.locator('.valg__rad').first().waitFor({ timeout: 15000 })
  await p.getByRole('radio', { name: /Uten trening/ }).click()
  await p.locator('.del__hoved', { hasText: 'Neste' }).click()
  await p.locator('.oppg__navn').first().waitFor()
  ok('uten trening: hele kullet', new RegExp(`^${antall}\\s*av\\s*${antall}`).test((await p.locator('.del__teller').innerText()).trim()), await p.locator('.del__teller').innerText())
  await p.locator('.del__hoved', { hasText: 'Del inn' }).click()
  await p.locator('.kort').first().waitFor({ timeout: 15000 })
  ok('og alle trenerne', new RegExp(`Uten trening.*${antall} spillere · ${trenere} trenere`).test(await oppsummering()), await oppsummering())
  ok('og ingen «Bruk som dagens …»', await p.getByText(/Bruk som dagens|Start dagens trening/).count() === 0)
  ok('tre grupper, alle med trener', await p.locator('.kort').count() === 3 && await p.locator('.del__linje').count() === 0, (await p.locator('.kort__tittel').allInnerTexts()).join(' / '))
  // Bare én trener igjen: fortsatt tre grupper, to uten trener.
  await p.locator('.del__oppsummering').click()
  await p.locator('.oppg__navn').first().waitFor()
  for (let i = 1; i < trenere; i++) await trenerBrikker().nth(i).click()
  await p.locator('.del__hoved', { hasText: 'Del inn' }).click()
  await p.locator('.kort').first().waitFor()
  await vent(400)
  ok('én trener: fortsatt tre grupper, treneren står på én', await p.locator('.kort').count() === 3 && /2 uten trener/.test(await p.locator('.del__linje').innerText().catch(() => '')), await p.locator('.del__linje').innerText().catch(() => ''))
  ok('uten trening: ingen økt i basen', sql(`select count(*) from training_runs where cohort_id='${KULL}' and dato=current_date`) === '0')
} finally {
  ok('ingen sidefeil', feil.length === 0, feil.join(' | '))
  sql(`delete from training_runs where cohort_id='${KULL}' and title like 'QA-%'; delete from training_runs where session_id='${DAG}'; delete from training_runs where cohort_id='${KULL}' and dato = current_date; delete from training_sessions where id='${DAG}'; delete from del_inn where cohort_id='${KULL}'; delete from player_levels where cohort_id='${KULL}'; update training_exercises set per_gruppe=${FOR} where id='${DIFF}'`)
  if (kampIder) sql(`update matches set match_date = match_date - 365 where id in ${kampIder}`)
  await b.close()
}
process.exit(feilet ? 1 : 0)
