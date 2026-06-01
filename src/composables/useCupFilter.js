import { ref } from 'vue'

// Delt lag-filter for cup-sidene ('all' | 'goat' | 'han').
// Module-level → valget henger med når du bytter mellom Ansvar og Kamper.
const teamFilter = ref('all')

export function useCupFilter() {
  function setFilter(v) {
    teamFilter.value = v
  }
  return { teamFilter, setFilter }
}
