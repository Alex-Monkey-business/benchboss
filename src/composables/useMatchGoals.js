import { ref, computed } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { registerReset } from '../stores/dataReset'
import { scoped } from '../lib/scope'
import { cached } from '../lib/query'
import { legg, trekk, poster, utforer, paSvar, nyId } from '../lib/kampKo'
import { useToast } from './useToast'

const goals = ref([])
const loadedAll = ref(false)
const loadedMatches = ref(new Set())

registerReset(() => { goals.value = []; loadedAll.value = false; loadedMatches.value = new Set() })

// Scorers for the two played demo matches. The totals match the results on
// DEMO_MATCHES — dm-1 was 3–1 and dm-2 was 2–2 — so the 5 goals here add up to
// the "Mål: 5 – 3" the Statistikk header already claimed. Without them the
// toppscorer list sat in an empty state next to a scoreline that said 5 goals.
const DEMO_GOALS = [
  // dm-1 · Halsen Rød 3–1 Sem Gul
  { id: 'dg-1', match_id: 'dm-1', player_id: 'p-1',  position: 0, clock_seconds: 8 * 60 },      // Lukas
  { id: 'dg-2', match_id: 'dm-1', player_id: 'p-18', position: 1, clock_seconds: 24 * 60 },     // Erik, inn som lånespiller
  { id: 'dg-3', match_id: 'dm-1', player_id: 'p-1',  position: 2, clock_seconds: 41 * 60 },     // Lukas igjen
  // dm-2 · Halsen Grønn 2–2 Borre sort
  { id: 'dg-4', match_id: 'dm-2', player_id: 'p-17', position: 0, clock_seconds: 12 * 60 },     // Kasper
  { id: 'dg-5', match_id: 'dm-2', player_id: 'p-12', position: 1, clock_seconds: 37 * 60 },     // Liam
]

// ── Kø ──────────────────────────────────────────────────────────────────────
// Scorere føres optimistisk og sendes gjennom kampkøen (lib/kampKo.js), så et
// mål ført uten nett står på skjermen og kommer fram når nettet gjør det.
// Raden settes inn med id-en telefonen laget: et nytt forsøk etter et svar
// som ble borte, gir «finnes allerede», og det regnes som lagret.
function feil(error, status) {
  return Object.assign(error || new Error('Fikk ikke lagret'), { status })
}

utforer('scorer', async (rad) => {
  const { data, error, status } = await supabase.from('match_goals').insert(rad).select().single()
  if (error?.code === '23505') return rad
  if (error) throw feil(error, status)
  return data
})

utforer('fjernScorer', async ({ id }) => {
  // Null rader er også riktig: et tidligere forsøk slettet den.
  const { error, status } = await supabase.from('match_goals').delete().eq('id', id).select('id')
  if (error) throw feil(error, status)
  return { id }
})

paSvar((post, svar, e) => {
  if (post.type === 'scorer') {
    if (e) {
      goals.value = goals.value.filter(g => g.id !== post.args.id)
      useToast().show('Fikk ikke lagret målet. Prøv igjen.', 'error')
    } else if (svar) {
      const i = goals.value.findIndex(g => g.id === svar.id)
      if (i > -1) goals.value[i] = { ...goals.value[i], ...svar }
    }
  } else if (post.type === 'fjernScorer' && e) {
    useToast().show('Fikk ikke fjernet målet. Prøv igjen.', 'error')
  }
})

// Serverens rader + det som venter i køen. Uten dette forsvant et mål ført
// uten nett ved neste henting, og kom tilbake når køen ble tømt.
export function medVentendeMal(matchId, rader) {
  const ko = poster(matchId)
  if (!ko.length) return rader
  const fjernet = new Set(ko.filter(p => p.type === 'fjernScorer').map(p => p.args.id))
  const har = new Set(rader.map(g => g.id))
  const nye = ko.filter(p => p.type === 'scorer' && !har.has(p.args.id) && !fjernet.has(p.args.id)).map(p => p.args)
  return rader.filter(g => !fjernet.has(g.id)).concat(nye)
}

