import { ref, computed } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { useAuth } from '../stores/auth'
import { registerReset } from '../stores/dataReset'

// «Har dette kullet en serie i det hele tatt?»
//
// G6, G7 og G8 har ingen terminliste i FIKS — verifisert mot Halsens fire
// G6-lag: fire lag, null kamper på alle fire. De spiller cuper. For dem er
// cup ikke et avbrekk fra sesongen, det ER sesongen, og appen kan ikke vise
// «ingen kamper fremover — nyt friheten» som permanent tilstand.
//
// Målt på HELE kullets historikk, ikke den aktive sesongen. Med aktiv sesong
// ville Halsen flippet til cup-først hver gang en ny sesong står tom, og det
// er nettopp den slags overraskelse ingen har bedt om. Halsen har 63 kamper i
// basen; de kan aldri bli cup-først.
const serieKamper = ref(null)
const maaltKull = ref(null)

registerReset(() => { serieKamper.value = null; maaltKull.value = null })

export function useCupFirst() {
  const { activeCohort } = useAuth()

  async function fetchSerieStatus() {
    const id = activeCohort.value?.id
    if (!id) return
    if (maaltKull.value === id) return
    if (!isSupabaseConfigured) { serieKamper.value = 1; maaltKull.value = id; return }

    const { count, error } = await supabase
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .eq('cohort_id', id)
    if (error) return
    serieKamper.value = count ?? 0
    maaltKull.value = id
  }

  // Ukjent er IKKE cup-først. Før tellingen er tilbake skal flatene se ut som
  // de alltid har gjort — et kull som blinker om til et annet oppsett et
  // halvsekund etter innlasting er verre enn å vente på svaret.
  const cupFirst = computed(() => serieKamper.value === 0)

  return { cupFirst, fetchSerieStatus }
}
