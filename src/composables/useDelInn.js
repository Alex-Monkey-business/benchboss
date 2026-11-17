import { ref, watch } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { registerReset } from '../stores/dataReset'
import { scoped, cohortId } from '../lib/scope'
import { persistRef } from '../lib/persist'
import { folgMed, raskIgjen } from '../lib/poll'
import { datoFor } from './useTreningsOkt'

// Dagens Del inn, delt mellom trenerne: det én teller opp og deler inn, står
// hos de andre innen noen sekunder. Ingen websocket, men en henting hvert
// fjerde sekund mens skjermen er åpen og synlig (lib/poll — roligere når
// ingenting skjer, rask igjen ved første endring).
//
// Dagens rad lagres på telefonen med datoen. Åpnes Del inn igjen samme dag,
// står den der med en gang og ferskes i bakgrunnen — ikke «Laster …» hver gang.
//
// To trenere som trykker samtidig skal ikke viske ut hverandre. Derfor er
// hver endring en funksjon av raden (endre), ikke en ferdig rad: rett før
// lagring hentes den ferske raden fra basen, og endringen legges oppå den.
// Ett fravær, én gjest, ett valg om gangen — ikke hele lista fra telefonen.

const dag = ref(null) // { dato, spillere, trenere, gjester, valg, endret_av, endret_navn, endret_at } | null
const lastet = ref(false)
// Raden er hentet fra basen i denne visningen (ikke bare lest fra telefonen).
const fersk = ref(false)
let underveis = 0
// Øker ved hver skriving. En henting som startet før en skriving, kan komme
// tilbake etter at skrivingen er ferdig — med raden fra før. Den kastes.
let skriving = 0
// Nummeret på siste påbegynte endring. Et svar fra en eldre endring skal ikke
// legge seg over en nyere som alt står på skjermen.
let sisteEndring = 0
let folgere = 0
let stoppPoll = null
// Dagen `lastet` gjelder for — en tom dag i går er ikke en tom dag i dag.
let lastetDato = null
// { dato, rad } — dagens rad slik den sist ble sett (null = ingen rad i dag).
const lagret = persistRef('delInnIdag', ref(null))

registerReset(() => { dag.value = null; lastet.value = false; lagret.value = null })

// Det skjermen viser, er det telefonen husker til neste åpning.
watch([dag, lastet], ([d, l]) => {
  if (!l) return
  const dato = datoFor()
  if (d && d.dato !== dato) return
  lagret.value = { dato, rad: d || null }
}, { deep: true })

const UTVALG = 'dato, spillere, trenere, gjester, valg, endret_av, endret_navn, endret_at'
const TOM = dato => ({ dato, spillere: null, trenere: null, gjester: [], valg: {} })

async function lesRad(dato) {
  return scoped(supabase.from('del_inn').select(UTVALG)).eq('dato', dato).maybeSingle()
}

async function hent() {
  if (!isSupabaseConfigured || !cohortId()) { lastet.value = true; fersk.value = true; lastetDato = datoFor(); return dag.value }
  const dato = datoFor()
  const start = skriving
  const { data, error } = await lesRad(dato)
  if (underveis || start !== skriving) return dag.value
  if (!error) { dag.value = data || null; fersk.value = true }
  lastet.value = true
  lastetDato = dato
  return dag.value
}

// For lib/poll: true når raden endret seg siden sist.
async function hentForPoll() {
  const for_ = JSON.stringify(dag.value)
  await hent()
  return JSON.stringify(dag.value) !== for_
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
  raskIgjen()
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
  raskIgjen()
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
    fersk,
    hent,
    endre,
    nullstill,
    // Følg dagens Del inn mens skjermen er åpen. Returnerer stopp.
    folg() {
      const dato = datoFor()
      // Ligger det en rad fra en annen dag igjen (appen sto åpen over natta),
      // er den borte.
      if ((dag.value && dag.value.dato !== dato) || (lastet.value && lastetDato !== dato)) { dag.value = null; lastet.value = false }
      // Ny visning: «klar» med en gang hvis vi har dagens rad — i minnet eller
      // fra forrige åpning i dag. Ellers ikke før den er hentet.
      if (!folgere) fersk.value = false
      if (!folgere && !lastet.value) {
        if (lagret.value?.dato === dato) {
          dag.value = lagret.value.rad
          lastet.value = true
          lastetDato = dato
        }
      }
      folgere++
      hent()
      if (!stoppPoll) stoppPoll = folgMed('delInn', hentForPoll)
      return () => {
        folgere = Math.max(0, folgere - 1)
        if (folgere) return
        stoppPoll?.()
        stoppPoll = null
      }
    }
  }
}
