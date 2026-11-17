import { ref } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { registerReset } from '../stores/dataReset'
import { persistRef } from '../lib/persist'
import { cached } from '../lib/query'

const expenses = persistRef('expenses', ref([]))

registerReset(() => { expenses.value = [] })

// Utleggene for kampene i en sesong kommer nå med kamphentingen (useMatches,
// én rundtur). Da er en egen henting for de samme kampene rett etterpå bare
// en ekstra runde — den hoppes over så lenge svaret er ferskt.
const nokkel = ids => [...ids].sort().join(',')

async function hentUtleggDb(ids) {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .in('match_id', ids.split(','))
  if (!error && data) expenses.value = data
  return !error
}
const utleggFersk = cached(hentUtleggDb, 'expenses', { ok: v => v === true, enPlass: true })

export function settUtlegg(rows, matchIds) {
  if (!isSupabaseConfigured) return
  expenses.value = rows
  utleggFersk.mark(nokkel(matchIds))
}

const DEMO_EXPENSES = [
  { id: 'de-1', match_id: 'dm-1', paid_by: 'demo-1', amount: 200 },
  { id: 'de-2', match_id: 'dm-2', paid_by: 'demo-2', amount: 200 },
]

export function useExpenses() {
  let demoInitialized = false

  async function fetchExpenses(matchIds) {
    if (isSupabaseConfigured && matchIds.length) { await utleggFersk(nokkel(matchIds)); return }
    return hentUtlegg(matchIds)
  }

  async function hentUtlegg(matchIds) {
    if (!isSupabaseConfigured) {
      // On first load, seed with demo data. After that, keep user changes.
      if (!demoInitialized) {
        const demoEntries = DEMO_EXPENSES.filter(e => matchIds.includes(e.match_id))
        // Merge: keep any user-added expenses, add demo ones that don't conflict
        for (const de of demoEntries) {
          if (!expenses.value.find(e => e.match_id === de.match_id)) {
            expenses.value.push({ ...de })
          }
        }
        demoInitialized = true
      }
      return
    }

    if (matchIds.length === 0) {
      expenses.value = []
      return
    }

    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .in('match_id', matchIds)

    if (!error && data) expenses.value = data
  }

  // Utlegget står på skjermen med en gang trykket kommer; lagringen går etter.
  // Feiler den, settes det tilbake. Returnerer true når det er lagret.
  async function registerExpense(matchId, coachId, amount = 200) {
    const existing = expenses.value.find(e => e.match_id === matchId)
    const tempId = 'ny-' + Date.now()

    if (existing) {
      expenses.value = expenses.value.map(e => e === existing ? { ...e, paid_by: coachId, amount } : e)
    } else {
      expenses.value = [...expenses.value, { id: tempId, match_id: matchId, paid_by: coachId, amount }]
    }
    if (!isSupabaseConfigured) return true

    const { data, error } = existing
      ? await supabase.from('expenses').update({ paid_by: coachId, amount }).eq('id', existing.id).select().single()
      : await supabase.from('expenses').insert({ match_id: matchId, paid_by: coachId, amount }).select().single()

    // Bare denne kampens rad settes tilbake: en annen lagring som lyktes i
    // mellomtiden, skal bli stående.
    if (error || !data) {
      expenses.value = existing
        ? expenses.value.map(e => e.match_id === matchId ? existing : e)
        : expenses.value.filter(e => e.id !== tempId)
      return false
    }
    expenses.value = expenses.value.map(e => e.match_id === matchId ? data : e)
    return true
  }

  async function removeExpense(matchId) {
    const existing = expenses.value.find(e => e.match_id === matchId)
    if (!existing) return true
    expenses.value = expenses.value.filter(e => e.match_id !== matchId)
    if (!isSupabaseConfigured) return true

    const { data, error } = await supabase
      .from('expenses').delete().eq('id', existing.id).select('id')
    if (error || !data?.length) {
      if (!expenses.value.some(e => e.match_id === matchId)) expenses.value = [...expenses.value, existing]
      return false
    }
    return true
  }

  function getExpenseForMatch(matchId) {
    return expenses.value.find(e => e.match_id === matchId) || null
  }

  function getSettlement(coaches) {
    const totalExpenses = expenses.value.reduce((sum, e) => sum + e.amount, 0)
    const perCoachShare = totalExpenses / (coaches.length || 1)

    return coaches.map(coach => {
      const paid = expenses.value
        .filter(e => e.paid_by === coach.id)
        .reduce((sum, e) => sum + e.amount, 0)
      const matchesPaid = expenses.value.filter(e => e.paid_by === coach.id).length

      return {
        coach,
        paid,
        matchesPaid,
        share: Math.round(perCoachShare),
        balance: paid - Math.round(perCoachShare)
      }
    })
  }

  return { expenses, fetchExpenses, registerExpense, removeExpense, getExpenseForMatch, getSettlement }
}
