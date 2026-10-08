// Nivå A/B/C: oversikten i Admin, spillerprofilen og gruppene på en
// differensiert øvelse i Trening. Mot lokal base.
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

sql(`delete from player_levels where cohort_id='${KULL}'`)
const antall = Number(sql(`select count(*) from players where cohort_id='${KULL}'`))

// En treningsdag med én differensiert øvelse fra banken.
const DIFF = sql(`select id from training_exercises where type='diff' and club_id=(select club_id from cohorts where id='${KULL}') limit 1`)
const DIFFNAVN = sql(`select name from training_exercises where id='${DIFF}'`)
const DAG = sql(`insert into training_sessions (cohort_id, title, weekday, position, drills) values ('${KULL}', 'QA-nivå', 3, 99, jsonb_build_array(jsonb_build_object('type','diff','text','QA diff','exercise_id','${DIFF}'))) returning id`).split('\n')[0]

const b = await chromium.launch()
const r = await fetch(`${API}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email: EPOST }) })
const j = await r.json(); const tok = j.hashed_token || j.properties?.hashed_token
const c = await b.newContext({ viewport: { width: 360, height: 780 } }); const p = await c.newPage()
const feil = []; p.on('pageerror', e => feil.push(e.message))
await p.goto(`${APP}/auth/klar?t=${tok}&type=magiclink`)
await p.getByRole('button', { name: /Logg inn/ }).click()
await p.waitForURL(u => !/\/auth|\/login/.test(u.pathname), { timeout: 20000 })
await p.evaluate(k => localStorage.setItem('bb_active_cohort', k), KULL)

try {
  await p.goto(`${APP}/admin`)
  await p.locator('.admin-row', { hasText: 'Nivå' }).waitFor({ timeout: 15000 })
  ok('Admin har raden Nivå', true)
  await p.locator('.admin-row', { hasText: 'Nivå' }).click()
  await p.locator('.niva__row').first().waitFor({ timeout: 15000 })
  ok('alle spillerne står på oversikten', await p.locator('.niva__row').count() === antall, `${await p.locator('.niva__row').count()} av ${antall}`)
  ok('alle starter uten nivå', (await p.locator('.niva__label').first().innerText()).startsWith('UTEN NIVÅ') || (await p.locator('.niva__label').first().innerText()).startsWith('Uten nivå'))
  await p.screenshot({ path: `${OUT}/niva-tom.png`, fullPage: true })

  // Tapp seg gjennom de fem første: A, B, C, A, B.
  const plan = ['A', 'B', 'C', 'A', 'B']
  const navn = []
  for (const l of plan) {
    const rad = p.locator('.niva__group').first().locator('.niva__row').first()
    navn.push((await rad.locator('.niva__name').innerText()).trim())
    await rad.locator('.niva__opt', { hasText: l }).click()
    await vent(450)
  }
  await vent(800)
  ok('fem rader i basen', sql(`select count(*) from player_levels where cohort_id='${KULL}'`) === '5')
  ok('riktig nivå på første', sql(`select l.level from player_levels l join players p on p.id=l.player_id where p.name='${navn[0].replace(/'/g, "''")}' and p.cohort_id='${KULL}'`) === 'A')
  const tellA = await p.locator('.niva__count').first().locator('.niva__count-n').innerText()
  ok('telleren viser 2 på A', tellA === '2', tellA)
  ok('raden flyttet seg til Nivå A', await p.locator('.niva__group', { hasText: 'Nivå A' }).locator('.niva__name', { hasText: navn[0] }).count() === 1)

  // Tapp valgt nivå igjen: fjernes.
  await p.locator('.niva__row', { hasText: navn[2] }).locator('.niva__opt--on').click()
  await vent(1000)
  ok('trykk på valgt nivå fjerner det', sql(`select count(*) from player_levels where cohort_id='${KULL}'`) === '4')

  await p.reload()
  await p.locator('.niva__row').first().waitFor()
  ok('står etter omlasting', await p.locator('.niva__group', { hasText: 'Nivå B' }).locator('.niva__row').count() === 2)
  ok('sist endret vises', /Sist endret i dag/.test(await p.locator('.niva__note').first().innerText()))
  await p.evaluate(() => { window.scrollTo(9999, 0) })
  ok('ingen sideveis scroll på 360', await p.evaluate(() => window.scrollX) === 0)
  await p.screenshot({ path: `${OUT}/niva-satt.png`, fullPage: true })

  // Spillerprofilen.
  await p.locator('.niva__group', { hasText: 'Nivå A' }).locator('.niva__name').first().click()
  await p.locator('.sp__name').waitFor()
  ok('profilen viser nivået', await p.locator('.sp__tag', { hasText: 'Nivå A' }).count() === 1)
  await p.getByRole('button', { name: 'Rediger' }).click()
  await p.locator('.poschips--tre .poschip', { hasText: 'C' }).click()
  await p.getByRole('button', { name: 'Lagre' }).click()
  await vent(1200)
  ok('endret i redigeringsarket', await p.locator('.sp__tag', { hasText: 'Nivå C' }).count() === 1)
  ok('og i basen', sql(`select level from player_levels l join players p on p.id=l.player_id where p.name='${navn[0].replace(/'/g, "''")}' and p.cohort_id='${KULL}'`) === 'C')
  await p.screenshot({ path: `${OUT}/niva-profil.png`, fullPage: true })

  // Trening: gruppene på den differensierte øvelsen.
  await p.goto(`${APP}/trening?dag=${DAG}`)
  await p.getByText(DIFFNAVN).first().waitFor({ timeout: 15000 })
  await p.getByText(DIFFNAVN).first().click()
  await p.locator('.grp').waitFor({ timeout: 8000 })
  const tekst = await p.locator('.grp').innerText()
  // Gruppene heter Gruppe 1, 2 … — nivåbokstavene skal ikke stå på skjermen.
  ok('øvelsen viser gruppene', /Gruppe 1/.test(tekst) && !/Nivå [ABC]/.test(tekst))
  ok('navnet står i en gruppe', tekst.includes(navn[0].split(' ')[0]))
  await p.locator('.grp').scrollIntoViewIfNeeded()
  await p.screenshot({ path: `${OUT}/niva-trening.png` })
} finally {
  ok('ingen sidefeil', feil.length === 0, feil.join(' | '))
  sql(`delete from training_sessions where id='${DAG}'; delete from player_levels where cohort_id='${KULL}'`)
  await b.close()
}
process.exit(feilet ? 1 : 0)
