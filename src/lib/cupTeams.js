// Cup-lagene + trenere for AKTIV cup. Statisk konfig (byttes per cup).
// Brukes til å gruppere cup-troppen og vise hvem som er trenere per lag.
// NB: nye slugs må også inn i DB-checken på cup_matches.our_team og
// cup_squad.cup_team (se supabase-sandarcup-2026.sql).
export const CUP_TEAMS = [
  { slug: 'halsen',  name: 'Halsen IF',   trainers: ['Simon', 'Trond'] },
  { slug: 'halsen2', name: 'Halsen IF 2', trainers: ['Alex', 'Iver'] }
]

// Historiske lag — gamle cup-kamper (Bø Cup) skal fortsatt vise riktig navn.
const LEGACY_TEAMS = [
  { slug: 'goat', name: 'Halsen IF Goat', trainers: ['Alex', 'Jacob', 'Simon'] },
  { slug: 'han',  name: 'Halsen IF Han',  trainers: ['Trond', 'Iver'] }
]

export function cupTeam(slug) {
  return CUP_TEAMS.find(t => t.slug === slug)
    || LEGACY_TEAMS.find(t => t.slug === slug)
    || null
}
