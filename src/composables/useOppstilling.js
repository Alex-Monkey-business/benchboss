import { ref } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { scoped } from '../lib/scope'
import { registerReset } from '../stores/dataReset'
import { persistRef } from '../lib/persist'

// Trenernes justeringer av lagene på banen: { teamId: { spillform: { slot: spillerId } } }.
//
// Hentes for seg, ikke i lagspørringen i useSeasonTeams: feiler denne (eller
// mangler kolonnen), skal lagene og resten av appen stå som før. Banen
// plasserer da alle automatisk, og bare lagringen av en justering sier fra.

// Huskes mellom oppstarter: kampsida viser laget slik appen plasserer det, og
// uten justeringene i første bilde hoppet spillerne på plass etter hentingen.
const oppstilling = persistRef('lagOppstilling', ref({}))
let hentet = false
let pagar = null

registerReset(() => { oppstilling.value = {}; hentet = false; pagar = null })

export function useOppstilling() {
  function hent({ tving = false } = {}) {
    if (!isSupabaseConfigured) return Promise.resolve()
    if (hentet && !tving) return Promise.resolve()
    if (pagar) return pagar
    pagar = (async () => {
      const { data, error } = await scoped(supabase.from('teams').select('id, oppstilling'))
      pagar = null
      if (error) return
      oppstilling.value = Object.fromEntries((data || []).map(r => [r.id, r.oppstilling || {}]))
      hentet = true
    })()
    return pagar
  }

  function laste(teamId, spillform) {
    return oppstilling.value[teamId]?.[spillform] || {}
  }

  // plasser = hele laget slik det skal stå, eller {} for å la appen plassere.
  // Feiler lagringen, settes den gamle tilbake. Returnerer true/false.
  async function lagre(teamId, spillform, plasser) {
    const for_ = oppstilling.value[teamId] || {}
    const ny = { ...for_, [spillform]: plasser }
    if (!Object.keys(plasser).length) delete ny[spillform]
    oppstilling.value = { ...oppstilling.value, [teamId]: ny }
    if (!isSupabaseConfigured) return true
    const { data, error } = await supabase.from('teams').update({ oppstilling: ny }).eq('id', teamId).select('id')
    if (error || !data?.length) {
      oppstilling.value = { ...oppstilling.value, [teamId]: for_ }
      return false
    }
    return true
  }

  return { oppstilling, hent, laste, lagre }
}
