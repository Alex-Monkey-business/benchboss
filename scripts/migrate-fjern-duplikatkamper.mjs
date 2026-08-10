#!/usr/bin/env node
// Engangs-opprydding: fjern de 45 dupliserte kampene i Høst 2026.
//
// Bakgrunn: importen i appen sammenlignet match_time rått ("17:30:00" fra
// Postgres mot "17:30" fra parseren), så dedup-filteret traff aldri. Samme
// kampfil ble importert to ganger 7. august (14:22 og 14:24) og alt kom
// inn dobbelt. Koden er fikset i AdminSesongKamperView.vue.
//
// Trygghet: beholder ALLTID den eldste raden i hvert par. De 18 tilhørende
// match_coaches-radene på dublettene er identiske med originalens, så ingen
// trenertildeling går tapt. Backup ligger i backup-duplicates.json.
//
// Usage:
//   node fjern-duplikater.mjs --dry-run   (vis hva som ville skjedd)
//   node fjern-duplikater.mjs             (utfør)

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const REPO = new URL('..', import.meta.url).pathname
const SEASON = 'be12b138-0d92-48d7-81ba-7f853bf77cbb' // Høst 2026

const env = Object.fromEntries(
  readFileSync(`${REPO}/.env.local`, 'utf8')
    .split('\n').filter(Boolean).map(l => l.split('=').map(s => s.trim()))
)
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
const dryRun = process.argv.includes('--dry-run')

const { data: matches, error } = await supabase
  .from('matches').select('*').eq('season_id', SEASON)
if (error) { console.error('Kunne ikke hente kamper:', error.message); process.exit(1) }

// Grupper på det som faktisk identifiserer en kamp — med hh:mm, ikke rå tid.
const key = m => [m.match_date, (m.match_time || '').slice(0, 5), m.home_team, m.away_team].join('|')
const groups = {}
for (const m of matches) (groups[key(m)] ||= []).push(m)

const dupes = Object.values(groups).filter(g => g.length > 1)
for (const g of dupes) g.sort((a, b) => a.created_at.localeCompare(b.created_at))

const drop = dupes.flatMap(g => g.slice(1).map(m => m.id))

console.log(`Kamper i Høst 2026: ${matches.length}`)
console.log(`Unike kamper:       ${Object.keys(groups).length}`)
console.log(`Duplikatgrupper:    ${dupes.length}`)
console.log(`Rader som fjernes:  ${drop.length}\n`)

for (const g of dupes.slice(0, 5)) {
  console.log(`  ${g[0].match_date} ${(g[0].match_time || '').slice(0, 5)}  ${g[0].home_team} vs ${g[0].away_team}`)
  console.log(`     beholder ${g[0].id.slice(0, 8)} (${g[0].created_at.slice(11, 16)})  fjerner ${g.slice(1).map(m => m.id.slice(0, 8)).join(', ')}`)
}
if (dupes.length > 5) console.log(`  … og ${dupes.length - 5} par til\n`)

if (!drop.length) { console.log('Ingen duplikater — ingenting å gjøre.'); process.exit(0) }
if (dryRun) { console.log('\n--dry-run: ingenting ble slettet.'); process.exit(0) }

const { error: e1 } = await supabase.from('match_coaches').delete().in('match_id', drop)
if (e1) { console.error('Feil ved sletting av match_coaches:', e1.message); process.exit(1) }

const { error: e2 } = await supabase.from('matches').delete().in('id', drop)
if (e2) { console.error('Feil ved sletting av kamper:', e2.message); process.exit(1) }

const { data: after } = await supabase.from('matches').select('id').eq('season_id', SEASON)
console.log(`\nFerdig. Kamper i sesongen: ${matches.length} → ${after.length}`)
