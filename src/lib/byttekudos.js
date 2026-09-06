// Kudos for et rettferdig bytte: minst tid inn, mest tid ut.
//
// Alex' bestilling: et lite, internt stikk til trenerne som favoriserer noen
// spillere. På spøk, med humor, og til treneren, ikke til barna. Setningene
// roterer, så den som bytter riktig hele kampen ikke leser samme linje sju
// ganger. Kort, for de står i en toast ved siden av Angre.
export const BYTTEKUDOS = [
  'Minst tid inn, mest tid ut. Sånn skal det se ut.',
  'Rettferdig bytte. Ingen sinte foreldre i kveld.',
  'Alle får spille. Revolusjonerende.',
  'Et bytte ingen trenger å diskutere i bilen hjem.',
  'Lik spilletid. Noen trenere burde ta notater.',
  'Byttet som holder gruppechatten stille.'
]

export function kudosFor(n) {
  return BYTTEKUDOS[Math.abs(n) % BYTTEKUDOS.length]
}
