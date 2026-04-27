import { reactive, computed } from 'vue'

const state = reactive({
  coach: JSON.parse(localStorage.getItem('halsen_coach') || 'null')
})

export function useAuth() {
  const isLoggedIn = computed(() => !!state.coach)
  const coach = computed(() => state.coach)

  function login(coachData) {
    state.coach = coachData
    localStorage.setItem('halsen_coach', JSON.stringify(coachData))
  }

  function logout() {
    state.coach = null
    localStorage.removeItem('halsen_coach')
  }

  return { coach, isLoggedIn, login, logout }
}
