import { ref } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { useAuth } from '../stores/auth'
import { useSeasonTeams } from './useSeasonTeams'
import { useMatches } from './useMatches'
import {
  FIKS_BASE, CLUB_SEARCH_URL, clubSearchBody, parseClubSearch, usableClub,
  parseClubTeams, parseTerminliste, diffTerminliste, ageClass, teamsForAge, shortTeamName
} from '../lib/fiks'
import { slugify } from '../lib/playerList'
import { cohortFormat } from '../lib/spillform'

// Henting fra fotball.no. Parsing ligger i lib/fiks.js; her er nettet og
// basen.
//
// REGEL FOR ALT I DENNE FILA: ingenting kalles fra en flate som tegner.
// Onboardingen kaller søk og import fordi brukeren trykket på noe. Synken
// kalles etter at Hjem er tegnet, aldri før. En treg fotball.no skal aldri
// kunne holde igjen appen.

const ACCENTS = ['sage', 'warm', 'paper', 'sky', 'cornflower', 'olive', 'peach']

// Fargeordet i lagnavnet er bedre enn posisjonen i lista: «Grønn» skal være
// grønn, ikke salvie fordi den sto først.
const NAME_ACCENT = [
  [/\bgr(ø|o)nn\b/i, 'sage'],
  [/\br(ø|o)d\b/i, 'warm'],
  [/\bhvit\b/i, 'paper'],
  [/\bbl(å|a)\b/i, 'sky'],
  [/\bsort|svart\b/i, 'olive'],
  [/\bgul\b/i, 'peach']
]

function accentFor(name, position) {
  for (const [re, accent] of NAME_ACCENT) if (re.test(name)) return accent
  return ACCENTS[position % ACCENTS.length]
}

