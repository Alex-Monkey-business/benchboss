import { ref } from 'vue'
import { supabase } from '../supabase'
import { scoped } from './scope'
import { cached } from './query'
import { persistRef } from './persist'
import { registerReset } from '../stores/dataReset'

// Radene i en kamp-barnetabell (mål, perioder, frafall, sesjoner) for ÉN sesong.
//
// Før hentet Statistikk og spillersida alle radene i kullet, på tvers av alle
// sesonger, og filtrerte i nettleseren. Med tre sesonger ble to tredeler
// kastet, og andelen vokser for hver sesong. Tabellene har ingen season_id
// selv, så grensen går via kampen (inner join).
//
// Fremmednøkkelen må navngis: kullsperren la til en nummer to mellom de samme
// tabellene (match_id, cohort_id), og uten hint svarer PostgREST med PGRST201.
//
// `ta(rader, kampIder)` fletter svaret inn i den delte lista. Flett, ikke
// erstatt: kampsida og kampmodus legger sine egne kamper i samme liste, og
// andre sesonger som alt er hentet skal bli stående. `kampIder` er kampene
// svaret gjelder: de som har rader nå, og de som hadde det forrige gang (en
// rad slettet på en annen telefon skal bort her også).
//
// Radene selv huskes mellom oppstarter (persistRef i hver composable), og da
// må også dette kartet det: ellers ble en rad slettet på en annen telefon
// stående etter en omstart. `henter.kjent(sesong)` sier om sesongen er hentet
// før, så en skjerm kan vise tallene fra sist i stedet for «Henter …».
export function sesongHenter(tabell, kolonner, navn, ta) {
  const forrige = persistRef(`sesong:${navn}`, ref({})) // seasonId → [match_id]
  registerReset(() => { forrige.value = {} })
  const henter = cached(async (seasonId) => {
    if (!seasonId) return false
    const { data, error } = await scoped(supabase.from(tabell)
      .select(`${kolonner}, matches!${tabell}_match_id_fkey!inner(season_id)`))
      .eq('matches.season_id', seasonId)
    if (error || !data) {
      if (error) console.warn('[query]', navn, error.code || '', error.message)
      return false
    }
    const rader = data.map(({ matches, ...r }) => r)
    const naa = new Set(rader.map(r => r.match_id))
    const kampIder = new Set([...naa, ...(forrige.value[seasonId] || [])])
    ta(rader, kampIder)
    forrige.value = { ...forrige.value, [seasonId]: [...naa] }
    return true
  }, navn, { ok: v => v === true })
  henter.kjent = seasonId => !!seasonId && !!forrige.value[seasonId]
  return henter
}

// Bytt ut radene for `kampIder` med de nye, la resten stå.
export function flett(gamle, rader, kampIder) {
  return gamle.filter(r => !kampIder.has(r.match_id)).concat(rader)
}
