import { ref, computed } from 'vue'
import { registerReset } from '../stores/dataReset'
import { SEASON_TEAMS } from '../lib/seasonTeams'

// Serielagene som ÉN kilde for hele appen.
//
// I dag kommer de fra den statiske configen i lib/seasonTeams.js. Når `teams`
// og `team_coaches` finnes i basen, fylles `rows` derfra og DB-raden vinner —
// uten at et eneste view må endres. Derfor skal views lese herfra, aldri
// importere SEASON_TEAMS direkte.
const rows = ref([])

registerReset(() => { rows.value = [] })

export function useSeasonTeams() {
  const seasonTeams = computed(() => {
    if (!rows.value.length) return SEASON_TEAMS

    return [...rows.value]
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map(r => {
        const fallback = SEASON_TEAMS.find(t => t.slug === r.slug)
        return {
          slug: r.slug,
          name: r.name ?? fallback?.name ?? r.slug,
          accent: r.accent ?? fallback?.accent ?? 'paper',
          // Trenere blir team_coaches-rader per sesong. Til da: statisk konfig.
          trainers: r.trainers ?? fallback?.trainers ?? []
        }
      })
  })

  function seasonTeam(slug) {
    return seasonTeams.value.find(t => t.slug === slug) || null
  }

  // Fylles av fase 2 når teams-tabellen finnes. Views trenger ikke vite når.
  function setSeasonTeams(next) {
    rows.value = Array.isArray(next) ? next : []
  }

  return { seasonTeams, seasonTeam, setSeasonTeams }
}