// Timeout, ikke evig venting. fotball.no er raskt, men det er ikke vår app
// som skal stå og se ødelagt ut når det ikke er det.
async function fetchWithTimeout(url, options = {}, ms = 12000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal })
    if (!res.ok) throw new Error(`fotball.no svarte ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(t)
  }
}

export function useFiks() {
  const { activeCohort, refreshMember, coach } = useAuth()
  const { seasonTeams, reloadTeams, invalidateTeamCoaches } = useSeasonTeams()
  const { matches, bulkAddMatches, backfillDefaultCoaches } = useMatches()

  const searching = ref(false)
  const working = ref(false)

  // ------------------------------------------------------------- Klubb

  async function searchClubs(query) {
    const q = String(query || '').trim()
    if (q.length < 2) return []
    searching.value = true
    try {
      const html = await fetchWithTimeout(CLUB_SEARCH_URL, {
        method: 'POST',
        // Skjemakoding er en av de tre typene nettleseren sender uten
        // preflight. Med JSON hadde søket krevd en OPTIONS-runde fotball.no
        // ikke svarer på.
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: clubSearchBody(q)
      })
      return parseClubSearch(html).filter(usableClub)
    } finally {
      searching.value = false
    }
  }

  // Reserve når klubben er kjent men søket ikke ga lagene: klubbsida.
  async function fetchClubTeams(clubFiksId) {
    const html = await fetchWithTimeout(
      `${FIKS_BASE}/fotballdata/klubb/hjem/?fiksId=${encodeURIComponent(clubFiksId)}&underside=lag`
    )
    return parseClubTeams(html)
  }

  async function linkClub(clubFiksId) {
    const id = activeCohort.value?.club_id
    if (!id || !isSupabaseConfigured) return
    const { error } = await supabase.rpc('bb_set_club_fiks_id', {
      p_club_id: id,
      p_fiks_id: Number(clubFiksId)
    })
    if (error) throw error
  }

  // Årgangen bestemmer spillformen, og spillformen bestemmer kamplengden.
  // Treneren skal ikke svare på tre spørsmål der ett holder — NFF har alt
  // bestemt de to siste.
  // Årgangen bestemmer også NAVNET. Kullet het det Alex skrev da han lagde
  // skallet — «Stag G2018» — mens treneren kan velge 2017. Da bar appen et
  // navn som var feil for alltid, og velkomstskjermen lovet et kull vi ikke
  // visste eksisterte ennå.
  function cohortName(year, gender) {
    const klubb = activeCohort.value?.club_short_name || activeCohort.value?.club_name?.split(' ')[0]
    return klubb && year ? `${klubb} ${gender || 'G'}${year}` : null
  }

  async function setBirthYear(year, gender = 'G') {
    const id = activeCohort.value?.id
    if (!id || !isSupabaseConfigured) return
    const navn = cohortName(year, gender)
    const { error } = await supabase
      .from('cohorts')
      .update({
        birth_year: Number(year),
        ...cohortFormat(year),
        ...(navn ? { name: navn, slug: slugify(navn) } : {})
      })
      .eq('id', id)
    if (error) throw error
  }

  // -------------------------------------------------------------- Lag

  // Lagene får kortnavnet («Grønn»), men husker hva de heter i FIKS — det er
  // det navnet som står i kampene.
  async function createTeams(fiksTeams) {
    const cohort = activeCohort.value
    if (!cohort?.id || !isSupabaseConfigured || !fiksTeams.length) return []
    const start = seasonTeams.value.length
    const rows = fiksTeams.map((t, i) => ({
      cohort_id: cohort.id,
      name: shortTeamName(t.name, cohort.club_name?.split(' ')[0] || ''),
      slug: slugify(shortTeamName(t.name, cohort.club_name?.split(' ')[0] || '')),
      accent: accentFor(t.name, start + i),
      position: start + i,
      fiks_team_id: Number(t.fiksId),
      fiks_name: t.name
    }))
    const { data, error } = await supabase.from('teams').insert(rows).select()
    if (error) throw error
    await reloadTeams(cohort.id)
    return data || []
  }

  // Den som setter opp kullet er foreløpig eneste trener — da trener han alle
  // lagene. Uten denne koblingen får de importerte kampene ingen trener, og
  // Hjem har ingenting å vise: «din kamp» finnes ikke før et lag har en trener.
  //
  // Kommer det flere trenere senere, endres dette i Admin → Tilgang. Dette er
  // en startverdi, ikke en låst sannhet.
  async function linkSelfToTeams(teams, seasonId) {
    const cohort = activeCohort.value
    const coachId = coach.value?.id
    if (!cohort?.id || !coachId || !seasonId || !teams?.length || !isSupabaseConfigured) return 0
    const rows = teams.filter(t => t.id).map(t => ({
      cohort_id: cohort.id, team_id: t.id, coach_id: coachId, season_id: seasonId
    }))
    if (!rows.length) return 0
    const { error } = await supabase.from('team_coaches').insert(rows)
    if (error && error.code !== '23505') throw error
    invalidateTeamCoaches()

    // Ble kampene hentet FØR koblingen fantes — som når hjemskjermen henter
    // dem selv — står de uten trener. Backfillen er idempotent og rører bare
    // kamper som mangler trener helt.
    await backfillDefaultCoaches(seasonId)
    return rows.length
  }

  // -------------------------------------------------------- Terminliste

  async function fetchTerminliste(fiksTeamId) {
    const ics = await fetchWithTimeout(
      `${FIKS_BASE}/footballapi/Calendar/GetCalendar?teamId=${encodeURIComponent(fiksTeamId)}`
    )
    return parseTerminliste(ics)
  }

  function toMatchRow(k, seasonId, cohortId) {
    return {
      cohort_id: cohortId,
      season_id: seasonId,
      match_date: k.date,
      match_time: k.time,
      home_team: k.homeTeam,
      away_team: k.awayTeam,
      venue: k.venue,
      division: k.division,
      round: k.round,
      fiks_match_id: Number(k.fiksMatchId)
    }
  }

  // Importerer kampene for lagene som har en FIKS-id. Kamper vi allerede har
  // hoppes over — knappen skal tåle å trykkes to ganger.
  //
  // `from` klipper bort fjorårets kamper: iCal-en er hele året, sesongen er
  // ikke det.
  async function importMatches(seasonId, { from = null, teams: gitteLag = null } = {}) {
    const cohort = activeCohort.value
    // Rett etter at lagene er opprettet er de kjent her, men ikke nødvendigvis
    // ferdig hentet inn i den delte lagcachen. Da bruker vi radene vi nettopp
    // fikk tilbake i stedet for å stole på en runde til basen.
    const teams = (gitteLag || seasonTeams.value).filter(t => t.fiks_team_id)
    if (!cohort?.id || !seasonId || !teams.length || !isSupabaseConfigured) return { lagt: 0, hoppet: 0 }

    working.value = true
    try {
      // Parallelt: fire lag er fire uavhengige henteoperasjoner, ikke en kø.
      const lister = await Promise.all(teams.map(t => fetchTerminliste(t.fiks_team_id)))

      // Hvilke kamper vi ALT har spørres basen om, ikke minnet. Den
      // automatiske hentingen kan kjøre før kampene er lest inn i klienten,
      // og da ville `matches.value` vært tom — insert-en hadde truffet
      // unik-indeksen og RULLET TILBAKE HELE bunten, ikke bare duplikatene.
      const { data: eksisterende } = await supabase
        .from('matches')
        .select('fiks_match_id')
        .eq('cohort_id', cohort.id)
        .not('fiks_match_id', 'is', null)
      const finnes = new Set((eksisterende || []).map(m => String(m.fiks_match_id)))
      const nye = new Map()
      for (const liste of lister) {
        for (const k of liste) {
          if (from && k.date < from) continue
          // To av våre lag kan møtes. Da står kampen i begge terminlistene,
          // og skal likevel bare inn én gang.
          if (finnes.has(k.fiksMatchId) || nye.has(k.fiksMatchId)) continue
          nye.set(k.fiksMatchId, toMatchRow(k, seasonId, cohort.id))
        }
      }

      const rader = [...nye.values()]
      if (rader.length) await bulkAddMatches(rader)
      await markSynced(teams)
      return { lagt: rader.length, hoppet: finnes.size }
    } finally {
      working.value = false
    }
  }

  async function markSynced(teams) {
    if (!isSupabaseConfigured || !teams.length) return
    await supabase
      .from('teams')
      .update({ fiks_synced_at: new Date().toISOString() })
      .in('id', teams.map(t => t.id))
  }

  // ---------------------------------------------------------- Synk

  // Hva har fotball.no endret siden sist. Returnerer differansen — den
  // SKRIVER ikke. Treneren skal se hva som flyttes før det flyttes.
  async function checkForChanges() {
    const teams = seasonTeams.value.filter(t => t.fiks_team_id)
    if (!teams.length || !isSupabaseConfigured) return null
    const lister = await Promise.all(teams.map(t => fetchTerminliste(t.fiks_team_id)))
    const hentet = []
    const sett = new Set()
    for (const liste of lister) {
      for (const k of liste) {
        if (sett.has(k.fiksMatchId)) continue
        sett.add(k.fiksMatchId)
        hentet.push(k)
      }
    }
    return diffTerminliste(matches.value, hentet)
  }

  async function applyChanges(endret) {
    if (!endret?.length || !isSupabaseConfigured) return 0
    let n = 0
    for (const e of endret) {
      const { error } = await supabase
        .from('matches')
        .update({ match_date: e.date, match_time: e.time, venue: e.venue })
        .eq('id', e.id)
      if (!error) n++
    }
    return n
  }

  return {
    searching, working,
    searchClubs, fetchClubTeams, linkClub, setBirthYear, refreshMember,
    createTeams, linkSelfToTeams, fetchTerminliste, importMatches,
    checkForChanges, applyChanges,
    ageClass, teamsForAge, shortTeamName
  }
}
