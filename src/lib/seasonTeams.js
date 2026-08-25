// Demo-lagene — brukes KUN når appen kjører uten Supabase.
//
// I prod er lagene kullets `teams`-rader (se useSeasonTeams). Denne lista er
// et øyeblikksbilde av Halsen G2015 som gjør demo-modus levende, ikke en kilde
// noe i appen skal falle tilbake på.
export const SEASON_TEAMS = [
  { slug: 'gronn', name: 'Grønn', accent: 'sage',  trainers: ['Simon', 'Alex'] },
  { slug: 'rod',   name: 'Rød',   accent: 'warm',  trainers: ['Trond'] },
  { slug: 'hvit',  name: 'Hvit',  accent: 'paper', trainers: ['Iver', 'Jacob'] }
]
