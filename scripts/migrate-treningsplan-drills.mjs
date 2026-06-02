#!/usr/bin/env node
// Migrer eksisterende treningsøkter til drills-formen (Diff/Mix-badge + egen lenke).
// Setter strukturerte drills på Tirsdag/Torsdag/Lørdag og nuller ut legacy body/links.
// Forutsetter at kolonnen drills er lagt til (ALTER TABLE ... ADD COLUMN drills).
//
// Usage: node scripts/migrate-treningsplan-drills.mjs

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(Boolean).map(l => l.split('=').map(s => s.trim()))
)
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

const DRILLS_BY_TITLE = {
  Tirsdag: [
    { type: 'diff', text: 'Medtak, dribling, vending, pasning\n2 baner x 10–12 spillere. Sjef over ballen.', link: { label: 'Medtak, dribling, vending, pasning', url: 'https://tiim.no/ovelse/medtak-dribling-vending-pasning' } },
    { type: 'diff', text: '3v3 med press i rygg, SF. 9 per bane. Spille fremover.', link: null },
    { type: 'mix',  text: 'Vinneren står, kort 7er, dødballer fra keeper, faste keepere.', link: null }
  ],
  Torsdag: [
    { type: 'mix',  text: 'Ferdighetssirkel med press til slutt. Sjef over ballen.', link: null },
    { type: 'diff', text: '30 min vinneren står, 3× 3v3-baner på småmål, med faste jokere (A-spiller) per bane, spille fremover. Diff i A, B og C. 3 lag à 3 per bane.', link: null }
  ],
  Lørdag: [
    { type: 'diff', text: 'Utvidet barça-oppvarming. Innside/utside/såle/vendinger/finter med begge føtter. Kjegler.', link: null },
    { type: 'diff', text: 'Eggs, 4v4 / 3v3 / 2v2 ut fra antall.', link: { label: 'Eggs Transition Game – 4v4 til 4v3', url: 'https://tiim.no/ovelse/eggs-transition-game-4v4-til-4v3' } },
    { type: 'mix',  text: '4v4-turnering, korte baner, helst store mål.', link: null },
    { type: 'none', text: 'Tverrliggerkonk og killer.', link: null }
  ]
}

const { data: sessions, error } = await supabase
  .from('training_sessions')
  .select('id,title,drills')

if (error) {
  console.error('Klarte ikke å hente økter:', error.message)
  process.exit(1)
}

for (const s of sessions) {
  const drills = DRILLS_BY_TITLE[s.title]
  if (!drills) {
    console.log(`– hopper over «${s.title}» (ingen mapping)`) ; continue
  }
  if (Array.isArray(s.drills) && s.drills.length) {
    console.log(`– «${s.title}» har allerede drills, lar den være`) ; continue
  }
  const { error: upErr } = await supabase
    .from('training_sessions')
    .update({ drills, body: null, links: [] })
    .eq('id', s.id)
  if (upErr) console.error(`✗ «${s.title}»: ${upErr.message}`)
  else console.log(`✓ «${s.title}» → ${drills.length} øvelser`)
}
