// Hva et NYTT kull arver fra klubben, og hva det ikke arver.
//
// Øvelsesbanken og håndboka er klubbens: et nytt kull skal slippe å starte på
// null, og skal se hvem som skrev dem. Møtereferatene er kullets og blir det —
// der står navngitte barn med vurderinger knyttet til seg.
//
// Testen lager et andre kull i Halsen og ser på flatene som den treneren.
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'

const API = process.env.QA_API || 'http://127.0.0.1:54321'
const APP = process.env.QA_APP || 'http://localhost:5173'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SVC = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const NABO = 'alexander.samnoy+nabokull@gmail.com'

let feilet = 0
const ok = (l, c, x = '') => { if (!c) feilet++; console.log(`${c ? 'OK  ' : 'FEIL'} ${l}${x ? '  — ' + x : ''}`) }
const sql = q => execSync(`docker exec -e PGPASSWORD=postgres supabase_db_halsen-dommerutlegg psql -U supabase_admin -h 127.0.0.1 -d postgres -qtAc "${q.replace(/"/g, '\\"')}"`).toString().trim()

// ---------- 0. Rydd og rigg ----------
const KLUBB = sql(`select id from clubs where name='Halsen IL'`)
const G2015 = sql(`select id from cohorts where club_id='${KLUBB}' and slug='g2015'`)
if (!KLUBB || !G2015) { console.error('Mangler Halsen IL / g2015 lokalt.'); process.exit(1) }

const gammelt = sql(`select id from cohorts where club_id='${KLUBB}' and slug='g2099'`)
if (gammelt) {
  for (const t of ['training_sessions', 'players', 'teams', 'coaches', 'cohort_members', 'seasons'])
    sql(`delete from ${t} where cohort_id='${gammelt}'`)
  sql(`update cohorts set active_season_id=null where id='${gammelt}'`)
  sql(`delete from cohorts where id='${gammelt}'`)
}
sql(`delete from cohort_members where email='${NABO}'`)
sql(`delete from auth.users where email='${NABO}'`)
sql(`delete from training_exercises where club_id='${KLUBB}' and name in ('Ferdighetssirkel (test)','Vinneren står (test)')`)

// To øvelser som G2015 har laget.
sql(`insert into training_exercises (club_id, cohort_id, name, type, category, laeringsmomenter)
     values ('${KLUBB}','${G2015}','Ferdighetssirkel (test)','mix','sjef-over-ballen','[]'::jsonb),
            ('${KLUBB}','${G2015}','Vinneren står (test)','mix','spill','[]'::jsonb)`)

async function token(epost) {
  const l = await (await fetch(`${API}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: SVC, Authorization: 'Bearer ' + SVC, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email: epost }) })).json()
  const r = await fetch(l.action_link, { redirect: 'manual' })
  return new URLSearchParams((r.headers.get('location') || '').split('#')[1] || '').get('access_token')
}
const alex = await token('alexander.samnoy@gmail.com')
const H = a => ({ apikey: ANON, Authorization: 'Bearer ' + a, 'Content-Type': 'application/json' })

// Nabokullet i SAMME klubbrad. Det er den aksen tomhetssveipen er blind på:
// den leter etter andre klubbers navn, og her er klubben den samme.
const rpc = await fetch(`${API}/rest/v1/rpc/bb_create_cohort`, { method: 'POST', headers: H(alex), body: JSON.stringify({
  p_club_id: KLUBB, p_club_name: null, p_club_short_name: null,
  p_name: 'Halsen G2099', p_slug: 'g2099',
  p_birth_year: 2099, p_players_on_pitch: null, p_period_count: null, p_period_minutes: null,
  p_teams: [], p_season_name: 'Høst 2026'
}) })
const nabo = await rpc.json()
ok('nabokull opprettet i samme klubb', rpc.ok && !!nabo, String(nabo).slice(0, 36))

const inv = await fetch(`${API}/functions/v1/member-admin`, { method: 'POST', headers: H(alex), body: JSON.stringify({ action: 'invite', cohort_id: nabo, name: 'Nabo', email: NABO, role: 'admin', preferred_team: null }) })
ok('trener invitert', inv.ok, JSON.stringify(await inv.json()).slice(0, 50))

const lenke = (await (await fetch(`${API}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: SVC, Authorization: 'Bearer ' + SVC, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email: NABO, redirect_to: `${APP}/auth/callback` }) })).json()).action_link

