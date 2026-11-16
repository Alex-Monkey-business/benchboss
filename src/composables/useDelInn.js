import { ref } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { registerReset } from '../stores/dataReset'
import { scoped, cohortId } from '../lib/scope'
import { datoFor } from './useTreningsOkt'

// Dagens Del inn, delt mellom trenerne: det én teller opp og deler inn, står
// hos de andre innen noen sekunder. Samme mønster som økta — ingen websocket,
// men en henting hvert fjerde sekund mens skjermen er åpen og synlig.
//
// Skrivingen er optimistisk og sender hele raden. To trenere som endrer
// samtidig: den siste vinner. På feltet er det godt nok — de står ved siden
// av hverandre.

const dag = ref(null) // { dato, spillere, trenere, valg, endret_av, endret_navn, endret_at } | null
const lastet = ref(false)
let timer = null
let underveis = 0
let folgere = 0

registerReset(() => { dag.value = null; lastet.value = false })

const UTVALG = 'dato, spillere, trenere, gjester, valg, endret_av, endret_navn, endret_at'

async function hent() {
  if (!isSupabaseConfigured || !cohortId()) { lastet.value = true; return dag.value }
  const dato = datoFor()
  const { data, error } = await scoped(supabase.from('del_inn').select(UTVALG)).eq('dato', dato).maybeSingle()
  if (underveis) return dag.value
  if (!error) dag.value = data || null
  lastet.value = true
  return dag.value
}

function påSynlig() {
  if (document.visibilityState === 'visible') hent()
}

// endring: et utsnitt av raden. Resten tas fra det vi har.
async function lagre(endring, hvem) {
  const dato = datoFor()
  const signatur = {
    endret_av: hvem?.id || null,
    endret_navn: hvem?.name || null,
    endret_at: new Date().toISOString()
  }
  dag.value = {
    dato,
    spillere: null,
    trenere: null,
    gjester: [],
    valg: {},
    ...(dag.value?.dato === dato ? dag.value : {}),
    ...endring,
    ...signatur
  }
  if (!isSupabaseConfigured || !cohortId()) return true
  underveis++
  try {
    // Bare kolonnene som endret seg: en annen trener som nettopp telte opp,
    // skal ikke få oppmøtet sitt skrevet over av at du byttet til Lag.
    const { error } = await supabase.from('del_inn')
      .upsert({ cohort_id: cohortId(), dato, ...endring, ...signatur }, { onConflict: 'cohort_id,dato' })
      .select('dato')
    if (error) console.warn('Del inn: lagring feilet', error.message)
    return !error
  } finally {
    underveis--
    if (!underveis) hent()
  }
}

async function nullstill() {
  const dato = datoFor()
  dag.value = null
  if (!isSupabaseConfigured || !cohortId()) return true
  underveis++
  try {
    const { error } = await scoped(supabase.from('del_inn').delete().select('dato')).eq('dato', dato)
    if (error) console.warn('Del inn: nullstilling feilet', error.message)
    return !error
  } finally {
    underveis--
    if (!underveis) hent()
  }
}

export function useDelInn() {
  return {
    dag,
    lastet,
    hent,
    lagre,
    nullstill,
    // Følg dagens Del inn mens skjermen er åpen. Returnerer stopp.
    folg() {
      folgere++
      hent()
      if (!timer) {
        timer = setInterval(() => { if (document.visibilityState === 'visible') hent() }, 4000)
        document.addEventListener('visibilitychange', påSynlig)
      }
      return () => {
        folgere = Math.max(0, folgere - 1)
        if (folgere) return
        clearInterval(timer)
        timer = null
        document.removeEventListener('visibilitychange', påSynlig)
      }
    }
  }
}
