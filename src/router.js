import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from './stores/auth'

const routes = [
  {
    path: '/splash',
    name: 'splash',
    component: () => import('./views/SplashView.vue')
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('./views/LoginView.vue')
  },
  {
    path: '/',
    name: 'dashboard',
    component: () => import('./views/DashboardView.vue')
  },
  {
    path: '/kamper',
    redirect: '/'
  },
  {
    path: '/kamp/:id',
    name: 'match',
    component: () => import('./views/MatchDetailView.vue')
  },
  {
    path: '/sesong',
    name: 'season',
    component: () => import('./views/SeasonView.vue')
  },
  {
    path: '/mer',
    name: 'more',
    component: () => import('./views/MoreView.vue')
  }
]

export const router = createRouter({
  history: createWebHistory(),
  routes
})

let splashShown = sessionStorage.getItem('splashShown')

router.beforeEach((to) => {
  const { isLoggedIn } = useAuth()

  // Show splash once per session on first navigation
  if (!splashShown && to.name !== 'splash') {
    splashShown = true
    sessionStorage.setItem('splashShown', '1')
    return { name: 'splash' }
  }

  // Splash screen is always accessible
  if (to.name === 'splash') return

  if (to.name !== 'login' && !isLoggedIn.value) {
    return { name: 'login' }
  }
  if (to.name === 'login' && isLoggedIn.value) {
    return { name: 'dashboard' }
  }
})
