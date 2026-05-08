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
    path: '/statistikk',
    name: 'statistikk',
    component: () => import('./views/StatistikkView.vue')
  },
  {
    path: '/admin',
    name: 'admin',
    component: () => import('./views/AdminView.vue')
  },
  {
    path: '/admin/dommerutlegg',
    name: 'admin-dommerutlegg',
    component: () => import('./views/SeasonView.vue')
  },
  {
    path: '/admin/sesong-kamper',
    name: 'admin-sesong-kamper',
    component: () => import('./views/AdminSesongKamperView.vue')
  },
  {
    path: '/admin/dommere',
    name: 'admin-dommere',
    component: () => import('./views/AdminDommereView.vue')
  },
  {
    path: '/admin/hospitanter',
    name: 'admin-hospitanter',
    component: () => import('./views/AdminHospitanterView.vue')
  },
  {
    path: '/admin/hospitanter/:id',
    name: 'admin-hospitant-detail',
    component: () => import('./views/AdminHospitantDetailView.vue')
  },
  // Backwards-compat redirects for old paths
  { path: '/sesong', redirect: '/admin/dommerutlegg' },
  { path: '/mer', redirect: '/admin' }
]

export const router = createRouter({
  history: createWebHistory(),
  routes
})

const SPLASH_COOLDOWN_MS = 30 * 60 * 1000

function splashIsFresh() {
  const last = Number(localStorage.getItem('splashLastShown'))
  return last && Date.now() - last < SPLASH_COOLDOWN_MS
}

let splashShownThisLoad = splashIsFresh()

router.beforeEach((to) => {
  const { isLoggedIn } = useAuth()

  if (to.name === 'splash') return

  // Splash shows on cold start (no view in last 30 min) — deep links skip it.
  if (!splashShownThisLoad) {
    splashShownThisLoad = true
    localStorage.setItem('splashLastShown', String(Date.now()))
    if (to.path === '/' && to.name !== 'login') {
      return { name: 'splash' }
    }
  }

  // Send unauthenticated users to login, remembering where they were heading.
  if (to.name !== 'login' && !isLoggedIn.value) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (to.name === 'login' && isLoggedIn.value) {
    return { name: 'dashboard' }
  }
})
