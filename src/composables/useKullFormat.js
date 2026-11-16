import { supabase, isSupabaseConfigured } from '../supabase'
import { useAuth } from '../stores/auth'

// Spillform og kamplengde på det aktive kullet.
//
// Går via bb_cohort_set_format (enhver trener i kullet). Er migrasjonen ikke
// kjørt ennå, finnes ikke funksjonen — da prøver vi en vanlig update, som
// admin_cohort_update slipper gjennom for admin. En trener får da en ærlig
// feil i stedet for at ingenting skjer.
export function useKullFormat() {
  const { activeCohort, refreshMember } = useAuth()

  async function lagreFormat({ players_on_pitch, period_count, period_minutes }) {
    const id = activeCohort.value?.id
    if (!id) return { ok: false }
    if (!isSupabaseConfigured) return { ok: false }

    const { error } = await supabase.rpc('bb_cohort_set_format', {
      p_cohort_id: id,
      p_players_on_pitch: players_on_pitch,
      p_period_count: period_count,
      p_period_minutes: period_minutes
    })

    if (error) {
      const mangler = error.code === 'PGRST202' || error.code === '42883'
      if (!mangler) return { ok: false, error }
      const { data, error: e2 } = await supabase
        .from('cohorts')
        .update({ players_on_pitch, period_count, period_minutes })
        .eq('id', id)
        .select('id')
      if (e2 || !data?.length) return { ok: false, error: e2, kunAdmin: true }
    }

    // activeCohort leses fra medlemsraden. Uten ny henting viser kampmodus
    // gammel spillform til appen startes på nytt.
    await refreshMember()
    return { ok: true }
  }

  return { lagreFormat }
}
