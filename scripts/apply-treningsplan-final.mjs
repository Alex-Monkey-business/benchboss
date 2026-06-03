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
        text: 'Medtak, dribling, vending og pasning',
        tema: 'Spille oss fremover',
        laeringsmomenter: [
          'Mykt medtak ut til siden — fremover på andre touch',
          'Løft blikket og finn timing på finta',
          'Finte med tempo og store bevegelser for å passere'
        ],
        organisering: 'To og to per stasjon. Pasning gjennom port, retningsbestemt medtak, dribling forbi kjegler, finte mot passivt press, vending ved siste kjegle. Bytt roller.',
        link: { label: 'Medtak, dribling, vending, pasning', url: 'https://tiim.no/ovelse/medtak-dribling-vending-pasning' }
      },
      { type: 'diff', text: '3v3 med press i ryggen', tema: 'Fart i angrep, hold overtaket', organisering: 'To baner med småmål. To forsvarere står ved eget mål; den siste starter bak angrepslagets mål og jager i press straks angriperne får ballen fra trener. Variasjon: forsvarslaget forsvarer to mål.', link: null },
      { type: 'mix',  text: 'Vinneren står', tema: 'Tempo og lite dødtid', organisering: 'To lag spiller kort 7er — ny kamp straks det er mål. De to andre roterer ved siden: ett på styrke, ett på en lettbeint øvelse.', link: null }
    ]
  },
  Torsdag: {
    accent: 'peach',
    illustration: 'thursday_june_transparent.png',
    focus: 'Grunnferdigheter og spill. Ferdighetssirkel for å bli sjef over ballen, så smålagsspill 3v3 med mye involvering.',
    drills: [
      { type: 'mix',  text: 'Ferdighetssirkel', tema: 'Sjef over ballen', organisering: 'Avsluttes med press.', link: null },
      { type: 'diff', text: 'Vinneren står — 3v3 på småmål', tema: 'Spille fremover', organisering: '30 min. Tre baner, én fast joker (A-spiller) per bane. Differensiert i nivå A, B og C — tre lag à tre per bane.', link: null }
    ]
  },
  Lørdag: {
    accent: 'olive',
    illustration: 'saturday_june_transparent.png',
    focus: 'Spill og mestring. Mye touch, små lag, mange mål — la dem prøve det vi har trent på.',
    drills: [
      { type: 'diff', text: 'Utvidet Barça-oppvarming', organisering: 'Innside, utside, såle, vendinger og finter med begge føtter, rundt kjegler.', link: null },
      { type: 'diff', text: 'Eggs (transition game)', organisering: '4v4, 3v3 eller 2v2 ut fra antall.', link: { label: 'Eggs Transition Game – 4v4 til 4v3', url: 'https://tiim.no/ovelse/eggs-transition-game-4v4-til-4v3' } },
      { type: 'mix',  text: '4v4-turnering', organisering: 'Korte baner, helst med store mål.', link: null },
      { type: 'none', text: 'Tverrliggerkonkurranse og killer', link: null }
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
