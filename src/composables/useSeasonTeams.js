import { ref, computed, watch } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { registerReset } from '../stores/dataReset'
import { useAuth } from '../stores/auth'
import { SEASON_TEAMS } from '../lib/seasonTeams'

// Lagene som ÉN kilde for hele appen.
//
// Lagene er kullets `teams`-rader; trener-til-lag er `team_coaches`, per
// sesong. Den statiske configen i lib/seasonTeams.js finnes bare for
// demo-modus uten base. I prod er «ingen lag ennå» et gyldig svar — et nytt
// kull skal ikke se Halsens farger mens det venter på sine egne.
//
// Views skal lese herfra, aldri importere SEASON_TEAMS direkte.

// Kullets lag. Nøkkelet på kull-id.
const teamRows = ref([])
const teamsCohort = ref(null)
let teamsInflight = null

// Trenerkoblingene. Nøkkelet på kull+sesong: lagene roterer mellom sesonger,
// så en cache som ikke vet hvilken sesong den gjelder ville servert høstens
// trenere til vårens kamper.
const trainersByTeam = ref(new Map())
const linksKey = ref(null)
let linksInflight = null
let linksInflightKey = null

registerReset(() => {
  teamRows.value = []
  teamsCohort.value = null
  teamsInflight = null
  trainersByTeam.value = new Map()
  linksKey.value = null
  linksInflight = null
  linksInflightKey = null
})

const seasonTeams = computed(() => {
  if (!teamRows.value.length) return isSupabaseConfigured ? [] : SEASON_TEAMS

  return [...teamRows.value]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map(r => ({
      id: r.id,
      slug: r.slug,
      name: r.name ?? r.slug,
      accent: r.accent ?? 'paper',
      // FIKS-koblingen må følge med hit. Uten den fant importen ingen lag å
      // hente terminliste for, og ga stille null kamper.
      fiks_team_id: r.fiks_team_id ?? null,
      fiks_name: r.fiks_name ?? null,
      // Tom liste er et gyldig svar: et lag KAN stå uten trener. `r.trainers`
      // finnes bare på demo-rader og optimistiske oppdateringer uten id.
      trainers: trainersByTeam.value.get(r.id) ?? r.trainers ?? []
    }))
})

const teamsFromDb = computed(() => teamRows.value.length > 0)

// Henter kullets lag. Idempotent per kull; samtidige kall deler forespørsel.
async function fetchTeams(cohortId) {
  if (!isSupabaseConfigured || !cohortId) return seasonTeams.value
  if (teamsCohort.value === cohortId) return seasonTeams.value
  if (teamsInflight) return teamsInflight

  teamsInflight = (async () => {
    const { data, error } = await supabase
      .from('teams')
      .select('id, slug, name, accent, position, fiks_team_id, fiks_name')
      .eq('cohort_id', cohortId)
      .order('position')
    teamsInflight = null
    if (error) return seasonTeams.value
    teamRows.value = data || []
    teamsCohort.value = cohortId
    return seasonTeams.value
  })()

  return teamsInflight
}

// Henter lag + trenerkoblinger for kullet og sesongen.
async function fetchSeasonTeams(cohortId, seasonId) {
  await fetchTeams(cohortId)
  // Uten sesong kan trenerkoblingene ikke slås opp. Lagene står, trenerne
  // venter til neste kall.
  if (!isSupabaseConfigured || !cohortId || !seasonId) return seasonTeams.value

  const key = `${cohortId}:${seasonId}`
  if (linksKey.value === key) return seasonTeams.value
  if (linksInflight && linksInflightKey === key) return linksInflight

  linksInflightKey = key
  linksInflight = (async () => {
    const { data, error } = await supabase
      .from('team_coaches')
      .select('team_id, coaches(name)')
      .eq('cohort_id', cohortId)
      .eq('season_id', seasonId)
    linksInflight = null; linksInflightKey = null
    if (error) return seasonTeams.value

    const byTeam = new Map()
    for (const link of data || []) {
      const name = link.coaches?.name
      if (!name) continue
      if (!byTeam.has(link.team_id)) byTeam.set(link.team_id, [])
      byTeam.get(link.team_id).push(name)
    }
    trainersByTeam.value = byTeam
    linksKey.value = key
    return seasonTeams.value
  })()

  return linksInflight
}

// Etter at lag er opprettet/endret/slettet: hent på nytt for det aktive kullet.
async function reloadTeams(cohortId) {
  teamsCohort.value = null
  teamsInflight = null
  return fetchTeams(cohortId)
}

// Optimistisk oppdatering fra views (TrenerView etter «Bytt lag»). Radene kan
// bære `trainers`; da oppdateres trenerkartet også, så det man nettopp gjorde
// vises før neste henting.
function setSeasonTeams(next) {
  const rows = Array.isArray(next) ? next : []
  teamRows.value = rows
  if (rows.some(r => Array.isArray(r.trainers))) {
    trainersByTeam.value = new Map(rows.filter(r => r.id).map(r => [r.id, r.trainers ?? []]))
  }
}

// Lagene følger det aktive kullet. Hentes så snart kullet er kjent, så kort og
// lister har farger og navn uten at hvert view må huske å be om dem — og
// hentes på nytt når plattform-admin bytter kull (resetAllData har da tømt).
const { activeCohort } = useAuth()
watch(() => activeCohort.value?.id, id => { if (id) fetchTeams(id) }, { immediate: true })

export function useSeasonTeams() {
  function seasonTeam(slug) {
    return seasonTeams.value.find(t => t.slug === slug) || null
  }

  return { seasonTeams, seasonTeam, teamsFromDb, fetchTeams, reloadTeams, fetchSeasonTeams, setSeasonTeams }
}
