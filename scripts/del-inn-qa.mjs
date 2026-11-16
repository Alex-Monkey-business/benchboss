// Del inn i kantene: ingen med, første trykk starter økta, gamle Endre-lenker,
// en dag uten trening, og PC-bredde. Mot lokal base.
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

// En kamp i dag tar toppen på Hjem, og da vises ikke treningskortet. Dagens
// kamper flyttes et år fram mens testen går, og tilbake etterpå.
const KAMPER = sql(`select string_agg(id::text, ',') from matches where cohort_id='${KULL}' and match_date=current_date`)
const kampIder = KAMPER ? `('${KAMPER.split(',').join("','")}')` : null
if (kampIder) sql(`update matches set match_date = match_date + 365 where id in ${kampIder}`)
sql(`delete from del_inn where cohort_id='${KULL}'`)
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

  // Del inn uten lagret oppmøte i dag: hele kullet, ingen startknapp, ingenting lagret ennå.
  await p.goto(`${APP}/del-inn`)
  await p.locator('.kort').first().waitFor({ timeout: 15000 })
  ok('ikke telt opp: ingen «Start dagens trening med disse»', await p.getByText(/Start dagens trening|Bruk som dagens/).count() === 0)
  ok('ikke telt opp: ingen økt lagret ennå', sql(`select count(*) from training_runs where session_id='${DAG}'`) === '0')

  // Ingen med: melding, ingen krasj, knappene står. Første trykk lagrer oppmøtet på økta.
  await p.locator('.del__her').click()
  await p.locator('.ds-sheet .oppg__navn').first().waitFor()
  const n = await p.locator('.ds-sheet .oppg__grid').first().locator('.oppg__navn').count()
  for (let i = 0; i < n; i++) await p.locator('.ds-sheet .oppg__grid').first().locator('.oppg__navn').nth(i).click()
  await p.locator('.ds-sheet .del__bruk', { hasText: 'Ferdig' }).click()
  await vent(300)
  ok('ingen med: sier hva du gjør', /Ingen er med/.test(await p.locator('.del').innerText()) && await p.locator('.kort').count() === 0)
  await p.getByRole('tab', { name: 'Lag' }).click()
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

  // Oppmøtet fra Del inn står på dagens økt: én økt, også etter mange raske trykk.
  ok('første trykk i Del inn startet økta', await inntil(() => sql(`select count(*) from training_runs where session_id='${DAG}'`) === '1'))
  const RUN = sql(`select id from training_runs where session_id='${DAG}'`)
  ok('én økt lagret, ikke én per trykk', !!RUN && !RUN.includes('\n'))
  ok('oppmøtet er de to som er med i Del inn', await inntil(() => sql(`select count(*) from training_run_players where run_id='${RUN}'`) === '2'))
  ok('ingen trenere valgt: ingen trenere lagret', sql(`select count(*) from training_run_coaches where run_id='${RUN}'`) === '0')
  ok('ingen gjenger eller lag lagret på økta', sql(`select state ?| array['_gjenger','_lag','_antall','_rigger'] from training_runs where id='${RUN}'`) === 'f')
  await p.reload()
  await p.locator('.kort').first().waitFor({ timeout: 15000 })
  ok('omlasting: Del inn står med de samme to', /^2 spillere/.test((await p.locator('.del__her').innerText()).trim()), await p.locator('.del__her').innerText())
  await p.goto(`${APP}/`)
  await inntil(async () => /her · planen er klar/.test(await p.locator('.today-training').innerText()))
  ok('Hjem etter oppmøtet: «N her · planen er klar»', /\d+ her · planen er klar/.test(await p.locator('.today-training').innerText()))
  await p.goto(`${APP}/trening/okt/${DAG}`)
  await p.locator('.plan__delinn').waitFor({ timeout: 15000 })
  ok('kjøreplanen lenker til Del inn med de to', /2 spillere/.test(await p.locator('.plan__delinn').innerText()), await p.locator('.plan__delinn').innerText())
  await p.locator('.plan__delinn').click()
  await p.waitForURL(/\/del-inn$/, { timeout: 5000 })
  await p.goBack()
  await p.waitForURL(new RegExp(`/trening/okt/${DAG}$`), { timeout: 5000 }).catch(() => {})
  ok('tilbake fra Del inn går til kjøreplanen', new RegExp(`/trening/okt/${DAG}$`).test(p.url()), p.url())

  // Gamle Endre-lenker sendes til Del inn, også med rare tall i adressen.
  for (const sti of ['endre/grupper', 'endre/lag/3', 'endre/lag/99']) {
    await p.goto(`${APP}/trening/okt/${DAG}/${sti}`)
    await p.waitForURL(/\/del-inn$/, { timeout: 5000 }).catch(() => {})
    ok(`/${sti} sendes til Del inn`, /\/del-inn$/.test(p.url()), p.url())
  }
  await p.locator('.kort').first().waitFor({ timeout: 15000 })
  ok('ingen krasj etter omdirigeringen', feil.length === 0, feil.slice(0, 2).join(' | '))

  // PC-bredde: Del inn står i en smal kolonne, uten sideveis scroll.
  const pc = await logginn('alexander.samnoy@gmail.com', { width: 1280, height: 860 })
  // Hjem: Del inn er like bred som de andre kortene.
  await pc.goto(`${APP}/`)
  await pc.locator('.hjem-delinn').waitFor({ timeout: 15000 })
  const [dw, kw] = await Promise.all([pc.locator('.hjem-delinn').evaluate(e => e.getBoundingClientRect().width), pc.locator('.hjem-stack > .ds-card').first().evaluate(e => e.getBoundingClientRect().width)])
  ok('PC: Del inn på Hjem er like bred som kortene', Math.abs(dw - kw) < 1, `${dw} / ${kw}`)
  for (const [navn, sti, sel] of [['Del inn', '/del-inn', '.kort']]) {
    await pc.goto(`${APP}${sti}`)
    await pc.locator(sel).first().waitFor({ timeout: 15000 })
    await vent(400)
    const bredde = await pc.locator(sel).first().evaluate(e => e.getBoundingClientRect().width)
    const x = await pc.evaluate(() => { window.scrollTo(9999, 0); return window.scrollX })
    ok(`PC: ${navn} uten sideveis scroll og ikke strukket`, x === 0 && bredde <= 620, `bredde ${Math.round(bredde)}`)
    await pc.screenshot({ path: `${OUT}/pc-${navn.replace(' ', '-').toLowerCase()}.png` })
  }

  // En dag uten trening: planen står bare på telefonen, uten Del inn-lenke.
  sql(`delete from training_runs where session_id='${DAG}'`)
  sql(`update training_sessions set weekday=${UKEDAG % 7 + 1} where id='${DAG}'`)
  await p.goto(`${APP}/trening/okt/${DAG}`)
  await p.locator('.okt__start').click()
  await p.locator('.rad').first().waitFor({ timeout: 10000 })
  ok('ikke treningsdag: kjøreplanen vises uten Del inn-lenke', await p.locator('.plan__lokal').count() === 1 && await p.locator('.plan__delinn').count() === 0)
  ok('og ingenting lagres', sql(`select count(*) from training_runs where session_id='${DAG}'`) === '0')
  await p.reload()
  await p.waitForURL(new RegExp(`/trening/okt/${DAG}$`), { timeout: 10000 })
  ok('omlasting uten lagret plan: tilbake til opptellingen', await p.locator('.oppg__navn').first().waitFor({ timeout: 10000 }).then(() => true, () => false))
} finally {
  ok('ingen sidefeil eller Vue-advarsler', feil.length === 0, [...new Set(feil)].slice(0, 3).join(' | '))
  sql(`delete from training_runs where session_id='${DAG}'; delete from training_sessions where id='${DAG}'; delete from del_inn where cohort_id='${KULL}'`)
  if (flyttet) sql(`update training_sessions set weekday=${UKEDAG} where id in ('${flyttet.split(',').join("','")}')`)
  if (!hadde) sql(`delete from player_levels where player_id in (select id from players where cohort_id='${KULL}')`)
  if (kampIder) sql(`update matches set match_date = match_date - 365 where id in ${kampIder}`)
  await b.close()
}
console.log(feilet ? `${feilet} feil` : 'Alt grønt')
process.exit(feilet ? 1 : 0)
