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

  // Den lagrede brukeren kan peke på en trener-id som ikke finnes lenger.
  // Da feiler «mine kamper» stille: alt ser riktig ut, men man får et annet
  // lags kamper på Hjem. Navnet er det man selv valgte ved innlogging, så vi
  // lar det avgjøre og fornyer id-en mot trenerlista.
  // Midlertidig — forsvinner den dagen identiteten kommer fra Supabase Auth.
  function reconcileWithCoaches(coachList) {
    const u = state.user
    if (!u || u.role === 'parent' || !coachList?.length) return
    if (coachList.some(c => c.id === u.id)) return

    const byName = coachList.find(c => c.name === u.name)
    if (byName) login({ ...u, id: byName.id })
  }

  return { coach, user, role, isCoach, isParent, isLoggedIn, login, logout, reconcileWithCoaches }
}
