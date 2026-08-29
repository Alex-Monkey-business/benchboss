import { ref } from 'vue'
import { useAuth } from '../stores/auth'
import { localISODate } from '../lib/dateLabels'

// «Kretsen har flyttet kampen» skal appen si selv, ikke vente på at noen
// åpner Admin og trykker.
//
// REGELEN FRA useFiks GJELDER: ingenting av dette kalles fra noe som tegner.
// Sjekken kjøres ETTER at Hjem er tegnet, i en ledig stund, og én gang i
// døgnet per kull. En treg fotball.no skal aldri kunne holde igjen appen.

const endringer = ref(null)
let kjorerFor = null

function nokkel(cohortId) {
  return `bb_terminliste_sjekket_${cohortId}`
}

// Svaret lagres, ikke bare datoen. Ellers forsvant varselet i det man lastet
// Hjem på nytt samme dag: sjekken var «gjort», men resultatet bodde i minnet.
// En kamp som er flyttet står til den er ordnet.
function lest(cohortId) {
  try {
    const rå = JSON.parse(localStorage.getItem(nokkel(cohortId)) || 'null')
    return rå?.dato === localISODate() ? rå : null
  } catch {
    // Privat modus: da sjekker vi én gang per økt i stedet for én gang i
    // døgnet. Bedre enn å la være.
    return null
  }
}

// Bare det kortet viser. En hel differanse i localStorage er unødvendig vekt.
function lettvekt(diff) {
  const trim = k => ({
    fiksMatchId: k.fiksMatchId, date: k.date, time: k.time,
    homeTeam: k.homeTeam, awayTeam: k.awayTeam
  })
  return {
    endret: (diff?.endret || []).slice(0, 20).map(trim),
    nye: (diff?.nye || []).slice(0, 20).map(trim)
  }
}

function skriv(cohortId, diff) {
  try {
    localStorage.setItem(nokkel(cohortId), JSON.stringify({
      dato: localISODate(),
      diff: diff ? lettvekt(diff) : null
    }))
  } catch { /* privat modus */ }
}

function whenIdle(fn) {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: 3000 })
  else setTimeout(fn, 300)
}

export function useTerminlisteVarsel() {
  const { activeCohort, role } = useAuth()

  async function sjekk() {
    const cohort = activeCohort.value
    if (!cohort?.club_fiks_id) return
    // Foreldre kan ikke gjøre noe med en flyttet kamp, og skal ikke få et
    // varsel om noe de ikke kan handle på.
    if (role.value !== 'coach' && role.value !== 'admin') return
    if (kjorerFor === cohort.id) return

    // Sjekket i dag? Da viser vi svaret fra i dag i stedet for å spørre igjen.
    const fra = lest(cohort.id)
    if (fra) {
      endringer.value = fra.diff || null
      return
    }
    kjorerFor = cohort.id

    try {
      // Dynamisk: FIKS-koden skal ikke ligge i Hjem sin chunk.
      const { useFiks } = await import('./useFiks')
      const diff = await useFiks().checkForChanges()
      const antall = (diff?.endret?.length || 0) + (diff?.nye?.length || 0)
      const svar = antall ? diff : null
      skriv(cohort.id, svar)
      endringer.value = svar
    } catch {
      // Fotball.no svarer ikke alltid. Da er det ingen nyhet å vise, og
      // ingen feilmelding å plage noen med — dette er noe appen gjør selv.
      kjorerFor = null
    }
  }

  // Kalles fra Hjem etter første tegning.
  function sjekkNarLedig() {
    whenIdle(() => { sjekk() })
  }

  // Etter at endringene er tatt imot. Kortet skal ikke stå igjen og peke på
  // noe som alt er ordnet.
  function nullstill() {
    endringer.value = null
    const id = activeCohort.value?.id
    if (id) skriv(id, null)
  }

  // Fra Admin: det man nettopp så der er samme nyhet som Hjem viser.
  function sett(diff) {
    const antall = (diff?.endret?.length || 0) + (diff?.nye?.length || 0)
    const svar = antall ? diff : null
    endringer.value = svar
    const id = activeCohort.value?.id
    if (id) skriv(id, svar)
  }

  return { endringer, sjekkNarLedig, nullstill, sett }
}
