#!/usr/bin/env node
// Seed treningsplan-modulen: ukeplanen fra øvelsesansvarlig (frem til sommerferien).
// Bruker app-ens anon-nøkkel (allow_all RLS) — samme mønster som import-matches.mjs.
// Forutsetter at supabase-treningsplan-schema.sql allerede er kjørt (tabellene finnes).
//
// Usage:
//   node scripts/seed-treningsplan.mjs            (kjør innsetting)
//   node scripts/seed-treningsplan.mjs --dry-run  (vis hva som ville blitt lagt inn)

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const envFile = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const env = Object.fromEntries(
  envFile.split('\n').filter(Boolean).map(l => l.split('=').map(s => s.trim()))
)

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
const dryRun = process.argv.includes('--dry-run')

const PERIOD = {
  title: 'Ukeplan — frem til sommerferien',
  lead: 'Samme rytme hver uke: Tirsdag ferdigheter, Torsdag dueller, Lørdag spill.',
  accent: 'sage',
  start_date: '2026-06-02',
  end_date: '2026-07-04',
  position: 0
}

const SESSIONS = [
  {
    title: 'Tirsdag',
    body: 'Diff — Medtak, dribling, vending, pasning\n2 baner x 10–12 spillere. Sjef over ballen.\n\nDiff — 3v3 med press i rygg, SF. 9 per bane. Spille fremover.\n\nMix — Vinneren står, kort 7er, dødballer fra keeper, faste keepere.',
    links: [{ label: 'Medtak, dribling, vending, pasning', url: 'https://tiim.no/ovelse/medtak-dribling-vending-pasning' }],
    position: 0
  },
  {
    title: 'Torsdag',
    body: 'Mix — Ferdighetssirkel med press til slutt. Sjef over ballen.\n\nDiff — 30 min vinneren står, 3× 3v3-baner på småmål, med faste jokere (A-spiller) per bane, spille fremover. Diff i A, B og C. 3 lag à 3 per bane.',
    links: [],
    position: 1
  },
  {
    title: 'Lørdag',
    body: 'Diff — Utvidet barça-oppvarming. Innside/utside/såle/vendinger/finter med begge føtter. Kjegler.\n\nDiff — Eggs, 4v4 / 3v3 / 2v2 ut fra antall.\n\nMix — 4v4-turnering, korte baner, helst store mål.\n\nTverrliggerkonk og killer.',
    links: [{ label: 'Eggs Transition Game – 4v4 til 4v3', url: 'https://tiim.no/ovelse/eggs-transition-game-4v4-til-4v3' }],
    position: 2
  }
]

if (dryRun) {
  console.log('DRY RUN — ville lagt inn:')
  console.log('Periode:', PERIOD.title)
  SESSIONS.forEach(s => console.log(`  Økt: ${s.title} (${s.links.length} lenke(r))`))
  process.exit(0)
}

// Idempotent: hopp over hvis perioden allerede finnes.
const { data: existing } = await supabase
  .from('training_periods')
  .select('id')
  .eq('title', PERIOD.title)
  .maybeSingle()

if (existing) {
  console.error(`Perioden «${PERIOD.title}» finnes allerede (id ${existing.id}). Avbryter for å unngå duplikat.`)
  process.exit(0)
}

const { data: period, error: pErr } = await supabase
  .from('training_periods')
  .insert(PERIOD)
  .select()
  .single()

if (pErr) {
  console.error('Klarte ikke å lage perioden:', pErr.message)
  process.exit(1)
}

const rows = SESSIONS.map(s => ({ ...s, period_id: period.id }))
const { data: inserted, error: sErr } = await supabase
  .from('training_sessions')
  .insert(rows)
  .select()

if (sErr) {
  console.error('Klarte ikke å lage øktene:', sErr.message)
  process.exit(1)
}

console.log(`✓ Lagt inn periode «${period.title}» med ${inserted.length} økter.`)
