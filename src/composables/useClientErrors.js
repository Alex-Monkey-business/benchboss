import { ref } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'

// Krasjene fra ekte enheter, gruppert. Bare plattform-admin får lese dem —
// RLS avgjør det, ikke denne fila.
//
// Grupperingen skjer her og ikke i basen: hundre rader med samme fingeravtrykk
// er én sak med et antall og et sist-sett, og det er den formen man kan se på
// og bestemme seg ut fra. En liste på hundre er ingenting.
export function useClientErrors() {
  const saker = ref([])
  const laster = ref(false)

  async function hentFeil({ inkluderKvitterte = false } = {}) {
    if (!isSupabaseConfigured) return saker.value
    laster.value = true
    let q = supabase
      .from('client_errors')
      .select('*')
      .order('occurred_at', { ascending: false })
      .limit(500)
    if (!inkluderKvitterte) q = q.is('resolved_at', null)
    const { data, error } = await q
    laster.value = false
    if (error) return saker.value

    const grupper = new Map()
    for (const r of data || []) {
      const g = grupper.get(r.fingerprint)
      if (g) {
        g.antall++
        if (r.occurred_at > g.sist) g.sist = r.occurred_at
        if (r.cohort_id) g.kull.add(r.cohort_id)
        g.ider.push(r.id)
      } else {
        grupper.set(r.fingerprint, {
          fingerprint: r.fingerprint,
          kind: r.kind,
          message: r.message,
          stack: r.stack,
          route: r.route,
          release: r.release,
          sist: r.occurred_at,
          antall: 1,
          kull: new Set(r.cohort_id ? [r.cohort_id] : []),
          ider: [r.id]
        })
      }
    }
    saker.value = [...grupper.values()].sort((a, b) => (a.sist < b.sist ? 1 : -1))
    return saker.value
  }

  // Kvitterer ut hele saken, ikke én rad. Det er saken man har gjort noe med.
  async function kvitterUt(sak) {
    if (!isSupabaseConfigured || !sak?.ider?.length) return false
    const { data, error } = await supabase
      .from('client_errors')
      .update({ resolved_at: new Date().toISOString() })
      .in('id', sak.ider)
      .select('id')
    if (error || !data?.length) return false
    saker.value = saker.value.filter(s => s.fingerprint !== sak.fingerprint)
    return true
  }

  return { saker, laster, hentFeil, kvitterUt }
}
