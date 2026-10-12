// Del inn og Endre i kantene: dobbelttrykk, ingen med, omlasting midt i
// Endre, en dag uten trening, og PC-bredde. Mot lokal base.
//   QA_APP=http://localhost:5179 node scripts/del-inn-qa.mjs
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

const hadde = Number(sql(`select count(*) from player_levels pl join players p on p.id = pl.player_id where p.cohort_id='${KULL}'`))
if (!hadde) sql(`insert into player_levels (player_id, level) select id, (array['A','B','C'])[1 + (row_number() over (order by name))::int % 3] from players where cohort_id='${KULL}'`)
const KLUBB = `(select club_id from cohorts where id='${KULL}')`
const DIFF = sql(`select id from training_exercises where type='diff' and club_id=${KLUBB} order by name limit 1`)
const MIX = sql(`select id from training_exercises where type='mix' and club_id=${KLUBB} order by name limit 1`)
const UKEDAG = new Date().getDay() || 7
sql(`delete from training_sessions where cohort_id='${KULL}' and title='QA-kant'`)
const DAG = sql(`insert into training_sessions (cohort_id, title, weekday, position, drills) values ('${KULL}', 'QA-kant', ${UKEDAG}, 98, jsonb_build_array(jsonb_build_object('type','diff','text','QA diff','exercise_id','${DIFF}','minutes',20), jsonb_build_object('type','mix','text','QA mix','exercise_id','${MIX}','minutes',20))) returning id`).split('\n')[0]
// Andre treninger i dag skal ikke stjele Del inn: de flyttes en dag mens testen går.
const flyttet = sql(`select string_agg(id::text, ',') from training_sessions where cohort_id='${KULL}' and weekday=${UKEDAG} and id <> '${DAG}'`)
if (flyttet) sql(`update training_sessions set weekday=${UKEDAG % 7 + 1} where id in ('${flyttet.split(',').join("','")}')`)

