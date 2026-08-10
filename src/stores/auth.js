import { reactive, computed } from 'vue'
import { resetAllData } from './dataReset'

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
    // Composablene er singletons som lever så lenge fanen gjør det. Bytter
    // personen bak skjermen, må forrige persons data ut — ellers ser neste
    // bruker kamper og utlegg som ikke er hens.
    // NB: reconcileWithCoaches fornyer id-en for SAMME person og skal ikke
    // trigge dette, derfor sammenlignes navn og rolle, ikke id.
    const prev = state.user
    if (prev && (prev.name !== withRole.name || prev.role !== withRole.role)) {
      resetAllData()
    }
    state.user = withRole
    localStorage.setItem('halsen_coach', JSON.stringify(withRole))
  }

  function logout() {
    state.user = null
    localStorage.removeItem('halsen_coach')
    resetAllData()
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
