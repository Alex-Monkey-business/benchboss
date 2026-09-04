import { useAuth } from '../stores/auth'

// Kull-skopet for spørringer og innsettinger.
//
// Rottabellene (players, seasons, referees, cups, training_sessions, coaches)
// har ingen forelder å arve cohort_id fra. Så lenge det fantes ett kull fylte
// bb_cohort_root den inn selv; med to nekter triggeren — med rette, for da
// ville raden landet i feil kull. Klienten må si hvilket kull den snakker om.
//
// Barnerader (match_players, expenses, …) arver fra forelderen via trigger og
// trenger ikke dette. RLS er den egentlige grensen; filtrene her finnes for at
// en som er medlem av flere kull (plattform-admin) ser det AKTIVE, ikke alle.

export function cohortId() {
  return useAuth().activeCohort.value?.id || null
}

export function clubId() {
  return useAuth().activeCohort.value?.club_id || null
}

// `.eq('cohort_id', …)` på en spørring — eller urørt når kullet er ukjent, så
// RLS alene avgjør (demo, legacy). Aldri `.eq('cohort_id', undefined)`: det
// blir `cohort_id=eq.undefined` på REST og en feil, ikke et tomt svar.
export function scoped(builder) {
  const id = cohortId()
  return id ? builder.eq('cohort_id', id) : builder
}

export function clubScoped(builder) {
  const id = clubId()
  return id ? builder.eq('club_id', id) : builder
}

export function withCohort(row) {
  const id = cohortId()
  return id ? { cohort_id: id, ...row } : row
}

export function withClub(row) {
  const id = clubId()
  return id ? { club_id: id, ...row } : row
}
