import { ref } from 'vue'
import { registerReset } from '../stores/dataReset'

// Delt lag-filter for serie-sidene ('alle' | 'gronn' | 'rod' | 'hvit').
// Speiler useCupFilter: module-level → valget henger med mellom Kamper og Tropp.
// Blir seedet fra brukerens lagpreferanse når medlemsraden finnes (fase 5).
const teamFilter = ref('alle')

registerReset(() => { teamFilter.value = 'alle' })

export function useTeamFilter() {
  function setFilter(v) {
    teamFilter.value = v
  }
  return { teamFilter, setFilter }
}
