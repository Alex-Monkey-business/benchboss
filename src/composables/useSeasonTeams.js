import { ref, computed } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { registerReset } from '../stores/dataReset'
import { SEASON_TEAMS } from '../lib/seasonTeams'

// Serielagene som ÉN kilde for hele appen.
//
// Lagene og trener-til-lag kommer nå fra `teams` og `team_coaches` i basen.
// Den statiske configen i lib/seasonTeams.js er fallback: den brukes til
// DB-radene er hentet, og for kull som ennå ikke har fått lag.
//
// Views skal lese herfra, aldri importere SEASON_TEAMS direkte.
const rows = ref([])
// Cachen er per SESONG, ikke bare «lastet». Lagene roterer mellom sesonger,
// så en cache som ikke vet hvilken sesong den gjelder ville servert høstens
// trenere til vårens kamper.
const loadedKey = ref(null)
// Nøkkelet, ikke bare en flagg-promise: to samtidige kall for ULIKE sesonger
// skal ikke dele svar.
let inflight = null
let inflightKey = null

registerReset(() => { rows.value = []; loadedKey.value = null; inflight = null; inflightKey = null })

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
          // Tom liste er et gyldig svar: et lag KAN stå uten trener, og da
          // skal ikke den statiske lista snike inn gamle navn. Derfor `??`
          // på null/undefined, ikke `||` på tom array.
          trainers: r.trainers ?? fallback?.trainers ?? []
        }
      })
  })

  function seasonTeam(slug) {
    return seasonTeams.value.find(t => t.slug === slug) || null
  }

  // Henter lag + trenerkoblinger for kullet og sesongen. Idempotent, og
  // samler samtidige kall i én forespørsel — den kalles fra flere steder som
  // alle kan komme først.
  async function fetchSeasonTeams(cohortId, seasonId) {
    // Uten sesong kan trenerkoblingene ikke slås opp. Da skal vi IKKE late som
    // om lagene er tomme for trenere — vi lar den statiske fallbacken stå, og
    // prøver igjen neste gang. Alternativet er kamper uten trenere, i stillhet.
    if (!isSupabaseConfigured || !cohortId || !seasonId) return seasonTeams.value

    const key = `${cohortId}:${seasonId}`
    if (loadedKey.value === key) return seasonTeams.value
    if (inflight && inflightKey === key) return inflight

    inflightKey = key
    inflight = (async () => {
      const [teamRes, linkRes] = await Promise.all([
        supabase
          .from('teams')
          .select('id, slug, name, accent, position')
          .eq('cohort_id', cohortId)
          .order('position'),
        supabase
          .from('team_coaches')
          .select('team_id, coaches(name)')
          .eq('cohort_id', cohortId)
          .eq('season_id', seasonId)
      ])

      // Feiler noe, beholder vi fallbacken. Halvfylte lag er verre enn
      // statiske: da ville kamper blitt satt på feil trenere.
      if (teamRes.error || linkRes.error || !teamRes.data?.length) {
        inflight = null; inflightKey = null
        return seasonTeams.value
      }

      const byTeam = new Map()
      for (const link of linkRes.data || []) {
        const name = link.coaches?.name
        if (!name) continue
        if (!byTeam.has(link.team_id)) byTeam.set(link.team_id, [])
        byTeam.get(link.team_id).push(name)
      }

      rows.value = teamRes.data.map(t => ({
        ...t,
        trainers: byTeam.get(t.id) ?? []
      }))
      loadedKey.value = key
      inflight = null; inflightKey = null
      return seasonTeams.value
    })()

    return inflight
  }

  function setSeasonTeams(next) {
    rows.value = Array.isArray(next) ? next : []
    loadedKey.value = null
  }

  // Står lagene på ekte rader fra basen, eller er vi på den statiske
  // fallbacken? Den forskjellen avgjør hvor mye `trainers` er verdt: DB-radene
  // er sesongens fasit, configen er et hardkodet øyeblikksbilde.
  const teamsFromDb = computed(() => rows.value.length > 0)

  return { seasonTeams, seasonTeam, teamsFromDb, fetchSeasonTeams, setSeasonTeams }
}