// Alle målene i KULLET (før: alle mål RLS slapp gjennom, på tvers av kull),
// bare kolonnene statistikken leser. Ferskt i 30 s — før ble de hentet én
// gang per app-levetid, så et mål ført på en annen telefon kom aldri med.
const alleMalFersk = cached(async () => {
  const { data, error } = await scoped(supabase
    .from('match_goals')
    .select('id, match_id, player_id, position, clock_seconds'))
    .order('position')
  if (!error && data) {
    const ventende = [...new Set(poster().map(p => p.matchId))]
    goals.value = ventende.reduce((acc, mid) => acc.filter(g => g.match_id !== mid).concat(medVentendeMal(mid, acc.filter(g => g.match_id === mid))), data)
    loadedAll.value = true
  }
  return !error
}, 'goals', { ok: v => v === true })

export function useMatchGoals() {
  async function fetchMatchGoals(matchId) {
    if (!isSupabaseConfigured) {
      // Demo: seed hele settet første gang. Uten dette filtrerte kampdetalj
      // mot en tom liste og sto alltid med «Ingen scorere registrert», mens
      // Statistikk viste de samme fem målene — den lastes via fetchAllGoals.
      if (!loadedAll.value) {
        goals.value = [...DEMO_GOALS]
        loadedAll.value = true
      }
      return goals.value.filter(g => g.match_id === matchId)
    }

    const { data, error } = await supabase
      .from('match_goals')
      .select('*')
      .eq('match_id', matchId)
      .order('position')
      .order('created_at')

    if (!error && data) {
      goals.value = goals.value.filter(g => g.match_id !== matchId).concat(medVentendeMal(matchId, data))
      loadedMatches.value.add(matchId)
    }
    return goals.value.filter(g => g.match_id === matchId)
  }

  async function fetchAllGoals() {
    if (!isSupabaseConfigured) {
      if (!loadedAll.value) goals.value = [...DEMO_GOALS]
      loadedAll.value = true
      return goals.value
    }
    await alleMalFersk()
    return goals.value
  }

  function getGoalsForMatch(matchId) {
    return goals.value
      .filter(g => g.match_id === matchId)
      .sort((a, b) => a.position - b.position)
  }

  // Optimistisk og gjennom kampkøen: målet står i lista med en gang, også
  // uten nett. Feiler lagringen for godt (ikke nettet, men et nei fra basen),
  // tas det ut igjen og treneren får beskjed — det svelges aldri.
  async function addGoal(matchId, { player_id, clock_seconds = null }) {
    if (!matchId || !player_id) throw new Error('Mangler kamp eller spiller')
    const existing = goals.value.filter(g => g.match_id === matchId)
    const nextPosition = existing.length === 0
      ? 0
      : Math.max(...existing.map(g => g.position)) + 1

    if (!isSupabaseConfigured) {
      const newGoal = {
        id: 'mg-' + Date.now(),
        match_id: matchId,
        player_id,
        position: nextPosition,
        clock_seconds
      }
      goals.value.push(newGoal)
      return newGoal
    }

    const rad = { id: nyId(), match_id: matchId, player_id, position: nextPosition, clock_seconds }
    goals.value.push({ ...rad })
    legg('scorer', matchId, rad, rad.id)
    return rad
  }

  async function updateGoal(goalId, updates) {
    if (!isSupabaseConfigured) {
      const idx = goals.value.findIndex(g => g.id === goalId)
      if (idx > -1) Object.assign(goals.value[idx], updates)
      return goals.value[idx]
    }

    const { data, error } = await supabase
      .from('match_goals')
      .update(updates)
      .eq('id', goalId)
      .select()
      .single()

    if (!error && data) {
      const idx = goals.value.findIndex(g => g.id === goalId)
      if (idx > -1) goals.value[idx] = data
    }
    return data
  }

  async function removeGoal(goalId) {
    const goal = goals.value.find(g => g.id === goalId)
    goals.value = goals.value.filter(g => g.id !== goalId)
    if (!isSupabaseConfigured) return
    // Ikke sendt ennå: da er det nok å ta den ut av køen.
    if (trekk(goalId)) return
    legg('fjernScorer', goal?.match_id || null, { id: goalId })
  }

  const goalsByPlayer = computed(() => {
    const counts = new Map()
    goals.value.forEach(g => {
      counts.set(g.player_id, (counts.get(g.player_id) || 0) + 1)
    })
    return counts
  })

  return {
    goals,
    fetchMatchGoals,
    fetchAllGoals,
    getGoalsForMatch,
    addGoal,
    updateGoal,
    removeGoal,
    goalsByPlayer
  }
}
