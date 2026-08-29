// NFF-defaultene: årskull → spillform → kamplengde.
//
// Lå inne i PlattformView. Nå velger treneren årgangen selv i veiviseren, og
// da må de samme tallene gjelde begge steder — ellers får et kull opprettet
// av treneren 7er mens ett opprettet av deg får 5er.

// Grensene er sjekket mot ekte baner i FIKS hos Halsen, Stag, Sandefjord BK
// og Nanset: banenavnet sier «5er», «7er» eller «9er». Alle fire spiller 9er
// som 13-åringer — tabellen sa 11er, og det var feil.
export function formatFor(birthYear, year = new Date().getFullYear()) {
  const y = parseInt(birthYear, 10)
  if (!y) return null
  const age = year - y
  if (age <= 7) return 3
  if (age <= 9) return 5
  if (age <= 11) return 7
  if (age <= 13) return 9
  return 11
}

// spillform → [omganger, minutter per omgang]
export const PERIODS = { 3: [2, 15], 5: [2, 20], 7: [2, 30], 9: [2, 30], 11: [2, 35] }

export function periodsFor(playersOnPitch) {
  return PERIODS[playersOnPitch] || PERIODS[7]
}

// Alt spillformen bestemmer, i én rad — klar for update på cohorts.
export function cohortFormat(birthYear, year = new Date().getFullYear()) {
  const players_on_pitch = formatFor(birthYear, year) || 7
  const [period_count, period_minutes] = periodsFor(players_on_pitch)
  return { players_on_pitch, period_count, period_minutes }
}
