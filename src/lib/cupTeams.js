// Cup-lagene + trenere. Statisk konfig (endres sjelden).
// Brukes til å gruppere cup-troppen og vise hvem som er trenere per lag.
export const CUP_TEAMS = [
  { slug: 'goat', name: 'Halsen IF Goat', trainers: ['Alex', 'Jacob', 'Simon'] },
  { slug: 'han',  name: 'Halsen IF Han',  trainers: ['Trond', 'Iver'] }
]

export function cupTeam(slug) {
  return CUP_TEAMS.find(t => t.slug === slug) || null
}
