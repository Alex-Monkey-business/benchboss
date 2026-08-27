import { ref, computed } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { useAuth } from '../stores/auth'
import { usePlayers } from './usePlayers'
import { useSeasonTeams } from './useSeasonTeams'
import { useMatches } from './useMatches'
import { useSeasons } from './useSeasons'
import { registerReset } from '../stores/dataReset'
import { slugify } from '../lib/playerList'

// Et tomt kull skal ikke se ut som en ferdig app. Så lenge kullet mangler
// lag, spillere eller kampprogram, er Hjem stedet det fylles — som kort som
// forsvinner ett og ett når jobben er gjort. Ingen egen onboarding-modus:
// samme kort gjelder når et halvfylt kull mangler noe om et halvt år.

const memberCount = ref(null)
const membersCohort = ref(null)

registerReset(() => { memberCount.value = null; membersCohort.value = null })

const ACCENTS = ['sage', 'warm', 'paper', 'sky', 'cornflower', 'olive', 'peach']

export function useOnboarding() {
  const { activeCohort, isCoach, isAdmin, isPlatformAdmin } = useAuth()
  const { players, fetchPlayers } = usePlayers()
  const { seasonTeams, teamsFromDb, reloadTeams } = useSeasonTeams()
  const { matches } = useMatches()
  const { activeSeason } = useSeasons()

  const canManageMembers = computed(() => isAdmin.value || isPlatformAdmin.value)

  async function load() {
    if (!isCoach.value) return
    await fetchPlayers()
    const id = activeCohort.value?.id
    if (isSupabaseConfigured && id && canManageMembers.value && membersCohort.value !== id) {
      const { count, error } = await supabase
        .from('cohort_members')
        .select('id', { count: 'exact', head: true })
        .eq('cohort_id', id)
        .neq('status', 'revoked')
      if (!error) { memberCount.value = count ?? 0; membersCohort.value = id }
    }
  }

  const teamsDone = computed(() => isSupabaseConfigured ? teamsFromDb.value : seasonTeams.value.length > 0)
  const playersDone = computed(() => players.value.length > 0)
  // Én rad er deg selv. Kortet står til noen andre er invitert. Kun admin
  // ser andres rader (RLS), så for en vanlig trener regnes steget som gjort.
  const coachesDone = computed(() => !canManageMembers.value || memberCount.value === null || memberCount.value > 1)
  const matchesDone = computed(() => matches.value.length > 0)

  const steps = computed(() => [
    { key: 'teams', done: teamsDone.value },
    { key: 'players', done: playersDone.value },
    { key: 'coaches', done: coachesDone.value },
    { key: 'matches', done: matchesDone.value }
  ])

  const remaining = computed(() => steps.value.filter(s => !s.done).map(s => s.key))

  // Vises når kullet mangler noe av grunnmuren. Trenerkortet alene holder
  // ikke — et etablert kull med én trener skal ikke få onboarding på Hjem.
  const active = computed(() =>
    isCoach.value && !!activeCohort.value && (!teamsDone.value || !playersDone.value || !matchesDone.value)
  )

  // ---- Lag ----
  async function addTeam(name) {
    const trimmed = (name || '').trim()
    const id = activeCohort.value?.id
    if (!trimmed || !id || !isSupabaseConfigured) return null
    const position = seasonTeams.value.length
    const { data, error } = await supabase
      .from('teams')
      .insert({
        cohort_id: id,
        name: trimmed,
        slug: slugify(trimmed),
        accent: ACCENTS[position % ACCENTS.length],
        position
      })
      .select()
      .single()
    if (error) throw error
    await reloadTeams(id)
    return data
  }

  async function renameTeam(teamId, name) {
    const trimmed = (name || '').trim()
    const id = activeCohort.value?.id
    if (!trimmed || !teamId || !isSupabaseConfigured) return
    // Slugen følger navnet (FK-ene har ON UPDATE CASCADE), så en spiller
    // på laget følger med når laget døpes om.
    const { error } = await supabase
      .from('teams')
      .update({ name: trimmed, slug: slugify(trimmed) })
      .eq('id', teamId)
    if (error) throw error
    await reloadTeams(id)
  }

  async function removeTeam(teamId) {
    const id = activeCohort.value?.id
    if (!teamId || !isSupabaseConfigured) return
    // ON DELETE RESTRICT: har laget spillere, sier basen stopp. Riktig.
    const { error } = await supabase.from('teams').delete().eq('id', teamId)
    if (error) throw error
    await reloadTeams(id)
  }

  return {
    active, remaining, steps,
    teamsDone, playersDone, coachesDone, matchesDone, canManageMembers,
    memberCount, activeSeason,
    load, addTeam, renameTeam, removeTeam
  }
}
