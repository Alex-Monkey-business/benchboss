import { ref } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { useAuth } from '../stores/auth'
import { useSeasonTeams } from './useSeasonTeams'
import { useMatches } from './useMatches'
import {
  FIKS_BASE, CLUB_SEARCH_URL, clubSearchBody, parseClubSearch, usableClub,
  parseClubTeams, parseTerminliste, diffTerminliste, parKamper, ageClass,
  teamsForAge, teamAge, genderFromCohortName, shortTeamName, spillformFraKamper
} from '../lib/fiks'
import { isOurs, teamSlugFromName } from '../lib/matchMeta'
import { slugify } from '../lib/playerList'
import { localISODate } from '../lib/dateLabels'
import { cohortFormat, formatFor, periodsFor } from '../lib/spillform'

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
      // 25 s, ikke 12: et kort søkeord treffer bredt, og fotball.no bruker
      // 6–8 sekunder på «stag» mot 0,8 på «Sportsklubben Stag». Med 12 s
      // falt de korte søkene — altså de folk faktisk skriver — ut som
      // «fikk ikke kontakt».
      const html = await fetchWithTimeout(CLUB_SEARCH_URL, {
        method: 'POST',
        // Skjemakoding er en av de tre typene nettleseren sender uten
        // preflight. Med JSON hadde søket krevd en OPTIONS-runde fotball.no
        // ikke svarer på.
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: clubSearchBody(q)
      }, 25000)
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
  // visste eksisterte ennå. Navnet utledes nå i bb_cohort_setup, av samme
  // årgang og klubb — en trener på vei gjennom veiviseren skal ikke kunne
  // skrive hva som helst i det feltet.
  //
  // Gikk gjennom en rå UPDATE fram til 30. aug. Da eide `admin_cohort_update`
  // tabellen, og en trener traff null rader UTEN å få feil: veiviseren gikk
  // videre, og guarden sendte ham tilbake hit i det uendelige. Retten ligger nå
  // i handlingen — én gang, mens kullet ennå ikke har årgang.
  async function setBirthYear(year, gender = 'G') {
    const id = activeCohort.value?.id
    if (!id) throw new Error('Fant ikke kullet ditt')
    if (!isSupabaseConfigured) return
    const format = cohortFormat(year)
    const { error } = await supabase.rpc('bb_cohort_setup', {
      p_cohort_id: id,
      p_birth_year: Number(year),
      p_gender: gender || 'G',
      p_players_on_pitch: format.players_on_pitch,
      p_period_count: format.period_count,
      p_period_minutes: format.period_minutes
    })
    if (error) throw error
  }

  // -------------------------------------------------------------- Lag

  // Lagene får kortnavnet («Grønn»), men husker hva de heter i FIKS — det er
  // det navnet som står i kampene.
  //
  // Veiviseren tåler å kjøres om igjen. Den ble kjørt om igjen — Sten satt fast
  // på siste steg, og andre forsøk er derfor det normale, ikke det sjeldne. En
  // blind insert ville truffet unik-indeksen på (cohort_id, fiks_team_id) og
  // rullet tilbake HELE bunten, ikke bare laget som fantes fra før.
  async function createTeams(fiksTeams) {
    const cohort = activeCohort.value
    if (!cohort?.id || !isSupabaseConfigured || !fiksTeams.length) return []

    const { data: fins, error: lesFeil } = await supabase
      .from('teams')
      .select('*')
      .eq('cohort_id', cohort.id)
    if (lesFeil) throw lesFeil

    // To veier til samme lag: FIKS-id-en, og navnet. Sten traff den andre —
    // «teams_cohort_id_slug_key», ikke fiks-indeksen — fordi «Grønn» sto der
    // fra forrige forsøk. Et lag satt opp for hånd har heller ingen FIKS-id,
    // og ville krasjet på nøyaktig samme måte.
    const kort = t => shortTeamName(t.name, cohort.club_name?.split(' ')[0] || '')
    const medFiks = new Map(
      (fins || []).filter(t => t.fiks_team_id != null).map(t => [Number(t.fiks_team_id), t])
    )
    const medSlug = new Map((fins || []).map(t => [t.slug, t]))
    const fraFor = new Map()
    for (const t of fiksTeams) {
      const treff = medFiks.get(Number(t.fiksId)) || medSlug.get(slugify(kort(t)))
      if (treff) fraFor.set(Number(t.fiksId), treff)
    }
    const nye = fiksTeams.filter(t => !fraFor.has(Number(t.fiksId)))

    // Laget fantes, men uten FIKS-id — satt opp for hånd før terminlista kom.
    // Da er dette øyeblikket koblingen oppstår: uten den henter aldri
    // kampimporten noe for det laget.
    const utenFiks = fiksTeams
      .map(t => [fraFor.get(Number(t.fiksId)), t])
      .filter(([rad]) => rad && rad.fiks_team_id == null)
    for (const [rad, t] of utenFiks) {
      const { data, error } = await supabase
        .from('teams')
        .update({ fiks_team_id: Number(t.fiksId), fiks_name: t.name })
        .eq('id', rad.id)
        .select('id')
      if (error) throw error
      if (!data?.length) throw new Error(`Fikk ikke koble «${rad.name}» til fotball.no`)
      rad.fiks_team_id = Number(t.fiksId)
      rad.fiks_name = t.name
    }

    let lagt = []
    if (nye.length) {
      // «Vis alle 43 lagene» kan gi to lag som begge blir «Grønn» når klubb og
      // aldersklasse er strøket — G8 Grønn og J8 Grønn. Navnet får stå likt;
      // slug-en må ikke, den er unik per kull. Siste utvei til den samme
      // krasjen, lukket her.
      const start = (fins || []).length
      const brukte = new Set((fins || []).map(t => t.slug))
      const rows = nye.map((t, i) => {
        const navn = shortTeamName(t.name, cohort.club_name?.split(' ')[0] || '')
        let slug = slugify(navn)
        let n = 2
        while (brukte.has(slug)) slug = `${slugify(navn)}-${n++}`
        brukte.add(slug)
        return {
          cohort_id: cohort.id,
          name: navn,
          slug,
          accent: accentFor(t.name, start + i),
          position: start + i,
          fiks_team_id: Number(t.fiksId),
          fiks_name: t.name
        }
      })
      const { data, error } = await supabase.from('teams').insert(rows).select()
      if (error) throw error
      lagt = data || []
    }

    await reloadTeams(cohort.id)

    // Alle lagene treneren huket av — både de som nettopp ble laget og de som
    // sto der fra i sted. Kampimporten og trenerkoblingen etterpå gjelder
    // utvalget, ikke bare det som var nytt i dette forsøket.
    const lagtMap = new Map(lagt.map(t => [Number(t.fiks_team_id), t]))
    return fiksTeams
      .map(t => lagtMap.get(Number(t.fiksId)) || fraFor.get(Number(t.fiksId)))
      .filter(Boolean)
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
    // upsert, ikke insert: én kobling som fantes fra før ville gitt 23505 på
    // HELE bunten, og da hadde de andre lagene stått uten trener. Det gjør
    // veiviseren trygg å kjøre om igjen.
    const { error } = await supabase
      .from('team_coaches')
      .upsert(rows, { onConflict: 'team_id,coach_id,season_id', ignoreDuplicates: true })
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
      const spillform = await oppdaterSpillform(lister.flat())
      return { lagt: rader.length, hoppet: finnes.size, spillform }
    } finally {
      working.value = false
    }
  }

  /**
   * Spillformen leses av banene kampene spilles på.
   *
   * Årskullet gir NFF-defaulten, og den stemmer nesten alltid. Men et lag kan
   * spille et år opp eller ned, og da er banen fasit — «Borre KG 7er B» sier
   * hva som faktisk skjer.
   *
   * Retter BARE når verdien fortsatt er defaulten. Har noen satt den bevisst
   * i Admin, skal ikke en banestreng overkjøre det.
   */
  async function oppdaterSpillform(kamper) {
    const cohort = activeCohort.value
    if (!cohort?.id || !isSupabaseConfigured) return null

    const fraFiks = spillformFraKamper(kamper)
    if (!fraFiks || fraFiks === cohort.players_on_pitch) return null

    const standard = formatFor(cohort.birth_year)
    if (standard && cohort.players_on_pitch !== standard) return null

    // `.select()` er ikke pynt: uten den kan RLS filtrere bort raden og PostgREST
    // svarer «ok» med null rader. Da rapporterte vi en spillform vi aldri skrev,
    // og veiviseren sa «Banene sier 5er, så det er satt» om et kull der ingenting
    // var satt. Spillformen er en admin-innstilling — en trener treffer null
    // rader her, og skal få vite det ved at vi ikke lover noe.
    const [period_count, period_minutes] = periodsFor(fraFiks)
    const { data, error } = await supabase
      .from('cohorts')
      .update({ players_on_pitch: fraFiks, period_count, period_minutes })
      .eq('id', cohort.id)
      .select('id')
    if (error || !data?.length) return null
    await refreshMember()
    return fraFiks
  }

  async function markSynced(teams) {
    if (!isSupabaseConfigured || !teams.length) return
    await supabase
      .from('teams')
      .update({ fiks_synced_at: new Date().toISOString() })
      .in('id', teams.map(t => t.id))
  }

  // ---------------------------------------------------------- Kobling

  // Lagene i kullet mot lagene i FIKS. Kortnavnet vårt («Grønn») er nettopp
  // det som blir igjen av FIKS-navnet («Halsen G11 Grønn») når klubb og
  // aldersklasse er strøket, så treffet er eksakt — ikke en gjetning.
  async function koblLagTilFiks() {
    const cohort = activeCohort.value
    const klubb = cohort?.club_fiks_id
    const ukoblede = seasonTeams.value.filter(t => !t.fiks_team_id)
    if (!klubb || !ukoblede.length || !isSupabaseConfigured) return 0

    const alder = ageClass(cohort.birth_year)
    const kjonn = genderFromCohortName(cohort.name)
    const alle = await fetchClubTeams(klubb)
    const iKlassen = teamsForAge(alle, alder)
      .filter(t => !kjonn || teamAge(t.name)?.gender === kjonn)

    const kort = t => shortTeamName(t.name, cohort.club_short_name || '')
    let n = 0
    for (const vårt of ukoblede) {
      const treff = iKlassen.filter(t => slugify(kort(t)) === vårt.slug)
      if (treff.length !== 1) continue
      const { error } = await supabase
        .from('teams')
        .update({ fiks_team_id: Number(treff[0].fiksId), fiks_name: treff[0].name })
        .eq('id', vårt.id)
      if (!error) n++
    }
    // Med kull-id: reloadTeams() uten den henter ingenting, og lagene ville
    // stått uten fiks_team_id i minnet rett etter at de fikk den i basen.
    if (n) { invalidateTeamCoaches(); await reloadTeams(cohort.id) }
    return n
  }

  // Hvilket av VÅRE lag hører kampen til? Vår side først: «Store Bergan
  // grønn – Halsen Rød» ville ellers blitt Grønn sin kamp, fordi
  // motstanderen har samme fargenavn som et av lagene våre.
  function lagAvKamp(x) {
    if (x.lag) return x.lag
    const vår = [x.home_team, x.away_team].find(navn => isOurs(navn))
    return vår ? teamSlugFromName(vår) : ''
  }

  // Kampene fra Excel kjenner ikke sin egen FIKS-id. Uten den kan de aldri
  // oppdatere seg selv — så første synk må la dem finne seg selv igjen.
  async function parKamperMotFiks(alleKamper) {
    const teams = seasonTeams.value.filter(t => t.fiks_team_id)
    if (!teams.length) return { hentet: [], par: [] }

    const lister = await Promise.all(teams.map(async t => {
      const liste = await fetchTerminliste(t.fiks_team_id)
      return liste.map(k => ({ ...k, lag: t.slug }))
    }))
    const hentet = [...new Map(lister.flat().map(k => [k.fiksMatchId, k])).values()]

    const idag = localISODate()
    const { par } = parKamper(alleKamper, hentet, lagAvKamp)
    for (const p of par) {
      const spilt = (alleKamper.find(m => m.id === p.id)?.match_date || '') < idag
      // En spilt kamp får BARE nøkkelen. Bane, divisjon og runde er data
      // noen har ført, og en kamp som er over skal ikke endre seg fordi
      // fotball.no skriver noe litt annet i dag.
      const felt = spilt
        ? { fiks_match_id: Number(p.fiks.fiksMatchId) }
        : {
            fiks_match_id: Number(p.fiks.fiksMatchId),
            venue: p.fiks.venue,
            division: p.fiks.division,
            round: p.fiks.round
          }
      await supabase.from('matches').update(felt).eq('id', p.id)
    }
    await markSynced(teams)
    return { hentet, par }
  }

  // ---------------------------------------------------------- Synk

  // Hva har fotball.no endret siden sist. Returnerer differansen — den
  // SKRIVER ikke. Treneren skal se hva som flyttes før det flyttes.
  // SPILTE KAMPER RØRES IKKE. Der ligger resultat, spilletid, dommer og
  // utlegg. At fotball.no i ettertid skriver et annet klokkeslett på en kamp
  // i mai er en historisk detalj, ikke noe å rette.
  function baraFramover(d) {
    const idag = localISODate()
    const framover = m => (m.match_date || m.date || '') >= idag
    return {
      nye: d.nye.filter(framover),
      // Flyttet TIL eller FRA en dato som ennå ikke er passert.
      endret: d.endret.filter(e => framover(e) || framover(e.fra || {})),
      borte: d.borte.filter(framover)
    }
  }

  async function checkForChanges() {
    const cohort = activeCohort.value
    const teams = seasonTeams.value.filter(t => t.fiks_team_id)
    if (!cohort?.id || !teams.length || !isSupabaseConfigured) return null

    const lister = await Promise.all(teams.map(t => fetchTerminliste(t.fiks_team_id)))
    const hentet = [...new Map(lister.flat().map(k => [k.fiksMatchId, k])).values()]

    // Kampene leses fra BASEN, ikke fra `matches.value`. Sjekken kjøres fra
    // Hjem, som bare har lest sesongen den viser — og en kamp som ikke er
    // lastet ville sett ut som en helt ny kamp fra fotball.no.
    const { data: alle } = await supabase
      .from('matches')
      .select('id, match_date, match_time, home_team, away_team, venue, fiks_match_id')
      .eq('cohort_id', cohort.id)

    return baraFramover(diffTerminliste(alle || [], hentet))
  }

  /**
   * Én knapp, hele jobben.
   *
   * 1. Lagene kobles til FIKS om de ikke er det.
   * 2. Kamper uten FIKS-id får den — ellers er de usynlige for synken.
   * 3. Differansen leses og RETURNERES. Ingenting flyttes før noen har sett
   *    hva som flyttes.
   */
  async function synkTerminliste() {
    const cohort = activeCohort.value
    if (!cohort?.club_fiks_id || !isSupabaseConfigured) return null

    working.value = true
    try {
      const koblet = await koblLagTilFiks()
      const teams = seasonTeams.value.filter(t => t.fiks_team_id)
      if (!teams.length) return { ingenLag: true, koblet }

      // Kampene leses fra basen, ikke fra minnet: synken kan kjøre på en
      // flate som viser én sesong mens kullet har flere.
      const { data: alle } = await supabase
        .from('matches')
        .select('id, match_date, match_time, home_team, away_team, division, round, venue, fiks_match_id, season_id')
        .eq('cohort_id', cohort.id)

      const { hentet, par } = await parKamperMotFiks(alle || [])

      // Radene vi nettopp ga en FIKS-id må se ut som om de har den, ellers
      // melder differansen dem som nye.
      const oppdatert = (alle || []).map(m => {
        const p = par.find(x => x.id === m.id)
        return p ? { ...m, fiks_match_id: Number(p.fiks.fiksMatchId), venue: p.fiks.venue } : m
      })

      const spillform = await oppdaterSpillform(hentet)
      return { ...baraFramover(diffTerminliste(oppdatert, hentet)), parret: par.length, koblet, spillform }
    } finally {
      working.value = false
    }
  }

  // Kamper fotball.no har som vi ikke har.
  //
  // Sesongen tas fra kampen som ligger NÆRMEST I TID, ikke fra den man ser
  // på: Halsen har vinter, vår og høst i samme kull, og en ny februarkamp
  // som havner i høstsesongen er verre enn ingen kamp.
  async function leggTilNye(nye, fallbackSeason = null) {
    const cohort = activeCohort.value
    if (!nye?.length || !cohort?.id || !isSupabaseConfigured) return 0

    const { data: kjente } = await supabase
      .from('matches')
      .select('match_date, season_id')
      .eq('cohort_id', cohort.id)
      .not('season_id', 'is', null)

    const sesongFor = dato => {
      let best = fallbackSeason
      let minst = Infinity
      for (const m of kjente || []) {
        const avstand = Math.abs(new Date(m.match_date) - new Date(dato))
        if (avstand < minst) { minst = avstand; best = m.season_id }
      }
      return best
    }

    const rader = nye
      .map(k => ({ k, season: sesongFor(k.date) }))
      .filter(x => x.season)
      .map(x => toMatchRow(x.k, x.season, cohort.id))
    if (!rader.length) return 0

    await bulkAddMatches(rader)
    for (const season of new Set(rader.map(r => r.season_id))) {
      await backfillDefaultCoaches(season)
    }
    return rader.length
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
    koblLagTilFiks, parKamperMotFiks, synkTerminliste, oppdaterSpillform,
    checkForChanges, applyChanges, leggTilNye,
    ageClass, teamsForAge, shortTeamName
  }
}
