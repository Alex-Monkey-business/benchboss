import { ref, watch } from 'vue'
import { cohortId } from '../lib/scope'

// Hva treneren har gjort med gruppene i dag: hvem som ikke er her, og per
// øvelse frøet, antallet hvis det er overstyrt, og byttene.
//
// Fraværet gjelder hele treninga — melder du Ola borte på første øvelse, er
// han borte på alle. Resten gjelder øvelsen. Ingenting av det går til basen:
// det er dagens notat, ikke et oppmøteregister, og i morgen er det borte.
//
// Lagres i telefonen så en låst skjerm eller en drept app ikke nullstiller
// treninga midt i.

const NOKKEL = 'bb_grupper'

function idag() {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function tom() {
  return { dato: idag(), kull: cohortId() || null, dager: {} }
}

function les() {
  try {
    const raw = localStorage.getItem(NOKKEL)
    if (!raw) return tom()
    const d = JSON.parse(raw)
    if (d?.dato !== idag() || d?.kull !== (cohortId() || null) || typeof d.dager !== 'object') return tom()
    return d
  } catch {
    return tom()
  }
}

const tilstand = ref(les())

watch(tilstand, v => {
  try { localStorage.setItem(NOKKEL, JSON.stringify(v)) } catch { /* privat modus: lev uten */ }
}, { deep: true })

// Ny dag eller nytt kull siden sist: start blankt.
function fersk() {
  if (tilstand.value.dato !== idag() || tilstand.value.kull !== (cohortId() || null)) tilstand.value = tom()
}

function dag(sessionId) {
  fersk()
  const d = tilstand.value.dager
  if (!d[sessionId]) d[sessionId] = { fravar: [], ovelser: {} }
  return d[sessionId]
}

function ovelse(sessionId, nokkel) {
  const o = dag(sessionId).ovelser
  if (!o[nokkel]) o[nokkel] = { seed: 1, antall: null, bytter: [] }
  return o[nokkel]
}

export function useTreningsGrupper() {
  return {
    fravar: sessionId => dag(sessionId).fravar,
    ovelse,
    settBorte(sessionId, spillerId) {
      const f = dag(sessionId).fravar
      if (!f.includes(spillerId)) f.push(spillerId)
    },
    settTilStede(sessionId, spillerId) {
      const d = dag(sessionId)
      d.fravar = d.fravar.filter(x => x !== spillerId)
    },
    bytt(sessionId, nokkel, a, b) {
      ovelse(sessionId, nokkel).bytter.push([a, b])
    },
    bland(sessionId, nokkel) {
      const o = ovelse(sessionId, nokkel)
      o.seed = (o.seed % 100000) + 1
      o.bytter = []
    },
    settAntall(sessionId, nokkel, n) {
      const o = ovelse(sessionId, nokkel)
      o.antall = n
      // Byttene var gjort i en annen fordeling og gir ikke mening i den nye.
      o.bytter = []
    }
  }
}
