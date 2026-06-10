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
    component: () => import('./views/DashboardView.vue'),
    meta: { coachOnly: true }
  },
  {
    path: '/kamper',
    redirect: '/'
  },
  {
    path: '/kamp/:id',
    name: 'match',
    component: () => import('./views/MatchDetailView.vue'),
    meta: { coachOnly: true }
  },
  {
    path: '/kamp/:id/live',
    name: 'match-mode',
    component: () => import('./views/MatchModeView.vue'),
    meta: { coachOnly: true }
  },
  {
    path: '/statistikk',
    name: 'statistikk',
    component: () => import('./views/StatistikkView.vue'),
    meta: { coachOnly: true }
  },
  // ---- Seriekamper: read-only oversikt for foreldre (trenere bruker dashboard på '/') ----
  {
    path: '/serie',
    name: 'serie',
    component: () => import('./views/SerieKamperView.vue')
  },
  {
    path: '/serie/tropp',
    name: 'serie-tropp',
    component: () => import('./views/SerieTroppView.vue')
  },
  // ---- Cup-modul: kampoversikt (trenere + foreldre, read-only) ----
  {
    path: '/cup',
    name: 'cup',
    component: () => import('./views/CupKamperView.vue')
  },
  {
    path: '/cup/tropp',
    name: 'cup-tropp',
    component: () => import('./views/CupTroppView.vue')
  },
  {
    path: '/cup/kamp/:id',
    name: 'cup-match',
    component: () => import('./views/CupMatchDetailView.vue')
  },
  // Bakoverkompat for gamle stier
  { path: '/cup/ansvar', redirect: '/cup' },
  { path: '/cup/kamper', redirect: '/cup' },
  {
    path: '/admin',
    name: 'admin',
    component: () => import('./views/AdminView.vue'),
    meta: { coachOnly: true }
  },
  {
    path: '/admin/dommerutlegg',
    name: 'admin-dommerutlegg',
    component: () => import('./views/SeasonView.vue'),
    meta: { coachOnly: true }
  },
  {
    path: '/admin/sesong-kamper',
    name: 'admin-sesong-kamper',
    component: () => import('./views/AdminSesongKamperView.vue'),
    meta: { coachOnly: true }
  },
  {
    path: '/admin/dommere',
    name: 'admin-dommere',
    component: () => import('./views/AdminDommereView.vue'),
    meta: { coachOnly: true }
  },
  // Spilleradministrasjon er flyttet inn i Tropp (/serie/tropp).
  { path: '/admin/hospitanter', redirect: '/serie/tropp' },
  { path: '/admin/hospitanter/:id', redirect: '/serie/tropp' },
  {
    path: '/admin/handbok',
    name: 'admin-handbok',
    component: () => import('./views/TrainingHandbookView.vue'),
    meta: { coachOnly: true }
  },
  // ---- Treningsplan: egen toppnivå-seksjon (egen fane i bunnmenyen) ----
  {
    path: '/trening',
    name: 'trening',
    component: () => import('./views/TreningsplanView.vue'),
    meta: { coachOnly: true }
  },
  {
    path: '/trening/:id',
    name: 'treningsperiode',
    component: () => import('./views/TreningsperiodeView.vue'),
    meta: { coachOnly: true }
  },
  {
    path: '/trening/:id/okt/:oktId',
    name: 'treningsokt',
    component: () => import('./views/TreningsoktView.vue'),
    meta: { coachOnly: true }
  },
  // Bakoverkompat: treningsplan lå tidligere under /admin
  { path: '/admin/treningsplan', redirect: '/trening' },
  { path: '/admin/treningsplan/:id', redirect: to => `/trening/${to.params.id}` },
  { path: '/admin/treningsplan/:id/okt/:oktId', redirect: to => `/trening/${to.params.id}/okt/${to.params.oktId}` },
  {
    path: '/admin/handbok/:slug',
    name: 'admin-handbok-principle',
    component: () => import('./views/TrainingPrincipleView.vue'),
    meta: { coachOnly: true }
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
  const { isLoggedIn, isParent } = useAuth()

  // Send unauthenticated users to login, remembering where they were heading.
  if (to.name !== 'login' && !isLoggedIn.value) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  // Allerede innlogget → bort fra login (trener til kamper, forelder til cup).
  if (to.name === 'login' && isLoggedIn.value) {
    return isParent.value ? { name: 'cup' } : { name: 'dashboard' }
  }

  // Foreldre når kun read-only-sidene (serie + cup); coachOnly-ruter sendes til cup.
  if (isParent.value && to.meta?.coachOnly) {
    return { name: 'cup' }
  }
})
