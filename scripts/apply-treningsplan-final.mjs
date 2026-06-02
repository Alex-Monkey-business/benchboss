#!/usr/bin/env node
// Oppdater prod-innholdet til endelig tilstand: periode-fokus, illustrasjoner,
// rettede fokustekster og berikede øvelser (tema/læringsmomenter/organisering).
// Forutsetter at kolonnene accent, focus, illustration finnes på training_sessions.
// Idempotent — overskriver. Bruker anon-nøkkel + allow_all.
//
// Usage: node scripts/apply-treningsplan-final.mjs

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(Boolean).map(l => l.split('=').map(s => s.trim()))
)
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

const PERIOD_TITLE = 'Ukeplan — frem til sommerferien'
const PERIOD_LEAD = 'Sjef over ballen, grunnferdigheter og spill med mye involvering.'

const SESSIONS = {
  Tirsdag: {
    accent: 'sky',
    illustration: 'tuesday_june_tranparent.png',
    focus: 'Ferdigheter under press. Bli sjef over ballen i trange rom — medtak, vending og første touch som tar deg ut av presset.',
    drills: [
      {
        type: 'diff',
        text: 'Medtak, dribling, vending og pasning. Vær sjef over ballen.',
        tema: 'Spille oss fremover',
        laeringsmomenter: [
          'Mykt medtak ut til siden — fremover på andre touch',
          'Løft blikket og finn timing på finta',
          'Finte med tempo og store bevegelser for å passere'
        ],
        organisering: 'To og to per stasjon, flere stasjoner ved siden av hverandre. Pasning gjennom en port, retningsbestemt medtak, dribling forbi kjegler, finte mot passivt press, og vending ved siste kjegle. Bytt roller.',
        link: { label: 'Medtak, dribling, vending, pasning', url: 'https://tiim.no/ovelse/medtak-dribling-vending-pasning' }
      },
      { type: 'diff', text: '3v3 med press i ryggen. Ni spillere per bane. Spill fremover.', link: null },
      { type: 'mix',  text: 'Vinneren står. Korte 7er-baner, dødballer fra keeper og faste keepere.', link: null }
    ]
  },
  Torsdag: {
    accent: 'peach',
    illustration: 'thursday_june_transparent.png',
    focus: 'Grunnferdigheter og spill. Ferdighetssirkel for å bli sjef over ballen, så smålagsspill 3v3 med mye involvering.',
    drills: [
      { type: 'mix',  text: 'Ferdighetssirkel som avsluttes med press. Vær sjef over ballen.', link: null },
      { type: 'diff', text: '30 minutter med «vinneren står». Tre 3v3-baner på småmål med én fast joker (A-spiller) på hver bane. Spill fremover. Differensiert i nivå A, B og C — tre lag à tre spillere per bane.', link: null }
    ]
  },
  Lørdag: {
    accent: 'olive',
    illustration: 'saturday_june_transparent.png',
    focus: 'Spill og mestring. Mye touch, små lag, mange mål — la dem prøve det vi har trent på.',
    drills: [
      { type: 'diff', text: 'Utvidet Barça-oppvarming. Innside, utside, såle, vendinger og finter med begge føtter, rundt kjegler.', link: null },
      { type: 'diff', text: 'Eggs (transition game). 4v4, 3v3 eller 2v2 ut fra hvor mange som er på trening.', link: { label: 'Eggs Transition Game – 4v4 til 4v3', url: 'https://tiim.no/ovelse/eggs-transition-game-4v4-til-4v3' } },
      { type: 'mix',  text: '4v4-turnering på korte baner, helst med store mål.', link: null },
      { type: 'none', text: 'Avslutt med tverrliggerkonkurranse og killer.', link: null }
    ]
  }
}

// Periode-fokus
const { error: pErr } = await supabase
  .from('training_periods')
  .update({ lead: PERIOD_LEAD })
  .eq('title', PERIOD_TITLE)
if (pErr) { console.error('Periode-oppdatering feilet:', pErr.message); process.exit(1) }
console.log(`✓ Periode-fokus oppdatert`)

// Økter
const { data: rows, error } = await supabase.from('training_sessions').select('id,title')
if (error) { console.error('Klarte ikke å hente økter:', error.message); process.exit(1) }

for (const r of rows) {
  const upd = SESSIONS[r.title]
  if (!upd) { console.log(`– hopper over «${r.title}»`); continue }
  const { error: e } = await supabase.from('training_sessions').update(upd).eq('id', r.id)
  if (e) console.error(`✗ «${r.title}»: ${e.message}`)
  else console.log(`✓ «${r.title}» → illustrasjon + fokus + øvelser`)
}
