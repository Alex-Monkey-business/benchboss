// Del inn, delt: det én trener teller opp og deler inn, ser den andre.
// To telefoner, mot lokal base.
//   QA_APP=http://localhost:5176 node scripts/del-inn-delt-test.mjs
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'
const API = process.env.QA_API || 'http://127.0.0.1:54321'
const APP = process.env.QA_APP || 'http://localhost:5176'
const OUT = process.env.QA_OUT || '/tmp'
const SVC = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const KULL = 'af104bf3-02f4-4067-a0db-bf285f5d8f39'
let feilet = 0
const ok = (l, c, x = '') => { if (!c) feilet++; console.log(`${c ? 'OK  ' : 'FEIL'} ${l}${x ? '  — ' + x : ''}`) }
const sql = q => execSync(`docker exec -e PGPASSWORD=postgres supabase_db_halsen-dommerutlegg psql -U postgres -Atc ${JSON.stringify(q)}`).toString().trim()
const vent = ms => new Promise(r => setTimeout(r, ms))
async function inntil(fn, ms = 12000) {
  const slutt = Date.now() + ms
  while (Date.now() < slutt) { try { if (await fn()) return true } catch {} await vent(300) }
  return false
}

const UKEDAG = new Date().getDay() || 7
// Dagens treninger flyttes en dag mens første del går: da er det «ikke
// trening i dag», og oppmøtet står i Del inn-raden.
const flyttet = sql(`select coalesce(string_agg(id::text, ','), '') from training_sessions where cohort_id='${KULL}' and weekday=${UKEDAG}`)
const flyttIder = flyttet ? `('${flyttet.split(',').join("','")}')` : null
if (flyttIder) sql(`update training_sessions set weekday=${UKEDAG % 7 + 1} where id in ${flyttIder}`)
sql(`delete from del_inn where cohort_id='${KULL}'`)
sql(`delete from training_runs where cohort_id='${KULL}' and dato=current_date`)
let qaDag = null

