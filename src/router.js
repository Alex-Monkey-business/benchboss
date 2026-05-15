import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from './stores/auth'

const routes = [
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
  {
    path: '/admin/handbok',
    name: 'admin-handbok',
    component: () => import('./views/TrainingHandbookView.vue')
  },
  {
    path: '/admin/handbok/:slug',
    name: 'admin-handbok-principle',
    component: () => import('./views/TrainingPrincipleView.vue')
  },
  // Backwards-compat redirects for old paths
  { path: '/sesong', redirect: '/admin/dommerutlegg' },
  { path: '/mer', redirect: '/admin' }
]

export const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to) => {
  const { isLoggedIn } = useAuth()

  // Send unauthenticated users to login, remembering where they were heading.
  if (to.name !== 'login' && !isLoggedIn.value) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (to.name === 'login' && isLoggedIn.value) {
    return { name: 'dashboard' }
  }
})
