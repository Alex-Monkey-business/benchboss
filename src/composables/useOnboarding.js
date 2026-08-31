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
  const { activeCohort, isCoach, isAdmin, isPlatformAdmin, coach } = useAuth()
  const { players, fetchPlayers } = usePlayers()
  const { seasonTeams, teamsFromDb, reloadTeams, invalidateTeamCoaches } = useSeasonTeams()
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

  // «Har kullet spillere» var feil spørsmål. Ni spillere på Grønn markerte
  // steget som gjort, kortet forsvant, og Gul og Hvit ble aldri spurt om.
  // Steget er gjort når HVERT lag har noen på seg.
  const lagMedSpillere = computed(() => new Set(players.value.map(p => p.primary_team).filter(Boolean)))
  const lagUtenSpillere = computed(() => seasonTeams.value.filter(t => !lagMedSpillere.value.has(t.slug)))
  const playersDone = computed(() =>
    seasonTeams.value.length ? players.value.length > 0 && !lagUtenSpillere.value.length : players.value.length > 0
  )
  // Å invitere de andre trenerne er IKKE et oppsettsteg. Sten vil prøve appen
  // før han drar med seg trenerteamet, og et kort som maser om det tar plass
  // fra jobbene som faktisk må gjøres. Invitasjoner bor i Admin → Tilgang,
  // der de hører hjemme som en løpende oppgave.
  //
  // Feltet blir stående fordi `steps` og nummereringen leser det — det er
  // bare alltid sant nå.
  const coachesDone = computed(() => true)
  // «Hent kampene» er et steg som ALDRI kan bli ferdig for de yngste. G6, G7
  // og G8 har ingen terminliste i FIKS i det hele tatt — verifisert mot Halsens
  // fire G6-lag: fire lag, null kamper på alle fire.
  //
  // Uten dette står `active` evig sann for et slikt kull: onboarding-kortet
  // «Last opp kampprogrammet» blir stående for godt, og «Å ordne» og «Andre
  // lag» er skjult resten av sesongen fordi de viker for onboardingen.
  //
  // Fasiten er `fiks_synced_at`: den settes av importen uansett om den fant
  // noe. Er hvert FIKS-koblet lag synket og kullet fortsatt uten kamper, har
  // vi spurt og fått svaret. Publiseres terminlista senere, henter den
  // automatiske synken den inn, og da er matches.length > 0 uansett.
  const fiksLag = computed(() => seasonTeams.value.filter(t => t.fiks_team_id))
  const fiksSpurtOgTom = computed(() =>
    fiksLag.value.length > 0 && fiksLag.value.every(t => t.fiks_synced_at)
  )
  const matchesDone = computed(() => matches.value.length > 0 || fiksSpurtOgTom.value)

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

    // Samme regel som i veiviseren: den som lager laget, trener det — til
    // noe annet er sagt i Admin → Tilgang. Uten koblingen får kampene på
    // laget ingen trener, og Hjem har ingenting å vise.
    const coachId = coach.value?.id
    const seasonId = activeSeason.value?.id
    if (data?.id && coachId && seasonId) {
      const { error: linkFeil } = await supabase.from('team_coaches').insert({
        cohort_id: id, team_id: data.id, coach_id: coachId, season_id: seasonId
      })
      if (linkFeil && linkFeil.code !== '23505') console.warn('Kunne ikke koble trener til laget:', linkFeil.message)
      else invalidateTeamCoaches()
    }

    await reloadTeams(id)
    return data
  }

  async function renameTeam(teamId, name) {
    const trimmed = (name || '').trim()
    const id = activeCohort.value?.id
    if (!trimmed || !teamId || !isSupabaseConfigured) return
    // Slugen følger navnet (FK-ene har ON UPDATE CASCADE), så en spiller
    // på laget følger med når laget døpes om.
    const { data, error } = await supabase
      .from('teams')
      .update({ name: trimmed, slug: slugify(trimmed) })
      .eq('id', teamId)
      .select('id')
    if (error) throw error
    if (!data?.length) throw new Error('Laget ble ikke døpt om')
    await reloadTeams(id)
  }

  async function removeTeam(teamId) {
    const id = activeCohort.value?.id
    if (!teamId || !isSupabaseConfigured) return
    // ON DELETE RESTRICT: har laget spillere, sier basen stopp. Riktig.
    const { data, error } = await supabase
      .from('teams').delete().eq('id', teamId).select('id')
    if (error) throw error
    if (!data?.length) throw new Error('Laget ble ikke slettet')
    await reloadTeams(id)
  }

  return {
    active, remaining, steps,
    teamsDone, playersDone, coachesDone, matchesDone, canManageMembers,
    lagMedSpillere, lagUtenSpillere,
    memberCount, activeSeason,
    load, addTeam, renameTeam, removeTeam
  }
}
