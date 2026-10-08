// Gruppene på diff- og mix-øvelser i Trening: størrelse fra øvelsen, antall
// fra oppmøtet, bytte, «ikke her», bland og at foreldre ikke ser dem.
// Mot lokal base.
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'
const API = process.env.QA_API || 'http://127.0.0.1:54321'
const APP = process.env.QA_APP || 'http://localhost:5174'
const OUT = process.env.QA_OUT || '/tmp'
const SVC = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const KULL = 'af104bf3-02f4-4067-a0db-bf285f5d8f39', EPOST = 'alexander.samnoy@gmail.com'
let feilet = 0
const ok = (l, c, x = '') => { if (!c) feilet++; console.log(`${c ? 'OK  ' : 'FEIL'} ${l}${x ? '  — ' + x : ''}`) }
const sql = q => execSync(`docker exec -e PGPASSWORD=postgres supabase_db_halsen-dommerutlegg psql -U postgres -Atc ${JSON.stringify(q)}`).toString().trim()
const vent = ms => new Promise(r => setTimeout(r, ms))

// Nivå på alle unntatt to, i fast rekkefølge A, B, C.
sql(`delete from player_levels where cohort_id='${KULL}'`)
sql(`insert into player_levels (player_id, level) select id, (array['A','B','C'])[1 + (row_number() over (order by name))::int % 3] from players where cohort_id='${KULL}' order by name offset 2`)
const antall = Number(sql(`select count(*) from players where cohort_id='${KULL}'`))

const KLUBB = `(select club_id from cohorts where id='${KULL}')`
const DIFF = sql(`select id from training_exercises where type='diff' and club_id=${KLUBB} order by name limit 1`)
const DIFFNAVN = sql(`select name from training_exercises where id='${DIFF}'`)
const MIX = sql(`select id from training_exercises where type='mix' and club_id=${KLUBB} order by name limit 1`)
const MIXNAVN = sql(`select name from training_exercises where id='${MIX}'`)
// I dag, så «Vi er N» lagres på dagens dato.
const UKEDAG = new Date().getDay() || 7
const IDAG = new Date().toLocaleDateString('sv-SE')
const FOR = sql(`select coalesce(per_gruppe::text,'null') from training_exercises where id='${DIFF}'`)
sql(`update training_exercises set per_gruppe=5 where id='${DIFF}'`)
const DAG = sql(`insert into training_sessions (cohort_id, title, weekday, position, drills) values ('${KULL}', 'QA-grupper', ${UKEDAG}, 99, jsonb_build_array(jsonb_build_object('type','diff','text','QA diff','exercise_id','${DIFF}'), jsonb_build_object('type','mix','text','QA mix','exercise_id','${MIX}'))) returning id`).split('\n')[0]

const b = await chromium.launch()
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
const feil = []
const tell = async p => (await p.locator('.grp__gruppe').count())
const iGruppe = async (p, i) => (await p.locator('.grp__gruppe').nth(i).locator('.grp__spiller').allInnerTexts())