const b = await chromium.launch()
const feil = []
async function logginn(epost) {
  const r = await fetch(`${API}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email: epost }) })
  const j = await r.json(); const tok = j.hashed_token || j.properties?.hashed_token
  const c = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await c.newPage()
  p.on('pageerror', e => feil.push(e.message))
  p.on('console', m => { if (m.type() === 'warning' && /\[Vue warn\]/.test(m.text())) feil.push(m.text().slice(0, 160)) })
  await p.goto(`${APP}/auth/klar?t=${tok}&type=magiclink`)
  await p.getByRole('button', { name: /Logg inn/ }).click()
  await p.waitForURL(u => !/\/auth|\/login/.test(u.pathname), { timeout: 20000 })
  await p.evaluate(k => localStorage.setItem('bb_active_cohort', k), KULL)
  return p
}
const antallHer = async p => Number((await p.locator('.del__her strong').first().innerText()).trim())

try {
  const alex = await logginn('alexander.samnoy@gmail.com')
  const iver = await logginn('iver.vestre@gmail.com')
  await alex.goto(`${APP}/del-inn`)
  await iver.goto(`${APP}/del-inn`)
  await alex.locator('.del__her').waitFor({ timeout: 15000 })
  await iver.locator('.del__her').waitFor({ timeout: 15000 })
  const alle = await antallHer(alex)
  ok('Ingen trening i dag: hele kullet er med', alle > 10, `${alle}`)
  ok('Begge ser samme antall før noe er gjort', alle === await antallHer(iver))

  // Alex trykker bort to spillere.
  await alex.locator('.del__her').click()
  const brikker = alex.locator('.ds-sheet .oppg button').filter({ hasNotText: /rigger/i })
  await brikker.nth(0).click()
  await brikker.nth(1).click()
  await alex.getByRole('button', { name: 'Ferdig' }).click()
  ok('Alex: to færre', await antallHer(alex) === alle - 2)
  ok('Iver ser to færre innen noen sekunder', await inntil(async () => await antallHer(iver) === alle - 2), `${await antallHer(iver)}`)
  ok('Lagret i del_inn', Number(sql(`select coalesce(array_length(spillere,1),0) from del_inn where cohort_id='${KULL}' and dato=current_date`)) === alle - 2)

  // Alex bytter til Lag og trekker på nytt.
  await alex.getByRole('tab', { name: 'Lag' }).click()
  ok('Iver bytter til Lag', await inntil(async () => (await iver.getByRole('tab', { name: 'Lag' }).getAttribute('aria-selected')) === 'true'))
  await alex.getByRole('button', { name: 'Trekk på nytt' }).click()
  const lagA = async p => (await p.locator('.kort__navn').allInnerTexts()).join('|')
  ok('Samme lag på begge telefonene', await inntil(async () => (await lagA(alex)) === (await lagA(iver)) && (await lagA(alex)).length > 0))
  ok('Iver ser hvem som endret', await inntil(async () => /av Alex/.test(await iver.locator('.del__delt').innerText())), await iver.locator('.del__delt').innerText())
  await iver.screenshot({ path: `${OUT}/del-inn-delt-iver.png`, fullPage: true })

  // Iver endrer antall — Alex følger.
  await iver.getByRole('tab', { name: 'Grupper' }).click()
  await iver.getByRole('button', { name: 'Mix' }).click()
  await iver.getByRole('button', { name: 'Flere' }).click()
  const grupper = async p => p.locator('.kort').count()
  ok('Alex følger Ivers grupper', await inntil(async () => (await grupper(alex)) === (await grupper(iver)) && (await lagA(alex)) === (await lagA(iver))))

  // Rent nivå / Like store: delt, og gir ulike gruppestørrelser når nivåene er skjeve.
  await iver.getByRole('button', { name: 'Diff' }).click()
  await iver.getByRole('button', { name: /Rent nivå/ }).click()
  const storrelser = async p => (await p.locator('.kort__ant').allInnerTexts()).join(',')
  ok('Alex får Rent nivå', await inntil(async () => (await alex.getByRole('button', { name: /Rent nivå/ }).getAttribute('aria-pressed')) === 'true'))
  const rent = await storrelser(alex)
  await alex.getByRole('button', { name: /Like store/ }).click()
  ok('Like store: maks én i forskjell', await inntil(async () => { const t = (await storrelser(alex)).split(',').map(Number); return Math.max(...t) - Math.min(...t) <= 1 }), `rent ${rent} → like ${await storrelser(alex)}`)
  ok('Iver ser Like store', await inntil(async () => (await storrelser(iver)) === (await storrelser(alex))))

  // Gjest fra et annet lag: med i fordelingen hos begge.
  const forGjest = await antallHer(iver)
  await alex.locator('.del__her').click()
  await alex.getByRole('button', { name: 'Legg til gjest' }).click()
  await alex.getByLabel('Navn på gjesten').fill('Gjestemann')
  await alex.locator('.gjest').getByRole('button', { name: 'A' }).click()
  await alex.getByRole('button', { name: 'Legg til', exact: true }).click()
  await alex.screenshot({ path: `${OUT}/del-inn-gjest-ark.png` })
  await alex.getByRole('button', { name: 'Ferdig' }).click()
  ok('Iver får gjesten med i tellingen', await inntil(async () => await antallHer(iver) === forGjest + 1), `${await antallHer(iver)}`)
  ok('Gjesten står i en gruppe hos Iver, merket som gjest', await inntil(async () => /Gjestemann gjest/.test((await iver.locator('.kortene').innerText()).replace(/\s+/g, ' '))))
  await iver.screenshot({ path: `${OUT}/del-inn-gjest.png`, fullPage: true })
  await iver.locator('.del__her').click()
  await iver.getByRole('button', { name: 'Fjern Gjestemann' }).click()
  await iver.getByRole('button', { name: 'Ferdig' }).click()
  ok('Gjesten fjernet hos Alex', await inntil(async () => await antallHer(alex) === forGjest))

  // Hjem viser at det er delt inn.
  await iver.goto(`${APP}/`)
  ok('Hjem: Del inn viser «delt … av Iver» for Iver selv som «deg»', await inntil(async () => /delt \d\d[.:]\d\d av deg/.test(await iver.locator('.hjem-delinn').innerText())), await iver.locator('.hjem-delinn').innerText().catch(() => ''))
  await alex.goto(`${APP}/`)
  ok('Hjem: Alex ser at Iver delte inn', await inntil(async () => /av Iver/.test(await alex.locator('.hjem-delinn').innerText())), await alex.locator('.hjem-delinn').innerText().catch(() => ''))
  await alex.screenshot({ path: `${OUT}/del-inn-delt-hjem.png` })

  // Start på nytt nullstiller hos begge.
  await alex.goto(`${APP}/del-inn`)
  await iver.goto(`${APP}/del-inn`)
  await alex.getByRole('button', { name: 'Start på nytt' }).click()
  ok('Nullstilt: hele kullet igjen hos Iver', await inntil(async () => await antallHer(iver) === alle))

  // Trening i dag: første trykk lagrer oppmøtet på økta (statistikken).
  const DIFF = sql(`select id from training_exercises where type='diff' and club_id=(select club_id from cohorts where id='${KULL}') order by name limit 1`)
  qaDag = sql(`insert into training_sessions (cohort_id, title, weekday, position, drills) values ('${KULL}', 'QA-delt', ${UKEDAG}, 97, jsonb_build_array(jsonb_build_object('type','diff','text','QA diff','exercise_id','${DIFF}','minutes',20))) returning id`).split('\n')[0]
  await alex.reload(); await iver.reload()
  await alex.locator('.del__her').waitFor({ timeout: 15000 })
  await alex.locator('.del__her').click()
  await alex.locator('.ds-sheet .oppg button').nth(2).click()
  await alex.getByRole('button', { name: 'Ferdig' }).click()
  ok('Trening i dag: oppmøtet ble lagret på økta', await inntil(async () => Number(sql(`select count(*) from training_run_players rp join training_runs r on r.id=rp.run_id where r.session_id='${qaDag}' and r.dato=current_date`)) === alle - 1))
  ok('Iver ser samme oppmøte', await inntil(async () => await antallHer(iver) === alle - 1), `${await antallHer(iver)}`)

  // Kjøreplanen: ingen grupper eller lag, men en vei til Del inn.
  await alex.goto(`${APP}/trening/okt/${qaDag}`)
  await alex.locator('.plan').waitFor({ timeout: 15000 })
  ok('Kjøreplanen har ingen gruppekort', await alex.locator('#grupper, #lag, .fase__endre').count() === 0)
  ok('Kjøreplanen lenker til Del inn', await alex.locator('.plan__delinn').count() === 1)
  await alex.screenshot({ path: `${OUT}/okt-uten-grupper.png`, fullPage: true })
} catch (e) {
  feilet++
  console.log('FEIL', e.message)
} finally {
  await b.close()
  if (qaDag) {
    sql(`delete from training_runs where session_id='${qaDag}'`)
    sql(`delete from training_sessions where id='${qaDag}'`)
  }
  if (flyttIder) sql(`update training_sessions set weekday=${UKEDAG} where id in ${flyttIder}`)
  sql(`delete from del_inn where cohort_id='${KULL}'`)
}
const ekte = feil.filter(f => !/Failed to fetch|NetworkError/.test(f))
ok('Ingen feil i konsollen', !ekte.length, ekte.slice(0, 3).join(' / '))
console.log(feilet ? `\n${feilet} feilet` : '\nAlt ok')
process.exit(feilet ? 1 : 0)
