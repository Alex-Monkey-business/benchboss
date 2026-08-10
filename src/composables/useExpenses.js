import { ref } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { registerReset } from '../stores/dataReset'

const expenses = ref([])

registerReset(() => { expenses.value = [] })

const DEMO_EXPENSES = [
  { id: 'de-1', match_id: 'dm-1', paid_by: 'demo-1', amount: 200 },
  { id: 'de-2', match_id: 'dm-2', paid_by: 'demo-2', amount: 200 },
]

export function useExpenses() {
  let demoInitialized = false

  async function fetchExpenses(matchIds) {
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

  async function registerExpense(matchId, coachId, amount = 200) {
    const existing = expenses.value.find(e => e.match_id === matchId)

    if (!isSupabaseConfigured) {
      if (existing) {
        existing.paid_by = coachId
        existing.amount = amount
      } else {
        expenses.value.push({ id: 'de-' + Date.now(), match_id: matchId, paid_by: coachId, amount })
      }
      return
    }

    if (existing) {
      const { data, error } = await supabase
        .from('expenses')
        .update({ paid_by: coachId, amount })
        .eq('id', existing.id)
        .select()
        .single()

      if (!error && data) {
        const idx = expenses.value.findIndex(e => e.id === existing.id)
        if (idx > -1) expenses.value[idx] = data
      }
    } else {
      const { data, error } = await supabase
        .from('expenses')
        .insert({ match_id: matchId, paid_by: coachId, amount })
        .select()
        .single()

      if (!error && data) expenses.value.push(data)
    }
  }

  async function removeExpense(matchId) {
    const existing = expenses.value.find(e => e.match_id === matchId)
    if (!existing) return

    if (!isSupabaseConfigured) {
      expenses.value = expenses.value.filter(e => e.match_id !== matchId)
      return
    }

    await supabase.from('expenses').delete().eq('id', existing.id)
    expenses.value = expenses.value.filter(e => e.id !== existing.id)
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
