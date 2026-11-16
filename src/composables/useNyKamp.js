import { useAuth } from '../stores/auth'
import { useMatches } from './useMatches'
import { isOurs, teamSlugFromName } from '../lib/matchMeta'
import { isSupabaseConfigured } from '../supabase'

// «+ Kamp» fra kamplista. Treningskamper og vinterserie ligger ikke i FIKS,
// så de legges inn for hånd her.

export const KAMPTYPER = [
  { verdi: 'treningskamp', navn: 'Treningskamp' },
  { verdi: 'vinterserie', navn: 'Vinterserie' },
  { verdi: 'serie', navn: 'Serie' }
]

function norm(s) {
  return (s || '').toLowerCase().replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/å/g, 'a')
}

export function useNyKamp() {
  const { activeCohort } = useAuth()
  const { addMatch } = useMatches()

  function klubbNavn() {
    const c = activeCohort.value
    return c?.club_short_name || c?.club_name?.split(' ')[0] || ''
  }

  // Lagnavnet slik matchMeta kjenner det igjen: klubbens kortnavn må stå i
  // strengen (isOurs), og lagets navn eller FIKS-navn må treffe
  // (teamSlugFromName). FIKS-navnet først — det er strengen serien bruker.
  function vartLagNavn(lag) {
    const klubb = klubbNavn()
    if (!lag) return klubb
    if (lag.fiks_name && isOurs(lag.fiks_name) && teamSlugFromName(lag.fiks_name) === lag.slug) {
      return lag.fiks_name
    }
    const kandidat = norm(lag.name).includes(norm(klubb)) ? lag.name : `${klubb} ${lag.name}`.trim()
    if (teamSlugFromName(kandidat) === lag.slug) return kandidat
    return `${klubb} ${lag.slug}`.trim()
  }

  // Typen står i `kind`, og for treningskamp/vinterserie også i
  // avdelingsfeltet — det er det kamplista og Excel-eksporten viser i dag.
  async function leggTilKamp({ seasonId, lag, motstander, hjemme, dato, tid, type }) {
    const vart = vartLagNavn(lag)
    const navn = KAMPTYPER.find(t => t.verdi === type)?.navn || ''
    const rad = {
      season_id: seasonId,
      match_date: dato,
      match_time: tid || null,
      match_day: new Date(dato + 'T12:00:00').toLocaleDateString('nb-NO', { weekday: 'long' }),
      home_team: hjemme ? vart : motstander.trim(),
      away_team: hjemme ? motstander.trim() : vart,
      division: type === 'serie' ? null : navn,
      fee_amount: type === 'treningskamp' ? 0 : 200
    }

    // addMatch legger kampen i lista og setter standardtrenere. Den svelger
    // feilen og gir null — da prøver vi én gang til uten `kind`, som er det
    // som feiler før migrasjonen er kjørt. En insert som feilet har ikke
    // skrevet noe, så det blir aldri to kamper.
    const medType = await addMatch({ ...rad, kind: type })
    if (medType) return medType
    if (!isSupabaseConfigured) return null
    return addMatch(rad)
  }

  return { leggTilKamp, vartLagNavn }
}
