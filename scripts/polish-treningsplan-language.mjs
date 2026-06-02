#!/usr/bin/env node
// Rydd språket på de eksisterende treningsøktene (rå Messenger-paste → hele setninger).
// Overskriver drills per dag. Idempotent. Bruker anon-nøkkel.
//
// Usage: node scripts/polish-treningsplan-language.mjs

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(Boolean).map(l => l.split('=').map(s => s.trim()))
)
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

const DRILLS_BY_TITLE = {
  Tirsdag: [
    { type: 'diff', text: 'Medtak, dribling, vending og pasning. To baner med 10–12 spillere på hver. Vær sjef over ballen.', link: { label: 'Medtak, dribling, vending, pasning', url: 'https://tiim.no/ovelse/medtak-dribling-vending-pasning' } },
    { type: 'diff', text: '3v3 med press i ryggen. Ni spillere per bane. Spill fremover.', link: null },
    { type: 'mix',  text: 'Vinneren står. Korte 7er-baner, dødballer fra keeper og faste keepere.', link: null }
  ],
  Torsdag: [
    { type: 'mix',  text: 'Ferdighetssirkel som avsluttes med press. Vær sjef over ballen.', link: null },
    { type: 'diff', text: '30 minutter med «vinneren står». Tre 3v3-baner på småmål med én fast joker (A-spiller) på hver bane. Spill fremover. Differensiert i nivå A, B og C — tre lag à tre spillere per bane.', link: null }
  ],
  Lørdag: [
    { type: 'diff', text: 'Utvidet Barça-oppvarming. Innside, utside, såle, vendinger og finter med begge føtter, rundt kjegler.', link: null },
    { type: 'diff', text: 'Eggs (transition game). 4v4, 3v3 eller 2v2 ut fra hvor mange som er på trening.', link: { label: 'Eggs Transition Game – 4v4 til 4v3', url: 'https://tiim.no/ovelse/eggs-transition-game-4v4-til-4v3' } },
    { type: 'mix',  text: '4v4-turnering på korte baner, helst med store mål.', link: null },
    { type: 'none', text: 'Avslutt med tverrliggerkonkurranse og killer.', link: null }
  ]
}

const { data: rows, error } = await supabase.from('training_sessions').select('id,title')
if (error) { console.error('Klarte ikke å hente økter:', error.message); process.exit(1) }

for (const r of rows) {
  const drills = DRILLS_BY_TITLE[r.title]
  if (!drills) { console.log(`– hopper over «${r.title}»`); continue }
  const { error: e } = await supabase.from('training_sessions').update({ drills }).eq('id', r.id)
  if (e) console.error(`✗ «${r.title}»: ${e.message}`)
  else console.log(`✓ «${r.title}» → språk ryddet (${drills.length} øvelser)`)
}
