// Oppmøtet: hvem er her → kjøreplanen med gjenger og lag, delt live mellom
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
  // Trening fra menyen: uka lukket, og bare dagens kort har «Oppmøte».
  await p.goto(`${APP}/trening`)
  await p.locator('.dag').first().waitFor({ timeout: 15000 })
  await vent(600)
  ok('Trening fra menyen: alle dagene lukket', await p.locator('.dag--open').count() === 0)
  const iDag = await p.locator('.dag', { hasText: 'QA-økt' }).locator('.dag__start').count()
  const andre = await p.locator('.dag__start').count()
  ok('dagens trening har «Oppmøte» på det lukkede kortet', iDag === 1)
  const iDagEkte = Number(sql(`select count(*) from training_sessions where cohort_id='${KULL}' and weekday=${UKEDAG} and title <> 'QA-økt' and jsonb_array_length(drills) > 0`))
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
  ok('dagen har «Registrer oppmøte»', /Registrer oppmøte/.test(await p.locator('.okt-start').innerText()))
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
  const riggAnsvar = sql(`select c.name from coach_responsibilities r join coaches c on c.id = r.coach_id where r.cohort_id='${KULL}' and r.area ilike '%rigg%' limit 1`).split(' ')[0]
  if (riggAnsvar) ok('standard rigger er den med rigg som ansvarsområde', (await p.locator('.oppg__rigger').innerText()).includes(riggAnsvar), `${riggAnsvar}: ${await p.locator('.oppg__rigger').innerText()}`)
  const startY = (await p.locator('.okt__start').boundingBox()).y
  for (let k = 0; k < 6; k++) await p.locator('.oppg__grid').first().locator('.oppg__navn').nth(k * 3).click()
  await p.locator('.oppg__grid').nth(1).locator('.oppg__navn').last().click()
  await p.locator('.oppg__rigger').click()
  const riggerNavn = (await p.locator('.oppg__valg-knapp').nth(1).innerText()).trim()
  await p.locator('.oppg__valg-knapp').nth(1).click()
  ok('riggerlinja viser valget', (await p.locator('.oppg__rigger').innerText()).includes(riggerNavn), await p.locator('.oppg__rigger').innerText())
  ok('riggeren er markert på brikken', await p.locator('.oppg__navn--rigger').count() === 1)
  ok('telleren viser 21 av 27', /21\s*av\s*27/.test(await p.locator('.oppm__teller').first().innerText()))
  const linje = await p.locator('.oppm__linje').innerText()
  ok('linja over knappen: gjenger, lag og at det lagres', /\d+ grupper og \d+ lag\.\s+Oppmøtet lagres når du går videre/.test(linje), linje)
  const sluttY = (await p.locator('.okt__start').boundingBox()).y
  ok('knappen står stille mens du trykker', likt(sluttY, startY), `${startY} → ${sluttY}`)
  await p.screenshot({ path: `${OUT}/okt-oppmote.png` })
  await p.locator('.okt__start').click()
  await p.locator('.rad').first().waitFor({ timeout: 10000 })
  const RUN = sql(`select id from training_runs where session_id='${DAG}'`)
  ok('oppmøtet lagret med 21 spillere', sql(`select count(*) from training_run_players where run_id='${RUN}'`) === '21')
  ok('oppmøtet gjelder i dag', sql(`select dato = current_date from training_runs where id='${RUN}'`) === 't')
  ok('gjengene lagret på økta', Number(sql(`select jsonb_array_length(state->'_gjenger') from training_runs where id='${RUN}'`)) >= 2)
  ok('lagene lagret på økta', sql(`select state ? '_lag' from training_runs where id='${RUN}'`) === 't')
  await p.goto(`${APP}/trening/dag/${DAG}`)
  await p.locator('.okt-start').waitFor({ timeout: 15000 })
  await vent(800)
  ok('dagen viser «Kjøreplanen · 21 her»', /Kjøreplanen[\s\S]*21 her/.test(await p.locator('.okt-start').innerText()), await p.locator('.okt-start').innerText())
  await p.goto(`${APP}/trening/okt/${DAG}`)
  await p.locator('.rad').first().waitFor({ timeout: 10000 })
  ok(`og ${trenere - 1} trenere`, sql(`select count(*) from training_run_coaches where run_id='${RUN}'`) === String(trenere - 1))
  ok('sesongen satt på økta', sql(`select season_id is not null from training_runs where id='${RUN}'`) === 't')
  ok('økta har rotasjonsrunden lagret', /^\d+$/.test(sql(`select state->>'_runde' from training_runs where id='${RUN}'`)))
  ok('riggeren står bare på trenerbrikken, ikke i kjøreplanen', await p.locator('.plan__rigger').count() === 0 && !(await p.locator('.plan').innerText()).includes('Rigger'))

  // Kjøreplanen: gjengene, lagene, øvelsene — på én side.
  const gjengNavn = async (side, i) => (await side.locator('.fase').first().locator('.gjeng').nth(i).locator('.gjeng__navn').innerText()).split(' · ').map(x => x.trim())
  const antGjenger = await p.locator('.fase').first().locator('.gjeng').count()
  ok('Grupper (Diff) står først', /^Grupper\s+Diff/.test(await p.locator('.fase').first().innerText()) && antGjenger >= 2, String(antGjenger))
  ok('diff-øvelsen står under gruppene', await p.locator('.fase').first().locator('.rad').count() === 1)
  ok('ingen «Del inn»-knapp i kjøreplanen', await p.locator('.plan__fordel').count() === 0)
  let alle = []
  for (let i = 0; i < antGjenger; i++) alle = alle.concat(await gjengNavn(p, i))
  ok('alle 21 i nøyaktig én gjeng', alle.length === 21 && new Set(alle).size === 21, String(alle.length))
  ok('riggeren står utenfor gjengene', !(await p.locator('.gjeng__trener').allInnerTexts()).join(' ').includes(riggerNavn), riggerNavn)
  ok('ingen gjeng har A og C', !(await p.locator('.gjeng__niva').allInnerTexts()).some(t => t.includes('A') && t.includes('C')))
  ok('Lag (Mix) med øvelsen og banene', /^Lag\s+Mix/.test(await p.locator('.fase').nth(1).innerText()) && await p.locator('.fase').nth(1).locator('.rad').count() === 1 && await p.locator('.bane').count() >= 1)
  ok('ingen merknad i baneoverskriften', !/spiller med/.test(await p.locator('.plan').innerText()))
  ok('lagene heter etter vestfarge', /Gul/.test(await p.locator('.fase').nth(1).innerText()))
  ok('én rad per øvelse', await p.locator('.rad').count() === 2)
  const meta = await p.locator('.rad').first().locator('.rad__meta').innerText()
  ok('diff-øvelsen: tid og hvordan i gjengene', /20 min · /.test(meta) && /gruppe|deles|sammen|grupper/.test(meta), meta)
  ok('mix-øvelsen: fire lag uten tall på øvelsen (fem per lag)', /4 lag/.test(await p.locator('.rad').nth(1).locator('.rad__meta').innerText()))
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
  await p.locator('.fot__knapp', { hasText: 'Lukk' }).click()
  await vent(400)

  // En annen trener ser samme gjenger.
  const iver = await logginn('iver.vestre@gmail.com')
  await iver.goto(`${APP}/trening/okt/${DAG}`)
  await iver.locator('.rad').first().waitFor({ timeout: 15000 })
  ok('Iver lander rett i kjøreplanen', /21/.test(await iver.locator('.okt__her').innerText()))
  ok('samme gjeng 1 på begge telefonene', JSON.stringify(await gjengNavn(p, 0)) === JSON.stringify(await gjengNavn(iver, 0)))

  // Antall lag velges i arket; nye lag trekkes og lagres, Iver ser det samme.
  await p.locator('.rad').nth(1).click()
  await p.locator('.antall').waitFor()
  ok('arket har valg for antall lag', /Lag/.test(await p.locator('.antall__navn').innerText()) && /4/.test(await p.locator('.antall__knapp--valgt').innerText()))
  await p.locator('.antall__knapp', { hasText: '3' }).click()
  await vent(300)
  ok('valgt 3: metalinja sier 3 lag', /3 lag/.test(await p.locator('.ds-sheet .ark__meta').innerText()))
  ok('valget står på økta', sql(`select count(*) from training_runs where id='${RUN}' and jsonb_array_length(state->'_lag'->'3') = 3 and state ? '_antall'`) === '1')
  await p.locator('.fot__knapp', { hasText: 'Lukk' }).click()
  await vent(400)
  ok('Lagene har nå 3 lag', /Blå/.test(await p.locator('.fase').nth(1).innerText()) && !/Grønn/.test(await p.locator('.fase').nth(1).innerText()))
  ok('Iver ser 3 lag', await inntil(async () => /3 lag/.test(await iver.locator('.rad').nth(1).locator('.rad__meta').innerText())))

  // Iver melder en borte fra Endre; jeg ser 20.
  await iver.locator('.fase__endre').first().click()
  await iver.waitForURL(/\/endre\/grupper$/, { timeout: 5000 })
  await iver.locator('.brikke').first().click()
  await iver.locator('.fot__tekst', { hasText: 'er ikke her' }).click()
  ok('Ivers «ikke her» når meg uten omlasting', await inntil(async () => /^20/.test((await p.locator('.okt__her').innerText()).trim())), await p.locator('.okt__her').innerText())
  ok('og står i basen', sql(`select count(*) from training_run_players where run_id='${RUN}'`) === '20')
  await iver.locator('.okt__start', { hasText: 'Ferdig' }).click()
  await iver.waitForURL(/\/trening\/okt\/[^/]+$/, { timeout: 5000 })
  ok('Ferdig går tilbake til kjøreplanen', true)

  // Jeg flytter én til nabogjengen; Iver ser det, ingen andre flytter seg.
  const for1 = await gjengNavn(p, 0)
  await p.locator('.fase__endre').first().click()
  await p.waitForURL(/\/endre\/grupper$/, { timeout: 5000 })
  ok('Endre er en egen side: «Grupper» med Diff', /Grupper/.test(await p.locator('.okt__title').innerText()) && /Diff/.test(await p.locator('.okt__tag').innerText()))
  ok('Endre viser antall og trenere øverst', /20 · \d+ trener/.test(await p.locator('.okt__antall').innerText()), await p.locator('.okt__antall').innerText())
  ok('Endre sier hvilke øvelser det gjelder', /^Gjelder øvelse 1$/.test((await p.locator('.endre__gjelder').innerText()).trim()))
  ok('− og + står på antallet', (await p.locator('.steg__tall').innerText()).trim() === String(antGjenger))
  await p.locator('.endre-gr').first().locator('.brikke').first().click()
  const flyttet = (await p.locator('.brikke--valgt').innerText()).trim()
  const mal = await p.locator('.mal__knapp').count()
  ok('bare nabogrupper som valg', mal >= 1 && mal < antGjenger)
  await p.screenshot({ path: `${OUT}/endre-grupper.png` })
  await p.locator('.mal__knapp').first().click()
  await p.locator('.okt__start', { hasText: 'Ferdig' }).click()
  await p.waitForURL(/\/trening\/okt\/[^/]+$/, { timeout: 5000 })
  await vent(400)
  ok('kjøreplanen sier hvem som endret', /Endret \d{2}:\d{2}/.test(await p.locator('.fase').first().innerText()))
  const etter1 = await gjengNavn(p, 0)
  ok('flyttet ut av gjeng 1, resten står', !etter1.includes(flyttet) && for1.filter(x => x !== flyttet).every(x => etter1.includes(x)), `${flyttet}`)
  ok('flyttingen når Iver', await inntil(async () => !(await gjengNavn(iver, 0)).includes(flyttet)), flyttet)

  // Kom for sent: inn i en gjeng og på et lag, ingen andre flyttes.
  const lagret = () => JSON.parse(sql(`select state->'_gjenger' from training_runs where id='${RUN}'`))
  const for2 = lagret()
  await p.locator('.okt__her').click()
  await p.locator('.oppg__navn--borte').first().click()
  await vent(600)
  const inn = await p.locator('.inn').innerText()
  ok('bekreftelsen sier hvor', /er med/.test(inn) && /-gruppa/.test(inn) && /lag\./.test(inn), inn.replace(/\n/g, ' | '))
  await p.locator('.fot__knapp', { hasText: 'Ferdig' }).click()
  await vent(1500)
  const etter2 = lagret()
  ok('ingen andre flyttet', for2.every(g => g.spillere.every(id => etter2.find(x => x.id === g.id).spillere.includes(id))))
  ok('kom for sent: 21 igjen', /^21/.test((await p.locator('.okt__her').innerText()).trim()))

  // Endre lagene: samme side, med Trekk på nytt og flytting mellom lag.
  await p.locator('.fase__endre').nth(1).click()
  await p.waitForURL(/\/endre\/lag\/3$/, { timeout: 5000 })
  ok('Endre lagene: «Lag» med Mix og 3 lag', /Lag/.test(await p.locator('.okt__title').innerText()) && /Mix/.test(await p.locator('.okt__tag').innerText()) && await p.locator('.endre-gr').count() === 3)
  ok('infolinja sier baner og størrelse', /\d+ baner?, \d+(–\d+)? på hvert lag/.test(await p.locator('.endre__info').innerText()), await p.locator('.endre__info').innerText())
  const lagFor = sql(`select state->'_lag'->'3' from training_runs where id='${RUN}'`)
  await p.locator('.endre__trekk').click()
  ok('Trekk på nytt gir nye lag', await inntil(() => sql(`select state->'_lag'->'3' from training_runs where id='${RUN}'`) !== lagFor))
  await p.locator('.endre-gr').first().locator('.brikke').first().click()
  ok('et lag kan flyttes til alle de andre lagene', await p.locator('.mal__knapp').count() === 2)
  const flyttLag = (await p.locator('.brikke--valgt').innerText()).trim()
  await p.locator('.mal__knapp').first().click()
  await vent(300)
  ok('spilleren byttet lag', !(await p.locator('.endre-gr').first().innerText()).includes(flyttLag) || (await p.locator('.endre-gr').first().locator('.brikke').allInnerTexts()).every(t => t.trim() !== flyttLag))
  await p.locator('.steg__knapp[aria-label="Flere"]').click()
  await p.waitForURL(/\/endre\/lag\/4$/, { timeout: 5000 })
  ok('+ gir 4 lag', await p.locator('.endre-gr').count() === 4)
  await p.screenshot({ path: `${OUT}/endre-lag.png` })
  await p.locator('.okt__back').click()
  await p.waitForURL(/\/trening\/okt\/[^/]+$/, { timeout: 5000 })
  ok('kjøreplanen har nå 4 lag', /Grønn/.test(await p.locator('.fase').nth(1).innerText()))

  // Del inn fra Hjem: samme motor, egne valg, og «Bruk som dagens grupper».
  await p.goto(`${APP}/`)
  await p.locator('.hjem-delinn').waitFor({ timeout: 15000 })
  ok('dagens trening på Hjem går til kjøreplanen', (await p.locator('.today-training').getAttribute('href')) === `/trening/okt/${DAG}` || await p.locator(`a[href="/trening/okt/${DAG}"]`).count() >= 1)
  await p.locator('.hjem-delinn').click()
  await p.waitForURL(/\/del-inn$/, { timeout: 5000 })
  await p.locator('.kort').first().waitFor({ timeout: 15000 })
  ok('Del inn bruker dagens oppmøte', /^21 spillere/.test((await p.locator('.del__her').innerText()).trim()), await p.locator('.del__her').innerText())
  const kortNavn = async () => (await p.locator('.kort__navn').allInnerTexts()).map(t => t.split(' · '))
  let dk = await kortNavn()
  ok('Grupper: alle 21 én gang, ingen A og C sammen', dk.flat().length === 21 && new Set(dk.flat()).size === 21 && !(await p.locator('.kort__niva').allInnerTexts()).some(t => t.includes('A') && t.includes('C')))
  await p.locator('.steg__knapp[aria-label="Færre"]').click()
  await vent(200)
  ok('− gir én gruppe mindre', (await kortNavn()).length === dk.length - 1)
  await p.locator('.seg__knapp', { hasText: 'Lag' }).click()
  await vent(200)
  ok('Lag-fanen: baner og vestfarger', await p.locator('.bane').count() >= 1 && /Gul/.test((await p.locator('.kort').allInnerTexts()).join(' ')))
  ok('Lag-fanen: infolinja og Trekk på nytt', /baner?, /.test(await p.locator('.del__info').innerText()) && await p.locator('.del__trekk').count() === 1)
  const forTrekk = JSON.stringify(await kortNavn())
  await p.locator('.del__trekk').click()
  await vent(200)
  ok('Trekk på nytt gir nye lag', JSON.stringify(await kortNavn()) !== forTrekk)
  ok('knappen heter «Bruk som dagens lag»', /Bruk som dagens lag/.test(await p.locator('.del__bruk').innerText()))
  await p.locator('.seg__knapp', { hasText: 'Grupper' }).click()
  await vent(200)
  ok('Grupper-fanen husker sitt antall', (await kortNavn()).length === dk.length - 1)
  // Kristian tas bort: én trener mindre.
  const trFor = Number((await p.locator('.del__her').innerText()).match(/(\d+) trener/)[1])
  await p.locator('.del__her').click()
  await p.locator('.ds-sheet .oppg__grid').nth(1).locator('.oppg__navn:not(.oppg__navn--borte)').first().click()
  ok('ingen riggervalg i Del inn', await p.locator('.ds-sheet .oppg__rigger').count() === 0)
  await p.locator('.ds-sheet .del__bruk', { hasText: 'Ferdig' }).click()
  await vent(300)
  ok('en trener tatt bort i Del inn', (await p.locator('.del__her').innerText()).includes(`${trFor - 1} trener`), await p.locator('.del__her').innerText())
  ok('bare på denne telefonen', sql(`select count(*) from training_run_coaches where run_id='${RUN}'`) === String(trenere - 1))
  await p.screenshot({ path: `${OUT}/del-inn.png` })
  const lagForBytte = sql(`select state->'_lag' from training_runs where id='${RUN}'`)
  const gjengerForBytte = sql(`select state->'_gjenger' from training_runs where id='${RUN}'`)
  dk = await kortNavn()
  await p.locator('.del__bruk', { hasText: 'Bruk som dagens grupper' }).click()
  await p.waitForURL(/\/trening\/okt\/[^/#]+#grupper$/, { timeout: 5000 })
  await p.locator('.ds-toast', { hasText: 'Dagens grupper er byttet' }).waitFor({ timeout: 5000 })
  ok('«Bruk som dagens grupper» gir melding med Angre', await p.locator('.ds-toast__action', { hasText: 'Angre' }).count() === 1)
  ok('gruppene er byttet på økta', await inntil(() => JSON.parse(sql(`select state->'_gjenger' from training_runs where id='${RUN}'`)).length === dk.length))
  ok('lagene står urørt', sql(`select state->'_lag' from training_runs where id='${RUN}'`) === lagForBytte)
  await p.locator('.gjeng').first().waitFor()
  ok('kjøreplanen viser de nye gruppene', await p.locator('.fase').first().locator('.gjeng').count() === dk.length)
  ok('og «Endret … av»', /Endret \d{2}:\d{2} av /.test(await p.locator('.fase').first().innerText()), await p.locator('.fase__endret').first().innerText())
  ok('Iver ser de nye gruppene', await inntil(async () => await iver.locator('.fase').first().locator('.gjeng').count() === dk.length))
  await p.locator('.ds-toast__action', { hasText: 'Angre' }).click()
  ok('Angre setter gruppene tilbake', await inntil(() => sql(`select state->'_gjenger' from training_runs where id='${RUN}'`) === gjengerForBytte))

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
  await forelder.goto(`${APP}/`)
  await vent(2500)
  ok('forelder har ingen Del inn på Hjem', await forelder.locator('.hjem-delinn').count() === 0)
  await forelder.goto(`${APP}/del-inn`)
  await vent(2500)
  ok('forelder sendes bort fra Del inn', !/\/del-inn/.test(forelder.url()) && await forelder.locator('.kort').count() === 0, forelder.url())
  ok('forelder får null rader fra basen', await forelder.evaluate(async () => {
    const m = await import('/src/supabase.js')
    const [a, b] = await Promise.all([m.supabase.from('training_runs').select('id'), m.supabase.from('training_run_players').select('player_id')])
    return (a.data || []).length + (b.data || []).length
  }) === 0)

  // Nullstill: oppmøtet går, og det teller ikke i statistikken.
  await p.goto(`${APP}/trening/okt/${DAG}`)
  await p.locator('.okt__slett').click()
  await p.getByRole('button', { name: 'Nullstill' }).last().click()
  await vent(1200)
  ok('nullstill fjerner oppmøtet', sql(`select count(*) from training_runs where session_id='${DAG}'`) === '0')
  ok('nullstill gir «Hvem er her?» med alle på igjen', await p.locator('.oppg__navn').count() > 0 && await p.locator('.oppg__navn--borte').count() === 0)
  await p.goto(`${APP}/trening/dag/${DAG}`)
  await p.locator('.okt-start').waitFor({ timeout: 15000 })
  await vent(800)
  ok('dagen sier «Registrer oppmøte» igjen', /Registrer oppmøte/.test(await p.locator('.okt-start').innerText()))

  // Ikke treningsdag: kjøreplanen vises, ingenting lagres.
  sql(`update training_sessions set weekday=${UKEDAG % 7 + 1} where id='${DAG}'`)
  await p.goto(`${APP}/trening/okt/${DAG}`)
  await p.locator('.okt__start').waitFor({ timeout: 15000 })
  ok('andre dager sier at oppmøtet ikke lagres', /lagres ikke/.test(await p.locator('.oppm__linje').innerText()))
  await p.locator('.okt__start').click()
  await p.locator('.rad').first().waitFor({ timeout: 10000 })
  await vent(6000)
  ok('kjøreplanen vises og står etter neste henting', await p.locator('.rad').count() === 2 && await p.locator('.plan__lokal').count() === 1)
  ok('ingenting i basen', sql(`select count(*) from training_runs where session_id='${DAG}'`) === '0')

  // Del inn en dag uten trening: hele kullet, ingen «Bruk som dagens …».
  await p.goto(`${APP}/del-inn`)
  await p.locator('.kort').first().waitFor({ timeout: 15000 })
  await vent(800)
  ok('Del inn uten trening i dag: hele kullet', new RegExp(`^${antall} spillere`).test((await p.locator('.del__her').innerText()).trim()), await p.locator('.del__her').innerText())
  ok('og ingen «Bruk som dagens …»', await p.locator('.del__bruk').count() === 0)
} finally {
  ok('ingen sidefeil', feil.length === 0, feil.join(' | '))
  sql(`delete from training_runs where cohort_id='${KULL}' and title like 'QA-%'; delete from training_sessions where id='${DAG}'; delete from player_levels where cohort_id='${KULL}'; update training_exercises set per_gruppe=${FOR} where id='${DIFF}'`)
  await b.close()
}
process.exit(feilet ? 1 : 0)
