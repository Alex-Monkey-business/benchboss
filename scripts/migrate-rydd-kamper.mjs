#!/usr/bin/env node
// Engangs-opprydding av kamptabellen. Fjerner to slags rader:
//
//   1. Duplikater — appens import sammenlignet match_time rått ("17:30:00"
//      fra Postgres mot "17:30" fra parseren), så dedup-filteret traff aldri.
//      Samme fil importert to ganger doblet alt.
//   2. Fremmede kamper — serieoppsettet fra kretsen inneholder hele
//      avdelingen. Bare kamper der et Halsen-lag spiller skal ligge i basen.
//
// Begge er fikset i AdminSesongKamperView.vue; dette rydder det som allerede
// har kommet inn. Idempotent — kan kjøres om igjen uten skade.
//
// Ved duplikater beholdes alltid den eldste raden, slik at tilknyttede
// trenertildelinger og utlegg følger raden som resten av basen peker på.
//
// Usage:
//   node scripts/migrate-rydd-kamper.mjs --dry-run   (vis hva som ville skjedd)
//   node scripts/migrate-rydd-kamper.mjs             (utfør)

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(Boolean).map(l => l.split('=').map(s => s.trim()))
)
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
const dryRun = process.argv.includes('--dry-run')

const isHalsen = name => (name || '').toLowerCase().includes('halsen')

const { data: seasons } = await supabase.from('seasons').select('id, name')
const { data: matches, error } = await supabase.from('matches').select('*')
if (error) { console.error('Kunne ikke hente kamper:', error.message); process.exit(1) }

const seasonName = id => seasons.find(s => s.id === id)?.name || 'ukjent sesong'

// 1. Fremmede kamper — ingen Halsen-lag involvert.
const foreign = matches.filter(m => !isHalsen(m.home_team) && !isHalsen(m.away_team))

// 2. Duplikater blant de gjenværende. Nøkkelen bruker hh:mm, ikke rå tid.
const ours = matches.filter(m => isHalsen(m.home_team) || isHalsen(m.away_team))
const key = m => [m.season_id, m.match_date, (m.match_time || '').slice(0, 5), m.home_team, m.away_team].join('|')
const groups = {}
for (const m of ours) (groups[key(m)] ||= []).push(m)
const dupeGroups = Object.values(groups).filter(g => g.length > 1)
for (const g of dupeGroups) g.sort((a, b) => a.created_at.localeCompare(b.created_at))
const dupes = dupeGroups.flatMap(g => g.slice(1))

const drop = [...foreign, ...dupes]

const bySeasonCount = rows => {
  const c = {}
  for (const r of rows) c[seasonName(r.season_id)] = (c[seasonName(r.season_id)] || 0) + 1
  return Object.entries(c).map(([k, v]) => `${k}: ${v}`).join(', ') || 'ingen'
}

console.log(`Kamper i basen:        ${matches.length}`)
console.log(`Fremmede (ikke Halsen): ${foreign.length}  (${bySeasonCount(foreign)})`)
console.log(`Duplikater:             ${dupes.length}  (${bySeasonCount(dupes)})`)
console.log(`Blir igjen:             ${matches.length - drop.length}\n`)

for (const g of dupeGroups.slice(0, 3)) {
  console.log(`  dublett: ${g[0].match_date} ${(g[0].match_time || '').slice(0, 5)}  ${g[0].home_team} vs ${g[0].away_team}`)
  console.log(`     beholder ${g[0].id.slice(0, 8)} (${g[0].created_at.slice(11, 16)})  fjerner ${g.slice(1).map(m => m.id.slice(0, 8)).join(', ')}`)
}
if (dupeGroups.length > 3) console.log(`  … og ${dupeGroups.length - 3} dublettpar til`)
for (const m of foreign.slice(0, 3)) {
  console.log(`  fremmed: ${m.match_date}  ${m.home_team} vs ${m.away_team}`)
}
if (foreign.length > 3) console.log(`  … og ${foreign.length - 3} fremmede kamper til`)

if (!drop.length) { console.log('\nIngenting å rydde.'); process.exit(0) }
if (dryRun) { console.log('\n--dry-run: ingenting ble slettet.'); process.exit(0) }

const ids = drop.map(m => m.id)

// Rydd tilknyttede rader først — ingen av dem har data vi vil beholde, men
// fremmednøklene må uansett løsnes før kampene kan slettes.
for (const table of ['match_coaches', 'expenses']) {
  const { error: e } = await supabase.from(table).delete().in('match_id', ids)
  if (e) { console.error(`Feil ved sletting i ${table}:`, e.message); process.exit(1) }
}

const { error: delErr } = await supabase.from('matches').delete().in('id', ids)
if (delErr) { console.error('Feil ved sletting av kamper:', delErr.message); process.exit(1) }

const { data: after } = await supabase.from('matches').select('id, season_id, home_team, away_team')
console.log(`\nFerdig. Kamper: ${matches.length} → ${after.length}`)
for (const s of seasons) {
  const n = after.filter(m => m.season_id === s.id).length
  if (n) console.log(`  ${s.name}: ${n}`)
}
