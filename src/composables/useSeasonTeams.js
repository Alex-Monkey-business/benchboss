import { ref, computed, watch } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { registerReset } from '../stores/dataReset'
import { useAuth } from '../stores/auth'
import { SEASON_TEAMS } from '../lib/seasonTeams'
import { persistRef } from '../lib/persist'
import { useSeasons } from './useSeasons'

// Lagene som ÉN kilde for hele appen.
//
// Lagene er kullets `teams`-rader; trener-til-lag er `team_coaches`, per
// sesong. Den statiske configen i lib/seasonTeams.js finnes bare for
// demo-modus uten base. I prod er «ingen lag ennå» et gyldig svar — et nytt
// kull skal ikke se Halsens farger mens det venter på sine egne.
//
// Views skal lese herfra, aldri importere SEASON_TEAMS direkte.

// Kullets lag. Nøkkelet på kull-id.
const teamRows = persistRef('teamRows', ref([]))
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

function toTeam(r) {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name ?? r.slug,
    // Null = nøytralt. Nivålagene (A, B, C) har ingen farge.
    accent: r.accent ?? null,
    from_season_id: r.from_season_id ?? null,
    // FIKS-koblingen må følge med hit. Uten den fant importen ingen lag å
    // hente terminliste for, og ga stille null kamper.
    fiks_team_id: r.fiks_team_id ?? null,
    fiks_name: r.fiks_name ?? null,
    // Og tidsstempelet må følge med av nøyaktig samme grunn. Det er svaret
    // på «har vi spurt fotball.no?» — uten det leser onboardingen et kull
    // uten terminliste som uferdig, og henter hele lista på nytt hver økt.
    fiks_synced_at: r.fiks_synced_at ?? null,
    oppstilling: r.oppstilling ?? {},
    // Tom liste er et gyldig svar: et lag KAN stå uten trener. `r.trainers`
    // finnes bare på demo-rader og optimistiske oppdateringer uten id.
    trainers: trainersByTeam.value.get(r.id) ?? r.trainers ?? []
  }
}

// Alle kullets lag, alle sesonger. Til oppslag på slug: slug er unik per kull,
// så en kamp fra i fjor finner «Grønn» selv om i år er A, B og C.
const allTeams = computed(() => {
  if (!teamRows.value.length) return isSupabaseConfigured ? [] : SEASON_TEAMS
  return [...teamRows.value]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map(toTeam)
})

// Lagene en sesong spilte med. Et lag gjelder fra sesongen det ble laget for
// (null = fra starten), til en senere sesong får egne lag. Sesongene sorteres
// på created_at, som resten av appen.
const { seasons, activeSeason, viewingSeason } = useSeasons()
function teamsForSeason(seasonId) {
  const all = allTeams.value
  const generasjoner = new Set(all.map(t => t.from_season_id).filter(Boolean))
  if (!generasjoner.size) return all
  const list = seasons.value.length ? seasons.value : [activeSeason.value].filter(Boolean)
  const tid = id => list.find(s => s.id === id)?.created_at ?? ''
  const mål = seasonId ? tid(seasonId) : ''
  // Ukjent sesong: den nyeste generasjonen.
  let beste = null
  for (const g of generasjoner) {
    const t = tid(g)
    if (mål && t > mål) continue
    if (!beste || t > tid(beste)) beste = g
  }
  return all.filter(t => (t.from_season_id ?? null) === beste)
}

// Lagene nå: sesongen nye kamper havner i. Tropp, trenere, FIKS.
const seasonTeams = computed(() => teamsForSeason(activeSeason.value?.id))
// Lagene i sesongen brukeren ser på: kamplister og statistikk.
const viewingTeams = computed(() => teamsForSeason(viewingSeason.value?.id ?? activeSeason.value?.id))
// Har den aktive sesongen egne lag, eller arver den fra en tidligere?
const activeHasOwnTeams = computed(() =>
  !!activeSeason.value && allTeams.value.some(t => t.from_season_id === activeSeason.value.id))

const teamsFromDb = computed(() => teamRows.value.length > 0)

// Henter kullets lag. Idempotent per kull; samtidige kall deler forespørsel.
async function fetchTeams(cohortId) {
  if (!isSupabaseConfigured || !cohortId) return seasonTeams.value
  if (teamsCohort.value === cohortId) return seasonTeams.value
  if (teamsInflight) return teamsInflight

  teamsInflight = (async () => {
    const { data, error } = await supabase
      .from('teams')
      .select('*')
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

// Trenerkoblingene er cachet på kull+sesong. Lager man en NY kobling, er
// cachen løgn — og siden `fetchSeasonTeams` returnerer tidlig på treff, ville
// den aldri blitt hentet på nytt. Det ga 22 kamper uten trener rett etter at
// treneren var koblet til laget.
function invalidateTeamCoaches() {
  linksKey.value = null
  linksInflight = null
  linksInflightKey = null
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
  // Slås sammen på slug: views sender bare lagene for sesongen de viser, og
  // de andre sesongenes lag skal ikke forsvinne av det.
  const nye = new Map(rows.map(r => [r.slug, r]))
  const base = teamRows.value.length ? teamRows.value : (isSupabaseConfigured ? [] : SEASON_TEAMS)
  teamRows.value = [...base.map(r => nye.get(r.slug) ?? r), ...rows.filter(r => !base.some(b => b.slug === r.slug))]
  if (rows.some(r => Array.isArray(r.trainers))) {
    trainersByTeam.value = new Map(rows.filter(r => r.id).map(r => [r.id, r.trainers ?? []]))
  }
}

// Lagene følger det aktive kullet. Hentes så snart kullet er kjent, så kort og
// lister har farger og navn uten at hvert view må huske å be om dem — og
// hentes på nytt når plattform-admin bytter kull (resetAllData har da tømt).
const { activeCohort } = useAuth()
watch(() => activeCohort.value?.id, id => { if (id) fetchTeams(id) }, { immediate: true })

// Nye lag fra og med den aktive sesongen. Se bb_nye_lag: historikken fryses,
// alle tas av lagene, og lagene lages, i én transaksjon.
async function createTeamsForSeason(cohortId, seasonId, names) {
  const navn = (names || []).map(n => (n || '').trim()).filter(Boolean)
  if (!seasonId || !navn.length) return []
  if (!isSupabaseConfigured) {
    const base = teamRows.value.length ? teamRows.value : SEASON_TEAMS.map(t => ({ ...t, from_season_id: null }))
    const brukte = new Set(base.map(t => t.slug))
    const nye = navn.map((name, i) => {
      const rot = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'lag'
      let slug = rot, n = 2
      while (brukte.has(slug)) slug = `${rot}-${n++}`
      brukte.add(slug)
      return { id: `demo-team-${Date.now()}-${i}`, slug, name, accent: null, position: i, from_season_id: seasonId, trainers: [] }
    })
    teamRows.value = [...base, ...nye]
    return nye
  }
  const { data, error } = await supabase.rpc('bb_nye_lag', { p_season_id: seasonId, p_names: navn })
  if (error) throw error
  await reloadTeams(cohortId)
  return data || []
}

export function useSeasonTeams() {
  // Slug er unik per kull, så oppslaget går over alle sesonger.
  function seasonTeam(slug) {
    return allTeams.value.find(t => t.slug === slug) || null
  }

  return {
    seasonTeams, viewingTeams, allTeams, teamsForSeason, activeHasOwnTeams, seasonTeam,
    teamsFromDb, fetchTeams, reloadTeams, fetchSeasonTeams, setSeasonTeams, invalidateTeamCoaches,
    createTeamsForSeason
  }
}
