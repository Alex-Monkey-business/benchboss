#!/usr/bin/env node
// Sett farge (accent) + fokusområde på de eksisterende treningsøktene.
// Forutsetter at kolonnene accent + focus er lagt til på training_sessions.
//
// Usage: node scripts/migrate-treningsplan-accents.mjs

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(Boolean).map(l => l.split('=').map(s => s.trim()))
)
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

const BY_TITLE = {
  Tirsdag: { accent: 'sky',   focus: 'Ferdigheter under press. Bli sjef over ballen i trange rom — medtak, vending og første touch som tar deg ut av presset.' },
  Torsdag: { accent: 'peach', focus: 'Dueller og mot. Vinn ballen i 1v1, og spill fremover med en gang du har den.' },
  Lørdag:  { accent: 'olive', focus: 'Spill og mestring. Mye touch, små lag, mange mål — la dem prøve det vi har trent på.' }
}

const { data: rows, error } = await supabase.from('training_sessions').select('id,title')
if (error) {
  console.error('Klarte ikke å hente økter:', error.message)
  process.exit(1)
}

for (const r of rows) {
  const upd = BY_TITLE[r.title]
  if (!upd) { console.log(`– hopper over «${r.title}»`); continue }
  const { error: e } = await supabase.from('training_sessions').update(upd).eq('id', r.id)
  if (e) console.error(`✗ «${r.title}»: ${e.message}`)
  else console.log(`✓ «${r.title}» → ${upd.accent}`)
}