const b = await chromium.launch()
const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const p = await c.newPage()
const sidefeil = []; p.on('pageerror', e => sidefeil.push(e.message))
await p.goto(lenke, { waitUntil: 'networkidle' })
await p.waitForTimeout(2500)

// ---------- 1. Øvelsesbanken arves, med avsender ----------
await p.goto(`${APP}/trening/ovelser`, { waitUntil: 'networkidle' })
await p.waitForTimeout(1500)
const bank = (await p.locator('body').innerText()).replace(/\s+/g, ' ')
ok('nabokullet arver klubbens øvelser', /Ferdighetssirkel \(test\)/.test(bank) && /Vinneren står \(test\)/.test(bank), bank.slice(0, 90))
ok('øvelsene er merket med hvem som lagde dem', (bank.match(/Fra G2015/g) || []).length >= 2, bank.slice(0, 120))
ok('banken sier at den deles i klubben', /delt i hele Halsen/.test(bank), bank.slice(0, 120))

// ---------- 2. Håndboka arves, merket ----------
await p.goto(`${APP}/trening/handbok`, { waitUntil: 'networkidle' })
await p.waitForTimeout(1200)
const bok = (await p.locator('body').innerText()).replace(/\s+/g, ' ')
ok('nabokullet arver håndboka', /Det skal være gøy/.test(bok), bok.slice(0, 120))
ok('håndboka sier hvem som skrev den', /Skrevet av G2015/.test(bok) && /gjelder alle kull i Halsen/.test(bok), bok.slice(0, 160))

// Og prinsippsida under den skal virke, ikke bare lista.
await p.goto(`${APP}/trening/handbok/glede-og-kreativitet`, { waitUntil: 'networkidle' })
await p.waitForTimeout(1000)
ok('prinsippet kan åpnes', /Det skal være gøy/.test((await p.locator('body').innerText()).replace(/\s+/g, ' ')))

// ---------- 3. Referatene arves IKKE ----------
//
// Den viktigste påstanden i fila. Her står navngitte barn med vurderinger.
await p.goto(`${APP}/admin/referater`, { waitUntil: 'networkidle' })
await p.waitForTimeout(1200)
const ref = (await p.locator('body').innerText()).replace(/\s+/g, ' ')
const REFERAT_ORD = sql(`select 1`) && ['Trenermøte', 'Hospitering', 'differensiering']
ok('nabokullet ser IKKE G2015 sine referater',
  !REFERAT_ORD.some(o => new RegExp(o, 'i').test(ref)), ref.slice(0, 120))

ok('ingen sidefeil', sidefeil.length === 0, sidefeil.slice(0, 2).join(' | '))
await b.close()

// ---------- 4. Rydd opp etter oss ----------
sql(`delete from training_exercises where club_id='${KLUBB}' and name in ('Ferdighetssirkel (test)','Vinneren står (test)')`)
for (const t of ['training_sessions', 'players', 'teams', 'coaches', 'cohort_members'])
  sql(`delete from ${t} where cohort_id='${nabo}'`)
sql(`update cohorts set active_season_id=null where id='${nabo}'`)
sql(`delete from seasons where cohort_id='${nabo}'`)
sql(`delete from cohorts where id='${nabo}'`)
sql(`delete from cohort_members where email='${NABO}'`)
sql(`delete from auth.users where email='${NABO}'`)

console.log(feilet ? `\n${feilet} FEIL` : '\nAlt grønt')
process.exit(feilet ? 1 : 0)
