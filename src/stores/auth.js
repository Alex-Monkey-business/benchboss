import { reactive, computed } from 'vue'

// Lagret bruker: { id, name, role }. role = 'coach' | 'parent'.
// Eldre lagrede objekter mangler role → tolkes som 'coach' (bakoverkompatibelt).
const stored = JSON.parse(localStorage.getItem('halsen_coach') || 'null')
const state = reactive({
  user: stored
})

export function useAuth() {
  const isLoggedIn = computed(() => !!state.user)
  const role = computed(() => state.user?.role || 'coach')
  const isCoach = computed(() => role.value === 'coach')
  const isParent = computed(() => role.value === 'parent')

  // Alias – mange komponenter leser fortsatt `coach`.
  const coach = computed(() => state.user)
  const user = computed(() => state.user)

  function login(userData) {
    const withRole = { role: 'coach', ...userData }
    state.user = withRole
    localStorage.setItem('halsen_coach', JSON.stringify(withRole))
  }

  function logout() {
    state.user = null
    localStorage.removeItem('halsen_coach')
  }

  return { coach, user, role, isCoach, isParent, isLoggedIn, login, logout }
}
