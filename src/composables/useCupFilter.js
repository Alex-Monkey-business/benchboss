import { ref } from 'vue'
import { registerReset } from '../stores/dataReset'

// Delt lag-filter for cup-sidene ('all' | 'goat' | 'han').
// Module-level → valget henger med når du bytter mellom Ansvar og Kamper.
const teamFilter = ref('all')

registerReset(() => { teamFilter.value = 'all' })

export function useCupFilter() {
  function setFilter(v) {
    teamFilter.value = v
  }
  return { teamFilter, setFilter }
}
