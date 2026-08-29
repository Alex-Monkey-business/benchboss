import { computed } from 'vue'
import { useAuth } from '../stores/auth'

// Hva slår appen på for DETTE kullet.
//
// Ett sted, ikke femten `activeCohort.value?.uses_referees`-sjekker spredt
// utover. Kommer det flere brytere (utlegg, statistikk, cup), hører de hjemme
// her — og da er det ett sted å lese for å vite hva et kull faktisk består av.

export function useFeatures() {
  const { activeCohort } = useAuth()

  // Halsen skaffer dommer til hver hjemmekamp og fører utlegg for det. Stag
  // trenger ikke tenke på det. Default PÅ: et kull som ikke har sagt noe skal
  // oppføre seg som før bryteren fantes.
  const usesReferees = computed(() => activeCohort.value?.uses_referees !== false)

  return { usesReferees }
}
