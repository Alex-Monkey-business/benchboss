// Serielagene (Halsen Grønn/Rød/Hvit) + trenere. Statisk konfig.
// Til forskjell fra cup-troppen ligger serie-tilhørigheten på spilleren selv
// (players.primary_team) — denne configen gir bare navn, farge og trenere.
import { COACH_TEAMS } from './coachTeams'

export const SEASON_TEAMS = [
  { slug: 'gronn', name: 'Grønn', accent: 'sage', trainers: COACH_TEAMS.gronn },
  { slug: 'rod',   name: 'Rød',   accent: 'warm', trainers: COACH_TEAMS.rod },
  { slug: 'hvit',  name: 'Hvit',  accent: 'paper', trainers: COACH_TEAMS.hvit }
]

export function seasonTeam(slug) {
  return SEASON_TEAMS.find(t => t.slug === slug) || null
}
