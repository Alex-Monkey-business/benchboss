// Del inn i kantene: tre steg (trening → hvem er her → inndeling), ingen med,
// første trykk lagrer oppmøtet, gjester, «Uten trening», en trening valgt på
// feil ukedag, kjøreplanen uten oppmøte, gamle Endre-lenker og PC-bredde.
// Mot lokal base.
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
const ANTALL = Number(sql(`select count(*) from players where cohort_id='${KULL}'`))
const TRENERE = Number(sql(`select count(*) from coaches where cohort_id='${KULL}'`))
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
const ryddDagen = () => sql(`delete from training_runs where cohort_id='${KULL}' and dato = current_date; delete from del_inn where cohort_id='${KULL}'`)
ryddDagen()
const runs = () => sql(`select count(*) from training_runs where cohort_id='${KULL}' and dato = current_date`)
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
const overskrift = p => p.locator('.del__h1').innerText().catch(() => '')
const spillere = p => p.locator('.oppg__grid').first().locator('.oppg__navn')
const trenerBrikker = p => p.locator('.oppg__grid').nth(1).locator('.oppg__navn')
const teller = async p => (await p.locator('.del__teller').innerText()).replace(/\s+/g, ' ').trim()

try {
  const p = await logginn('alexander.samnoy@gmail.com')

  // Hjem før oppmøtet: øvelsene, ingen «ikke telt opp».
  await p.goto(`${APP}/`)
  await p.locator('.today-training').waitFor({ timeout: 15000 })
  await inntil(async () => /øvelse/.test(await p.locator('.today-training').innerText()))
  const hjem0 = await p.locator('.today-training').innerText()
  ok('Hjem før oppmøtet: «2 øvelser», ikke «telt opp» eller «her»', /2 øvelser/.test(hjem0) && !/telt opp|\bher\b/.test(hjem0), hjem0.replace(/\n/g, ' | '))

  // Kortet går til kjøreplanen: bare planen, ingen opptelling, ingenting lagres.
  await p.locator('.today-training').click()
  await p.waitForURL(new RegExp(`/trening/okt/${DAG}$`), { timeout: 5000 })
  await p.locator('.rad').first().waitFor({ timeout: 10000 })
  ok('kortet går til kjøreplanen med øvelsene', await p.locator('.rad').count() === 2)
  ok('kjøreplanen har ingen opptelling', await p.locator('.oppg__navn, .okt__start, .okt__her, .oppm__linje').count() === 0 && await p.getByText('Hvem mangler').count() === 0)
  ok('kjøreplanen lenker til Del inn', (await p.locator('.plan__delinn').getAttribute('href')) === '/del-inn')
  await vent(800)
  ok('kjøreplanen lagrer ingenting', runs() === '0')

  // ── Steg 1: hvilken trening ──
  await p.locator('.plan__delinn').click()
  await p.waitForURL(/\/del-inn$/, { timeout: 5000 })
  await p.locator('.valg__rad').first().waitFor({ timeout: 15000 })
  ok('Del inn starter på «Hvilken trening?»', (await overskrift(p)) === 'Hvilken trening?')
  ok('steg 1: tilbakeknappen heter «Tilbake»', await p.locator('.del__bar [aria-label="Tilbake"]').count() === 1)
  ok('dagens trening er valgt på forhånd', (await p.getByRole('radio', { name: /QA-kant/ }).getAttribute('aria-checked')) === 'true')
  ok('«I dag» står under dagens trening', /I dag/.test(await p.getByRole('radio', { name: /QA-kant/ }).innerText()))
  ok('«Uten trening» er et valg', await p.getByRole('radio', { name: /Uten trening/ }).count() === 1)
  ok('alle treningene står som valg', await p.locator('.valg__rad').count() === Number(sql(`select count(*) from training_sessions where cohort_id='${KULL}'`)) + 1)
  ok('ingen «Start på nytt» før noe er valgt', await p.locator('.del__bar [aria-label="Start på nytt"]').count() === 0)
  await p.locator('.del__hoved', { hasText: 'Neste' }).click()

  // ── Steg 2: hvem er her ──
  await p.locator('.oppg__navn').first().waitFor({ timeout: 5000 })
  ok('Neste gir «Hvem er her?»', (await overskrift(p)) === 'Hvem er her?')
  ok('steg 2: tilbakeknappen heter «Forrige steg»', await p.locator('.del__bar [aria-label="Forrige steg"]').count() === 1)
  ok('valget er delt: del_inn.valg.okt er treningen', await inntil(() => sql(`select valg->>'okt' from del_inn where cohort_id='${KULL}'`) === DAG))
  ok(`alle ${ANTALL} spillere er her fra start`, await teller(p) === `${ANTALL} av ${ANTALL}`, await teller(p))
  ok('ingen trenere i oppmøtet', await p.locator('.oppg__grid').count() === 1 && await p.getByRole('heading', { name: 'Trenere' }).count() === 0)
  ok('ingen hint-tekst over brikkene', await p.getByText('Trykk på dem som ikke er på trening').count() === 0)
  ok('ingen økt lagret før første trykk', runs() === '0')

  // Ingen med: knappen er sperret. Første trykk lagrer oppmøtet på økta.
  const n = await spillere(p).count()
  for (let i = 0; i < n; i++) await spillere(p).nth(i).click()
  await inntil(async () => (await teller(p)).startsWith('0 av'))
  ok('ingen med: teller 0', (await teller(p)).startsWith('0 av'), await teller(p))
  ok('ingen med: «Del inn» er sperret', await p.locator('.del__hoved', { hasText: 'Del inn' }).isDisabled())
  ok('første trykk startet økta, bare én', await inntil(() => sql(`select count(*) from training_runs where session_id='${DAG}' and dato=current_date`) === '1') && runs() === '1')
  const RUN = sql(`select id from training_runs where session_id='${DAG}' and dato=current_date`)
  ok('alle borte står i basen', await inntil(() => sql(`select count(*) from training_run_players where run_id='${RUN}'`) === '0'))
  // To med: to lag, én bane.
  await spillere(p).nth(0).click()
  await spillere(p).nth(1).click()
  ok('to med: oppmøtet er de to', await inntil(() => sql(`select count(*) from training_run_players where run_id='${RUN}'`) === '2'))
  ok('ingen trenere lagret på økta', sql(`select count(*) from training_run_coaches where run_id='${RUN}'`) === '0')
  ok('ingen gjenger eller lag lagret på økta', sql(`select state ?| array['_gjenger','_lag','_antall','_rigger'] from training_runs where id='${RUN}'`) === 'f')
  await p.locator('.del__hoved', { hasText: 'Del inn' }).click()

  // ── Steg 3: inndeling ──
  await p.locator('.del__oppsummering').waitFor({ timeout: 5000 })
  const opps = (await p.locator('.del__oppsummering').innerText()).replace(/\s+/g, ' ')
  ok('oppsummeringen: treningen og 2 spillere, ingen trenere', /QA-kant/.test(opps) && /2 spillere/.test(opps) && !/trener/.test(opps) && /Endre/.test(opps), opps)
  ok('steg 3: tilbakeknappen heter «Forrige steg»', await p.locator('.del__bar [aria-label="Forrige steg"]').count() === 1)
  await p.getByRole('tab', { name: 'Lag' }).click()
  await vent(300)
  ok('to med: to lag på én bane', await p.locator('.bane').count() === 1 && await p.locator('.kort').count() === 2)
  ok('to med: + er sperret', await p.locator('.steg__knapp[aria-label="Flere"]').isDisabled())
  ok('Lag (Mix): «Trekk på nytt» under lagene, ingen fast knapp', await p.locator('.del__trekk').count() === 1 && await p.locator('.del__fot').count() === 0)
  ok('ingen gamle knapper (her-pille, Ferdig, Nullstill, Rent nivå)', await p.locator('.del__her, .del__bruk, .del__nullstill, .del__balanse').count() === 0)
  // «Endre» går tilbake til steg 2, «Forrige steg» også.
  await p.locator('.del__oppsummering').click()
  ok('«Endre» går tilbake til «Hvem er her?»', (await overskrift(p)) === 'Hvem er her?')
  await p.locator('.del__bar [aria-label="Forrige steg"]').click()
  ok('«Forrige steg» fra 2 gir steg 1', (await overskrift(p)) === 'Hvilken trening?')
  ok('steg 1 husker treningen', (await p.getByRole('radio', { name: /QA-kant/ }).getAttribute('aria-checked')) === 'true')

  // Omlasting: noen har begynt i dag → rett på inndelingen, med de samme to.
  await p.reload()
  await p.locator('.del__oppsummering').waitFor({ timeout: 15000 })
  ok('omlasting: rett på inndelingen', await p.locator('.del__h1').count() === 0)
  ok('omlasting: de samme to', /2 spillere/.test(await p.locator('.del__oppsummering').innerText()), await p.locator('.del__oppsummering').innerText())
  ok('Lag-fanen er husket (delt valg)', (await p.getByRole('tab', { name: 'Lag' }).getAttribute('aria-selected')) === 'true')

  // Hjem, uka og dagen etter oppmøtet.
  await p.goto(`${APP}/`)
  await inntil(async () => /2 her/.test(await p.locator('.today-training').innerText()))
  const hjem1 = await p.locator('.today-training').innerText()
  ok('Hjem etter oppmøtet: «2 her», ikke «planen er klar»', /2 her/.test(hjem1) && !/planen er klar/.test(hjem1), hjem1.replace(/\n/g, ' | '))
  await p.goto(`${APP}/trening`)
  const chip = p.locator('.dag', { hasText: 'QA-kant' }).locator('.dag__start')
  await chip.waitFor({ timeout: 15000 })
  await inntil(async () => /2 her/.test(await chip.innerText()))
  ok('uka: dagens kort har «2 her» som går til Del inn', /2 her/.test(await chip.innerText()) && (await chip.getAttribute('href')) === '/del-inn', await chip.innerText())
  await p.goto(`${APP}/trening/dag/${DAG}`)
  await p.locator('.okt-start').waitFor({ timeout: 15000 })
  await vent(800)
  ok('dagen: «Kjøreplanen · 2 her»', /Kjøreplanen[\s\S]*2 her/.test(await p.locator('.okt-start').innerText()) && !/Registrer oppmøte/.test(await p.locator('.okt-start').innerText()))
  await p.goto(`${APP}/trening/okt/${DAG}`)
  await p.locator('.plan__delinn').waitFor({ timeout: 15000 })
  await p.locator('.plan__delinn').click()
  await p.waitForURL(/\/del-inn$/, { timeout: 5000 })
  await p.locator('.del__oppsummering').waitFor({ timeout: 15000 })
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

  // ── Gjester ──
  await p.locator('.del__oppsummering').click()
  await p.getByRole('button', { name: 'Legg til gjest' }).click()
  await p.locator('.ds-sheet', { hasText: 'Ny gjest' }).waitFor({ timeout: 5000 })
  ok('«Legg til» er sperret uten navn', await p.locator('.ds-sheet .del__hoved', { hasText: 'Legg til' }).isDisabled())
  await p.getByLabel('Navn på gjesten').fill('Gjest Gjestesen')
  await p.locator('.ds-sheet .del__seg-knapp', { hasText: 'A' }).click()
  await p.locator('.ds-sheet .del__hoved', { hasText: 'Legg til' }).click()
  await p.locator('.gjest__brikke').first().waitFor({ timeout: 5000 })
  ok('gjesten står på brikke med nivå A', /A\s*Gjest Gjestesen/.test(await p.locator('.gjest__brikke').innerText()))
  ok('telleren tar med gjesten', (await teller(p)) === `3 av ${ANTALL + 1}`, await teller(p))
  ok('gjesten er delt, ikke i oppmøtet', await inntil(() => sql(`select jsonb_array_length(gjester) from del_inn where cohort_id='${KULL}'`) === '1') && sql(`select count(*) from training_run_players where run_id='${RUN}'`) === '2')
  await p.locator('.del__hoved', { hasText: 'Del inn' }).click()
  await p.locator('.kort').first().waitFor()
  ok('gjesten er med i inndelingen', /Gjest Gjestesen/.test((await p.locator('.kort__navn').allInnerTexts()).join(' ')))
  await p.locator('.del__oppsummering').click()
  await p.getByRole('button', { name: 'Fjern Gjest Gjestesen' }).click()
  ok('gjesten kan fjernes', await inntil(async () => await p.locator('.gjest__brikke').count() === 0) && await inntil(() => sql(`select jsonb_array_length(gjester) from del_inn where cohort_id='${KULL}'`) === '0'))

  // ── Uten trening: Mer → Start på nytt → «Uten trening» ──
  await p.locator('.del__hoved', { hasText: 'Del inn' }).click()
  await p.locator('.del__bar [aria-label="Start på nytt"]').click()
  await p.locator('.ds-sheet .del__hoved--fare').click()
  await p.locator('.valg__rad').first().waitFor({ timeout: 5000 })
  ok('Start på nytt gir steg 1 og tømmer Del inn-raden', (await overskrift(p)) === 'Hvilken trening?' && await inntil(() => sql(`select count(*) from del_inn where cohort_id='${KULL}'`) === '0'))
  ok('Start på nytt sletter også dagens oppmøte på økta', runs() === '0')
  await p.getByRole('radio', { name: /Uten trening/ }).click()
  ok('valget flyttes når du trykker', (await p.getByRole('radio', { name: /Uten trening/ }).getAttribute('aria-checked')) === 'true' && (await p.getByRole('radio', { name: /QA-kant/ }).getAttribute('aria-checked')) === 'false')
  await p.locator('.del__hoved', { hasText: 'Neste' }).click()
  await p.locator('.oppg__navn').first().waitFor()
  ok('uten trening: alle er her fra start', (await teller(p)) === `${ANTALL} av ${ANTALL}`, await teller(p))
  await spillere(p).nth(0).click()
  ok('uten trening: listen lagres i Del inn-raden', await inntil(() => sql(`select cardinality(spillere) from del_inn where cohort_id='${KULL}'`) === String(ANTALL - 1)))
  ok('uten trening: valg.okt = ingen', sql(`select valg->>'okt' from del_inn where cohort_id='${KULL}'`) === 'ingen')
  ok('uten trening: ingen ny økt', runs() === '0')
  await p.locator('.del__hoved', { hasText: 'Del inn' }).click()
  await p.locator('.kort').first().waitFor()
  const opps2 = (await p.locator('.del__oppsummering').innerText()).replace(/\s+/g, ' ')
  ok('oppsummeringen sier «Uten trening»', /Uten trening/.test(opps2) && new RegExp(`${ANTALL - 1} spillere$`).test(opps2.replace(/\s*Endre\s*$/, '')), opps2)
  // Like store grupper-bryteren: på = antall, av = nivå. Delt.
  await p.getByRole('tab', { name: 'Grupper' }).click()
  await p.locator('.del__seg-knapp', { hasText: 'Diff' }).click()
  const bryter = p.getByRole('switch', { name: 'Like store grupper' })
  ok('Diff: «Like store grupper» står på', (await bryter.getAttribute('aria-checked')) === 'true')
  await bryter.click()
  ok('bryteren av: balanse = niva i Del inn-raden', (await bryter.getAttribute('aria-checked')) === 'false' && await inntil(() => sql(`select valg->'grupper'->>'balanse' from del_inn where cohort_id='${KULL}'`) === 'niva'))
  await p.locator('.del__seg-knapp', { hasText: 'Mix' }).click()
  ok('Mix: ingen bryter', await p.getByRole('switch').count() === 0)
  ok('Mix: «Trekk på nytt» finnes', await p.locator('.del__trekk').count() === 1)
  await p.locator('.del__seg-knapp', { hasText: 'Diff' }).click()
  ok('Diff: ingen «Trekk på nytt»', await inntil(async () => await p.locator('.del__trekk').count() === 0))
  await p.locator('.del__seg-knapp', { hasText: 'Mix' }).click()
  // Tilbake til steg 1 med «Forrige steg».
  await p.locator('.del__bar [aria-label="Forrige steg"]').click()
  await p.locator('.del__bar [aria-label="Forrige steg"]').click()
  ok('Forrige steg gir steg 1 med «Uten trening» valgt', (await overskrift(p)) === 'Hvilken trening?' && (await p.getByRole('radio', { name: /Uten trening/ }).getAttribute('aria-checked')) === 'true')

  // PC-bredde: Del inn står i en smal kolonne, uten sideveis scroll.
  const pc = await logginn('alexander.samnoy@gmail.com', { width: 1280, height: 860 })
  await pc.goto(`${APP}/`)
  await pc.locator('.hjem-delinn').waitFor({ timeout: 15000 })
  const [dw, kw] = await Promise.all([pc.locator('.hjem-delinn').evaluate(e => e.getBoundingClientRect().width), pc.locator('.hjem-stack > .ds-card').first().evaluate(e => e.getBoundingClientRect().width)])
  ok('PC: Del inn på Hjem er like bred som kortene', Math.abs(dw - kw) < 1, `${dw} / ${kw}`)
  await pc.goto(`${APP}/del-inn`)
  await pc.locator('.kort').first().waitFor({ timeout: 15000 })
  await vent(400)
  const bredde = await pc.locator('.kort').first().evaluate(e => e.getBoundingClientRect().width)
  const x = await pc.evaluate(() => { window.scrollTo(9999, 0); return window.scrollX })
  ok('PC: Del inn uten sideveis scroll og ikke strukket', x === 0 && bredde <= 620, `bredde ${Math.round(bredde)}`)
  await pc.screenshot({ path: `${OUT}/pc-del-inn.png` })

  // ── En trening valgt en annen dag: oppmøtet lagres likevel (tving) ──
  ryddDagen()
  // position -1: QA-kant er først i morgen også. Ellers bytter «nærmeste» når
  // dagens oppmøte kommer inn, og DelInnView kan velge steg på en gammel
  // okt.lastet (kjent feil, meldt) — det er ikke det denne sjekken tester.
  sql(`update training_sessions set weekday=${UKEDAG % 7 + 1}, position=-1 where id='${DAG}'`)
  await p.goto(`${APP}/trening/okt/${DAG}`)
  await p.locator('.rad').first().waitFor({ timeout: 10000 })
  await vent(800)
  ok('ikke treningsdag: kjøreplanen vises, ingenting lagres', await p.locator('.plan__delinn').count() === 1 && runs() === '0')
  await p.goto(`${APP}/del-inn`)
  await p.locator('.valg__rad').first().waitFor({ timeout: 15000 })
  ok('ingen rad i dag: Del inn starter på steg 1', (await overskrift(p)) === 'Hvilken trening?')
  ok('ingen trening i dag: ingen er merket «I dag»', !/I dag/.test((await p.locator('.valg__rad').allInnerTexts()).join(' ')))
  await p.getByRole('radio', { name: /QA-kant/ }).click()
  await p.locator('.del__hoved', { hasText: 'Neste' }).click()
  await p.locator('.oppg__navn').first().waitFor()
  await spillere(p).nth(0).click()
  ok('valgt trening på feil ukedag: oppmøtet lagres for i dag', await inntil(() => sql(`select count(*) from training_runs where session_id='${DAG}' and dato=current_date`) === '1'))
  const RUN2 = sql(`select id from training_runs where session_id='${DAG}' and dato=current_date`)
  ok('og med én borte', await inntil(() => sql(`select count(*) from training_run_players where run_id='${RUN2}'`) === String(ANTALL - 1)))
  // Nå har dagen oppmøte på QA-kant: den er nærmeste neste gang.
  sql(`delete from del_inn where cohort_id='${KULL}'`)
  await p.reload()
  await p.locator('.del__oppsummering').waitFor({ timeout: 15000 }).catch(() => {})
  ok('oppmøte i dag uten Del inn-rad: rett på inndelingen for den treningen', /QA-kant/.test(await p.locator('.del__oppsummering').innerText().catch(() => '')))
} finally {
  ok('ingen sidefeil eller Vue-advarsler', feil.length === 0, [...new Set(feil)].slice(0, 3).join(' | '))
  sql(`delete from training_runs where cohort_id='${KULL}' and dato = current_date; delete from training_runs where session_id='${DAG}'; delete from training_sessions where id='${DAG}'; delete from del_inn where cohort_id='${KULL}'`)
  if (flyttet) sql(`update training_sessions set weekday=${UKEDAG} where id in ('${flyttet.split(',').join("','")}')`)
  if (!hadde) sql(`delete from player_levels where player_id in (select id from players where cohort_id='${KULL}')`)
  if (kampIder) sql(`update matches set match_date = match_date - 365 where id in ${kampIder}`)
  await b.close()
}
console.log(feilet ? `${feilet} feil` : 'Alt grønt')
process.exit(feilet ? 1 : 0)
