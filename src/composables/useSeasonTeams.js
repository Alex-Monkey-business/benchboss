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
const loaded = ref(false)
let inflight = null

registerReset(() => { rows.value = []; loaded.value = false; inflight = null })

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
    if (loaded.value) return seasonTeams.value
    if (inflight) return inflight
    if (!isSupabaseConfigured || !cohortId) return seasonTeams.value

    inflight = (async () => {
      const [teamRes, linkRes] = await Promise.all([
        supabase
          .from('teams')
          .select('id, slug, name, accent, position')
          .eq('cohort_id', cohortId)
          .order('position'),
        seasonId
          ? supabase
              .from('team_coaches')
              .select('team_id, coaches(name)')
              .eq('cohort_id', cohortId)
              .eq('season_id', seasonId)
          : Promise.resolve({ data: [], error: null })
      ])

      // Feiler noe, beholder vi fallbacken. Halvfylte lag er verre enn
      // statiske: da ville kamper blitt satt på feil trenere.
      if (teamRes.error || linkRes.error || !teamRes.data?.length) {
        inflight = null
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
      loaded.value = true
      inflight = null
      return seasonTeams.value
    })()

    return inflight
  }

  function setSeasonTeams(next) {
    rows.value = Array.isArray(next) ? next : []
    loaded.value = rows.value.length > 0
  }

  return { seasonTeams, seasonTeam, fetchSeasonTeams, setSeasonTeams, loaded }
}
