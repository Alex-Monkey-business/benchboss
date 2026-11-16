import { ref } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { registerReset } from '../stores/dataReset'
import { scoped, cohortId } from '../lib/scope'
import { datoFor } from './useTreningsOkt'

// Dagens Del inn, delt mellom trenerne: det én teller opp og deler inn, står
// hos de andre innen noen sekunder. Ingen websocket, men en henting hvert
// fjerde sekund mens skjermen er åpen og synlig.
//
// To trenere som trykker samtidig skal ikke viske ut hverandre. Derfor er
// hver endring en funksjon av raden (endre), ikke en ferdig rad: rett før
// lagring hentes den ferske raden fra basen, og endringen legges oppå den.
// Ett fravær, én gjest, ett valg om gangen — ikke hele lista fra telefonen.

const dag = ref(null) // { dato, spillere, trenere, gjester, valg, endret_av, endret_navn, endret_at } | null
const lastet = ref(false)
let timer = null
let underveis = 0
// Øker ved hver skriving. En henting som startet før en skriving, kan komme
// tilbake etter at skrivingen er ferdig — med raden fra før. Den kastes.
let skriving = 0
// Nummeret på siste påbegynte endring. Et svar fra en eldre endring skal ikke
// legge seg over en nyere som alt står på skjermen.
let sisteEndring = 0
let folgere = 0

registerReset(() => { dag.value = null; lastet.value = false })

const UTVALG = 'dato, spillere, trenere, gjester, valg, endret_av, endret_navn, endret_at'
const TOM = dato => ({ dato, spillere: null, trenere: null, gjester: [], valg: {} })

async function lesRad(dato) {
  return scoped(supabase.from('del_inn').select(UTVALG)).eq('dato', dato).maybeSingle()
}

async function hent() {
  if (!isSupabaseConfigured || !cohortId()) { lastet.value = true; return dag.value }
  const dato = datoFor()
  const start = skriving
  const { data, error } = await lesRad(dato)
  if (underveis || start !== skriving) return dag.value
  if (!error) dag.value = data || null
  lastet.value = true
  return dag.value
}

function påSynlig() {
  if (document.visibilityState === 'visible') hent()
}

// fn(rad) → utsnitt av raden som skal endres. Kjøres først på det vi har (så
// skjermen svarer med en gang), så på den ferske raden fra basen.
async function endre(fn, hvem) {
  const dato = datoFor()
  const signatur = {
    endret_av: hvem?.id || null,
    endret_navn: hvem?.name || null,
    endret_at: new Date().toISOString()
  }
  const lokal = dag.value?.dato === dato ? dag.value : TOM(dato)
  dag.value = { ...TOM(dato), ...lokal, ...fn(lokal), ...signatur }
  if (!isSupabaseConfigured || !cohortId()) return true
  const nr = ++sisteEndring
  skriving++
  underveis++
  try {
    const { data: fersk, error: lesFeil } = await lesRad(dato)
    if (lesFeil) throw lesFeil
    const grunn = { ...TOM(dato), ...(fersk || {}) }
    const utsnitt = fn(grunn)
    const { error } = await supabase.from('del_inn')
      .upsert({ cohort_id: cohortId(), dato, ...utsnitt, ...signatur }, { onConflict: 'cohort_id,dato' })
      .select('dato')
    if (error) throw error
    if (nr === sisteEndring) dag.value = { ...grunn, ...utsnitt, ...signatur }
    return true
  } catch (e) {
    console.warn('Del inn: lagring feilet', e?.message)
    return false
  } finally {
    underveis--
    skriving++
    if (!underveis) hent()
  }
}

async function nullstill() {
  const dato = datoFor()
  dag.value = null
  if (!isSupabaseConfigured || !cohortId()) return true
  skriving++
  underveis++
  try {
    const { error } = await scoped(supabase.from('del_inn').delete().select('dato')).eq('dato', dato)
    if (error) console.warn('Del inn: nullstilling feilet', error.message)
    return !error
  } finally {
    underveis--
    skriving++
    if (!underveis) hent()
  }
}

export function useDelInn() {
  return {
    dag,
    lastet,
    hent,
    endre,
    nullstill,
    // Følg dagens Del inn mens skjermen er åpen. Returnerer stopp.
    folg() {
      // Ny visning: ikke «klar» før dagens rad er hentet. Ligger det en rad
      // fra en annen dag igjen (appen sto åpen over natta), er den borte.
      if (!folgere) lastet.value = false
      if (dag.value && dag.value.dato !== datoFor()) dag.value = null
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
