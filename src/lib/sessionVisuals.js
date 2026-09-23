// Bildet og fargen på en økt velges av appen, ikke av deg.
//
// Før var begge deler felt i redigeringsskjemaet: seks fargeruter og ti
// illustrasjoner å ta stilling til hver gang du skulle rette en skrivefeil.
// Ukedagen bærer allerede meningen — tirsdag er ferdighetsøkta, torsdag
// sirkelen, lørdag spill — så den bestemmer bildet.

// weekday (1 = mandag) → motiv i illustrasjonssettet (components/Spot.vue).
const WEEKDAY_MOTIF = {
  2: 'skills',   // tirsdag: ferdigheter
  4: 'passing',  // torsdag: sirkelen, pasninger
  6: 'game'      // lørdag: spill
}

// Lagrede økter peker fortsatt på filnavn fra leiresettet. De oversettes her,
// så ingen rad i basen må skrives om.
const LEGACY_MOTIF = {
  'tuesday_june_tranparent.png': 'skills',   // NB: skrivefeil i filnavnet, ikke her
  'tuesday_june.png': 'skills',
  'thursday_june_transparent.png': 'passing',
  'saturday_june_transparent.png': 'game',
  'dribbling-slalom-3d.png': 'skills',
  'pass-and-move-3d.png': 'passing',
  'rondo-possession-3d.png': 'passing',
  'small-sided-game-3v3-3d.png': 'game'
}

// Økt-farger roterer med posisjon, så en periode aldri blir ensfarget.
//
// «sage» og «warm»/«peach» er ute: de var Halsen Grønn og Halsen Rød, og en
// dagfarge kan ikke låne et lags identitet. Fem holder — en uke har sjelden
// flere enn tre-fire økter. Lagrede verdier peker videre i app.css.
export const SESSION_ACCENTS = ['sky', 'olive', 'plum', 'cornflower', 'taupe']

export function accentForPosition(i) {
  return SESSION_ACCENTS[i % SESSION_ACCENTS.length]
}

// En tom dag skal ikke love noe: bildet kommer når økta har innhold.
// Et lagret valg vinner alltid — gamle økter beholder motivet sitt.
export function sessionMotif(session) {
  if (!session) return null
  if (session.illustration) {
    const file = session.illustration.replace(/\.webp$/, '.png')
    return LEGACY_MOTIF[file] || WEEKDAY_MOTIF[session.weekday] || 'training'
  }
  if (!(session.drills || []).length) return null
  return WEEKDAY_MOTIF[session.weekday] || null
}