const b = await chromium.launch()
const feil = []
async function logginn(epost, viewport = { width: 390, height: 844 }) {
  const r = await fetch(`${API}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email: epost }) })
  const j = await r.json(); const tok = j.hashed_token || j.properties?.hashed_token
  const c = await b.newContext({ viewport }); const p = await c.newPage()
  p.on('pageerror', e => feil.push(e.message))
  p.on('console', m => { if (m.type() === 'warning' && /\[Vue warn\]/.test(m.text())) feil.push(m.text().slice(0, 160)) })
  await p.goto(`${APP}/auth/klar?t=${tok}&type=magiclink`)
  await p.getByRole('button', { name: /Logg inn/ }).click()
  await p.waitForURL(u => !/\/auth|\/login/.test(u.pathname), { timeout: 20000 })
  await p.evaluate(k => localStorage.setItem('bb_active_cohort', k), KULL)
  return p
}

try {
  const p = await logginn('alexander.samnoy@gmail.com')

  // Hjem før oppmøtet: kortet går til opptellingen og sier at det ikke er telt.
  await p.goto(`${APP}/`)
  await p.locator('.today-training').waitFor({ timeout: 15000 })
  await inntil(async () => /ikke telt opp/.test(await p.locator('.today-training').innerText()))
  ok('Hjem: «ikke telt opp ennå» før oppmøtet', /ikke telt opp ennå/.test(await p.locator('.today-training').innerText()), await p.locator('.today-training').innerText())
  await p.locator('.today-training').click()
  await p.waitForURL(new RegExp(`/trening/okt/${DAG}$`), { timeout: 5000 })
  ok('kortet går rett til opptellingen', await p.locator('.oppg__navn').first().waitFor({ timeout: 10000 }).then(() => true, () => false))

  // Del inn uten lagret oppmøte i dag: hele kullet, og knappen starter økta.
  await p.goto(`${APP}/del-inn`)
  await p.locator('.kort').first().waitFor({ timeout: 15000 })
  ok('ikke telt opp: «Start dagens trening med disse»', /Start dagens trening med disse/.test(await p.locator('.del__fot .del__bruk').innerText().catch(() => '')))

  // Ingen med: melding, ingen krasj, knappene står.
  await p.locator('.del__her').click()
  await p.locator('.ds-sheet .oppg__navn').first().waitFor()
  const n = await p.locator('.ds-sheet .oppg__grid').first().locator('.oppg__navn').count()
  for (let i = 0; i < n; i++) await p.locator('.ds-sheet .oppg__grid').first().locator('.oppg__navn').nth(i).click()
  await p.locator('.ds-sheet .del__bruk', { hasText: 'Ferdig' }).click()
  await vent(300)
  ok('ingen med: sier hva du gjør', /Ingen er med/.test(await p.locator('.del').innerText()) && await p.locator('.kort').count() === 0)
  await p.locator('.seg__knapp', { hasText: 'Lag' }).click()
  await p.locator('.steg__knapp[aria-label="Flere"]').click({ force: true })
  ok('ingen med på Lag: fortsatt ingen krasj', /Ingen er med/.test(await p.locator('.del').innerText()))
  // To med: to lag, én bane.
  await p.locator('.del__her').click()
  await p.locator('.ds-sheet .oppg__grid').first().locator('.oppg__navn').nth(0).click()
  await p.locator('.ds-sheet .oppg__grid').first().locator('.oppg__navn').nth(1).click()
  await p.locator('.ds-sheet .del__bruk', { hasText: 'Ferdig' }).click()
  await vent(300)
  ok('to med: to lag på én bane', await p.locator('.bane').count() === 1 && await p.locator('.kort').count() === 2)
  ok('to med: + er sperret', await p.locator('.steg__knapp[aria-label="Flere"]').isDisabled())

  // Start økta fra Del inn: to borte, tre lag, dobbelttrykk. Oppmøtet og
  // lagene lagres slik de sto, gruppene lages som i opptellingen.
  await p.goto(`${APP}/del-inn`)
  await p.locator('.kort').first().waitFor({ timeout: 15000 })
  const alle = Number((await p.locator('.del__her').innerText()).match(/\d+/)[0])
  await p.locator('.del__her').click()
  await p.locator('.ds-sheet .oppg__grid').first().locator('.oppg__navn').nth(0).click()
  await p.locator('.ds-sheet .oppg__grid').first().locator('.oppg__navn').nth(1).click()
  await p.locator('.ds-sheet .del__bruk', { hasText: 'Ferdig' }).click()
  await vent(300)
  await p.locator('.seg__knapp', { hasText: 'Lag' }).click()
  while (Number(await p.locator('.steg__tall').innerText()) > 3) await p.locator('.steg__knapp[aria-label="Færre"]').click()
  while (Number(await p.locator('.steg__tall').innerText()) < 3) await p.locator('.steg__knapp[aria-label="Flere"]').click()
  const vist = (await p.locator('.kort .kort__navn').allInnerTexts()).map(t => t.split(' · ').length).sort().join()
  await p.locator('.del__fot .del__bruk').dblclick()
  await p.waitForURL(new RegExp(`/trening/okt/${DAG}#lag$`), { timeout: 10000 })
  ok('Start fra Del inn lander i kjøreplanen ved lagene', true, p.url())
  await inntil(() => sql(`select count(*) from training_runs where session_id='${DAG}'`) === '1')
  const RUN = sql(`select id from training_runs where session_id='${DAG}'`)
  ok('én økt lagret, også med dobbelttrykk', !!RUN && !RUN.includes('\n'))
  ok('oppmøtet er dem som var med i Del inn', Number(sql(`select count(*) from training_run_players where run_id='${RUN}'`)) === alle - 2)
  ok('ingen trenere valgt: ingen trenere lagret', sql(`select count(*) from training_run_coaches where run_id='${RUN}'`) === '0')
  const lagret = sql(`select string_agg(jsonb_array_length(l)::text, ',' order by jsonb_array_length(l)) from training_runs, jsonb_array_elements(state->'_lag'->'3') l where id='${RUN}'`)
  ok('lagene er de som sto i Del inn', lagret === vist, `${lagret} / ${vist}`)
  ok('mix-øvelsen har 3 lag', sql(`select count(*) from training_runs, jsonb_each(state->'_antall') a where id='${RUN}' and a.value::int = 3`) === '1')
  ok('gruppene er laget som i opptellingen', sql(`select jsonb_array_length(state->'_gjenger') from training_runs where id='${RUN}'`) === '3')
  await p.locator('.rad').first().waitFor({ timeout: 10000 })
  ok('kjøreplanen viser 3 lag', /3 lag/.test(await p.locator('#lag').innerText()), (await p.locator('#lag').innerText()).slice(0, 80))
  await p.goto(`${APP}/`)
  await inntil(async () => /her · planen er klar/.test(await p.locator('.today-training').innerText()))
  ok('Hjem etter oppmøtet: «N her · planen er klar»', /\d+ her · planen er klar/.test(await p.locator('.today-training').innerText()))
  await p.locator('.hjem-delinn').click()
  await p.locator('.del__bruk').waitFor({ timeout: 15000 })
  await p.locator('.del__bruk').dblclick()
  await p.waitForURL(/#grupper$/, { timeout: 5000 })
  await vent(800)
  ok('dobbelttrykk gir én melding', await p.locator('.ds-toast').count() === 1, String(await p.locator('.ds-toast').count()))
  await p.goBack()
  await vent(600)
  ok('tilbake etter bytte går til Del inn, ikke et dødt steg', /\/del-inn$/.test(p.url()), p.url())

  // Omlasting midt i Endre: siden står, med samme grupper.
  await p.goto(`${APP}/trening/okt/${DAG}/endre/grupper`)
  await p.locator('.brikke').first().waitFor({ timeout: 15000 })
  const for1 = await p.locator('.brikke').allInnerTexts()
  await p.reload()
  await p.locator('.brikke').first().waitFor({ timeout: 15000 })
  ok('omlasting i Endre: samme grupper', JSON.stringify(await p.locator('.brikke').allInnerTexts()) === JSON.stringify(for1))
  // − og + i Endre grupper, og tilbake til trenernes antall.
  const start = Number(await p.locator('.steg__tall').innerText())
  await p.locator('.steg__knapp[aria-label="Flere"]').click()
  ok('+ i Endre: én gruppe til', await inntil(async () => (await p.locator('.endre-gr').count()) === start + 1))
  ok('og står på økta', await inntil(() => Number(sql(`select jsonb_array_length(state->'_gjenger') from training_runs where id='${RUN}'`)) === start + 1))
  await p.locator('.steg__knapp[aria-label="Færre"]').click()
  ok('− tilbake', await inntil(async () => (await p.locator('.endre-gr').count()) === start))
  // Ugyldig lag-antall i adressen: ingen krasj.
  await p.goto(`${APP}/trening/okt/${DAG}/endre/lag/99`)
  await vent(2500)
  ok('ugyldig lagantall i adressen: ingen krasj', feil.length === 0, feil.slice(0, 2).join(' | '))

  // PC-bredde: Del inn og Endre står i en smal kolonne, uten sideveis scroll.
  const pc = await logginn('alexander.samnoy@gmail.com', { width: 1280, height: 860 })
  // Hjem: Del inn er like bred som de andre kortene.
  await pc.goto(`${APP}/`)
  await pc.locator('.hjem-delinn').waitFor({ timeout: 15000 })
  const [dw, kw] = await Promise.all([pc.locator('.hjem-delinn').evaluate(e => e.getBoundingClientRect().width), pc.locator('.hjem-stack > .ds-card').first().evaluate(e => e.getBoundingClientRect().width)])
  ok('PC: Del inn på Hjem er like bred som kortene', Math.abs(dw - kw) < 1, `${dw} / ${kw}`)
  for (const [navn, sti, sel] of [['Del inn', '/del-inn', '.kort'], ['Endre', `/trening/okt/${DAG}/endre/grupper`, '.endre-gr']]) {
    await pc.goto(`${APP}${sti}`)
    await pc.locator(sel).first().waitFor({ timeout: 15000 })
    await vent(400)
    const bredde = await pc.locator(sel).first().evaluate(e => e.getBoundingClientRect().width)
    const x = await pc.evaluate(() => { window.scrollTo(9999, 0); return window.scrollX })
    ok(`PC: ${navn} uten sideveis scroll og ikke strukket`, x === 0 && bredde <= 620, `bredde ${Math.round(bredde)}`)
    await pc.screenshot({ path: `${OUT}/pc-${navn.replace(' ', '-').toLowerCase()}.png` })
  }

  // En dag uten trening: Endre på en plan som bare står på telefonen.
  sql(`delete from training_runs where session_id='${DAG}'`)
  sql(`update training_sessions set weekday=${UKEDAG % 7 + 1} where id='${DAG}'`)
  await p.goto(`${APP}/trening/okt/${DAG}`)
  await p.locator('.okt__start').click()
  await p.locator('.rad').first().waitFor({ timeout: 10000 })
  await p.locator('.fase__endre').first().click()
  await p.locator('.brikke').first().waitFor()
  await p.locator('.steg__knapp[aria-label="Flere"]').click()
  await vent(300)
  ok('ikke treningsdag: Endre virker på planen', (await p.locator('.endre-gr').count()) >= 2)
  ok('og ingenting lagres', sql(`select count(*) from training_runs where session_id='${DAG}'`) === '0')
  await p.reload()
  await p.waitForURL(new RegExp(`/trening/okt/${DAG}$`), { timeout: 10000 })
  ok('omlasting uten lagret plan: tilbake til opptellingen', await p.locator('.oppg__navn').first().isVisible())
} finally {
  ok('ingen sidefeil eller Vue-advarsler', feil.length === 0, [...new Set(feil)].slice(0, 3).join(' | '))
  sql(`delete from training_runs where session_id='${DAG}'; delete from training_sessions where id='${DAG}'`)
  if (flyttet) sql(`update training_sessions set weekday=${UKEDAG} where id in ('${flyttet.split(',').join("','")}')`)
  if (!hadde) sql(`delete from player_levels where player_id in (select id from players where cohort_id='${KULL}')`)
  await b.close()
}
console.log(feilet ? `${feilet} feil` : 'Alt grønt')
process.exit(feilet ? 1 : 0)
