// Bildet og fargen på en økt velges av appen, ikke av deg.
//
// Før var begge deler felt i redigeringsskjemaet: seks fargeruter og ti
// illustrasjoner å ta stilling til hver gang du skulle rette en skrivefeil.
// Ukedagen bærer allerede meningen — tirsdag er ferdighetsøkta, torsdag
// sirkelen, lørdag spill — så den bestemmer bildet.

const ILLO_BASE = '/illustrations/bench-boss-exercise-illustrations/'

// weekday (1 = mandag) → fast illustrasjon for treningsrytmen tir/tor/lør.
const WEEKDAY_ILLUSTRATION = {
  2: 'tuesday_june_tranparent.png',   // NB: skrivefeil i filnavnet, ikke her
  4: 'thursday_june_transparent.png',
  6: 'saturday_june_transparent.png'
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
// Et lagret valg vinner alltid — gamle økter beholder bildet sitt.
export function sessionIllustration(session) {
  if (!session) return null
  if (session.illustration) return session.illustration
  if (!(session.drills || []).length) return null
  return WEEKDAY_ILLUSTRATION[session.weekday] || null
}

export function illoWebp(file) {
  return file ? ILLO_BASE + file.replace(/\.png$/, '.webp') : null
}

export function illoPng(file) {
  return file ? ILLO_BASE + file : null
}