try {
  const p = await logginn(EPOST)
  await p.goto(`${APP}/trening?dag=${DAG}`)
  await p.getByText(DIFFNAVN).first().waitFor({ timeout: 15000 })
  await p.getByText(DIFFNAVN).first().click()
  await p.locator('.grp').waitFor({ timeout: 8000 })

  const forventet = Math.round(antall / 5)
  ok(`${antall} spillere, 5 per gruppe gir ${forventet} grupper`, await tell(p) === forventet, String(await tell(p)))
  ok('alle står i en gruppe', await p.locator('.grp__liste .grp__spiller').count() === antall)
  ok('meta sier antall og regel', /på trening/.test(await p.locator('.grp__meta').innerText()) && /likt nivå/.test(await p.locator('.grp__meta').innerText()))
  ok('ingen nivåbokstaver på skjermen', !/Nivå [ABC]/.test(await p.locator('.grp').innerText()))
  await p.locator('.grp').scrollIntoViewIfNeeded()
  await p.screenshot({ path: `${OUT}/grupper-diff.png` })

  // Bytte: første i gruppe 1 med første i siste gruppe.
  const g1 = await iGruppe(p, 0), gs = await iGruppe(p, forventet - 1)
  await p.locator('.grp__gruppe').nth(0).locator('.grp__spiller').first().click()
  ok('valgt navn får linja «ikke her»', await p.locator('.grp__valg').isVisible())
  await vent(300)
  const bg = await p.locator('.grp__spiller--valgt').evaluate(e => getComputedStyle(e).backgroundColor)
  const vanlig = await p.locator('.grp__spiller:not(.grp__spiller--valgt)').first().evaluate(e => getComputedStyle(e).backgroundColor)
  ok('valgt navn er fylt med farge', bg !== vanlig, bg)
  await p.screenshot({ path: `${OUT}/grupper-valgt.png` })
  await p.locator('.grp__gruppe').nth(forventet - 1).locator('.grp__spiller').first().click()
  ok('byttet: nr. 1 er i siste gruppe', (await iGruppe(p, forventet - 1)).includes(g1[0]))
  ok('og motsatt', (await iGruppe(p, 0)).includes(gs[0]))

  // Ikke her: fire stykker borte.
  for (let k = 0; k < 4; k++) {
    await p.locator('.grp__liste .grp__spiller').first().click()
    await p.locator('.grp__knapp').click()
  }
  const igjen = antall - 4
  ok('fire under «Ikke her»', await p.locator('.grp__borte .grp__spiller').count() === 4)
  ok('gruppene regnet om', await p.locator('.grp__liste .grp__spiller').count() === igjen && await tell(p) === Math.round(igjen / 5), String(await tell(p)))
  await p.screenshot({ path: `${OUT}/grupper-borte.png` })

  // Neste øvelse (mix): fraværet følger med.
  await p.locator('.bla--neste').click()
  await p.locator('.grp__meta', { hasText: 'blandet' }).waitFor({ timeout: 5000 })
  ok('mix: fraværet gjelder hele treninga', await p.locator('.grp__borte .grp__spiller').count() === 4)
  ok('mix uten størrelse: 2 grupper', await tell(p) === 2)
  await p.locator('.grp__steg[aria-label="Flere grupper"]').click()
  ok('pila overstyrer antallet', await tell(p) === 3)
  const forBland = await iGruppe(p, 0)
  await p.locator('.grp__lenke', { hasText: 'Bland' }).click()
  ok('bland gir ny fordeling', JSON.stringify(await iGruppe(p, 0)) !== JSON.stringify(forBland))

  // Omlasting: dagens notat står.
  await p.reload()
  await p.getByText(DIFFNAVN).first().waitFor({ timeout: 15000 })
  await p.getByText(DIFFNAVN).first().click()
  await p.locator('.grp').waitFor()
  ok('fraværet står etter omlasting', await p.locator('.grp__borte .grp__spiller').count() === 4)
  await p.locator('.grp__borte .grp__spiller').first().click()
  ok('trykk på borte-navn tar ham tilbake', await p.locator('.grp__borte .grp__spiller').count() === 3)
  await p.evaluate(() => { window.scrollTo(9999, 0) })
  ok('ingen sideveis scroll på 360', await p.evaluate(() => window.scrollX) === 0)

  // Banken: feltet finnes på diff, og vises i nøkkeltallene.
  await p.goto(`${APP}/trening/ovelser?ovelse=${DIFF}`)
  await p.locator('.ex-fakta', { hasText: 'Per gruppe' }).waitFor({ timeout: 10000 })
  ok('banken viser «Per gruppe 5»', /Per gruppe\s*5/.test(await p.locator('.ex-fakta').innerText()))
  await p.getByRole('button', { name: 'Rediger' }).first().click()
  await p.locator('#ex-per-gruppe').waitFor({ timeout: 5000 })
  ok('skjemaet har feltet med verdien', await p.locator('#ex-per-gruppe').inputValue() === '5')
  await p.locator('#ex-per-gruppe').fill('4')
  await p.getByRole('button', { name: 'Lagre' }).click()
  await vent(1200)
  ok('lagret i basen', sql(`select per_gruppe from training_exercises where id='${DIFF}'`) === '4')
  await p.screenshot({ path: `${OUT}/grupper-bank.png`, fullPage: true })

  // «Vi er N»: tastes inn, lagres, deles med de andre trenerne.
  await p.goto(`${APP}/trening?dag=${DAG}`)
  await p.locator('.antall').waitFor({ timeout: 15000 })
  ok('dagen spør hvor mange dere er', /Hvor mange/.test(await p.locator('.antall').innerText()))
  ok('kullstørrelsen står som plassholder', await p.locator('.antall__tall').getAttribute('placeholder') === String(antall))
  await p.locator('.antall__tall').click()
  await p.keyboard.type('21')
  await vent(1500)
  ok('21 lagret på dagens dato', sql(`select antall from training_counts where session_id='${DAG}' and dato='${IDAG}'`) === '21')
  const plan = await p.locator('.steg').first().locator('.steg__plan').first().innerText().catch(() => '')
  ok('øvelsen viser planen for 21', /5 grupper · 4–5/.test(plan), plan)
  await p.screenshot({ path: `${OUT}/antall-dag.png` })
  const boks = await p.locator('.antall').boundingBox(), tittel = await p.locator('.antall__tittel').boundingBox()
  ok('«På trening» står på én linje', tittel.height < 30, String(tittel.height))
  ok('boksen er ikke høyere enn knappene trenger', boks.height < 80, String(boks.height))

  const iver = await logginn('iver.vestre@gmail.com')
  await iver.goto(`${APP}/trening?dag=${DAG}`)
  await iver.locator('.antall__tall').waitFor({ timeout: 15000 })
  await vent(800)
  ok('en annen trener ser 21', await iver.locator('.antall__tall').inputValue() === '21')
  await iver.locator('.antall__steg[aria-label="Én til"]').click()
  let fikk = ''
  for (let k = 0; k < 40 && fikk !== '22'; k++) { await vent(300); fikk = await p.locator('.antall__tall').inputValue() }
  ok('pila hos ham dukker opp hos meg innen 12 sek, uten omlasting', fikk === '22', fikk)

  await p.getByText(DIFFNAVN).first().click()
  await p.locator('.grp').waitFor()
  ok('gruppene regnes fra 22', /^22 på trening/.test(await p.locator('.grp__meta').innerText()))
  ok('og sier fra om navn som ikke er trykket bort', await p.locator('.grp__ukjente').isVisible())
  await p.locator('.grp').scrollIntoViewIfNeeded()
  await p.screenshot({ path: `${OUT}/antall-grupper.png` })

  const forelder = await logginn('susannetenfjord@hotmail.com')
  await forelder.goto(`${APP}/trening?dag=${DAG}`)
  await forelder.waitForTimeout(4000)
  // Foreldre kommer ikke alltid inn på Trening (cup-modus sender dem til
  // kampprogrammet). Uansett: ikke tallet, ikke gruppene, ingen rader.
  ok('forelder ser ikke antallet', await forelder.locator('.antall').count() === 0)
  ok('forelder ser ikke gruppene', await forelder.locator('.grp').count() === 0)
  ok('forelder får null rader fra basen', await forelder.evaluate(async () => {
    const m = await import('/src/supabase.js')
    const { data } = await m.supabase.from('training_counts').select('antall')
    return (data || []).length
  }) === 0)
} finally {
  ok('ingen sidefeil', feil.length === 0, feil.join(' | '))
  sql(`delete from training_sessions where id='${DAG}'; delete from player_levels where cohort_id='${KULL}'; update training_exercises set per_gruppe=${FOR} where id='${DIFF}'`)
  await b.close()
}
process.exit(feilet ? 1 : 0)
