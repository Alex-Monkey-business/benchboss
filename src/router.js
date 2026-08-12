import { createRouter, createWebHistory } from 'vue-router'
import { useAuth, authReady } from './stores/auth'

// Rolle-metaen er FAIL-CLOSED.
//
// Før var en rute uten meta foreldre-tilgjengelig: glemte man `coachOnly`,
// lekket siden. Nå er defaulten trener-only, og de fem foreldre-rutene sier
// det eksplisitt. Glemmer man meta nå, blir feilen «trener ser den, forelder
// ikke» — synlig og ufarlig, i stedet for stille og motsatt.

const PARENT_AND_COACH = ['coach', 'parent']

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('./views/LoginView.vue'),
    meta: { public: true }
  },
  {
    path: '/auth/callback',
    name: 'auth-callback',
    component: () => import('./views/AuthCallbackView.vue'),
    meta: { public: true }
  },
  {
    path: '/',
    name: 'hjem',
    component: () => import('./views/HjemView.vue')
  },
  {
    path: '/kamper',
    name: 'kamper',
    component: () => import('./views/DashboardView.vue')
  },
  {
    path: '/kamp/:id',
    name: 'match',
    component: () => import('./views/MatchDetailView.vue')
  },
  {
    path: '/kamp/:id/live',
    name: 'match-mode',
    component: () => import('./views/MatchModeView.vue')
  },
  {
    path: '/statistikk',
    name: 'statistikk',
    component: () => import('./views/StatistikkView.vue')
  },
  // ---- Seriekamper: read-only oversikt for foreldre (trenere bruker kamplisten på '/kamper') ----
  {
    path: '/serie',
    name: 'serie',
    component: () => import('./views/SerieKamperView.vue'),
    meta: { roles: PARENT_AND_COACH }
  },
  {
    path: '/serie/tropp',
    name: 'serie-tropp',
    component: () => import('./views/SerieTroppView.vue'),
    meta: { roles: PARENT_AND_COACH }
  },
  // ---- Cup-modul: kampoversikt (trenere + foreldre, read-only) ----
  {
    path: '/cup',
    name: 'cup',
    component: () => import('./views/CupKamperView.vue'),
    meta: { roles: PARENT_AND_COACH }
  },
  {
    path: '/cup/tropp',
    name: 'cup-tropp',
    component: () => import('./views/CupTroppView.vue'),
    meta: { roles: PARENT_AND_COACH }
  },
  {
    path: '/cup/kamp/:id',
    name: 'cup-match',
    component: () => import('./views/CupMatchDetailView.vue'),
    meta: { roles: PARENT_AND_COACH }
  },
  // Bakoverkompat for gamle stier
  { path: '/cup/ansvar', redirect: '/cup' },
  { path: '/cup/kamper', redirect: '/cup' },
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
  // Kull-nivå: hvem har tilgang. Rolle-sjekken bor i viewet, ikke i metaen —
  // en trener kan slippe inn hit når kullets allow_coach_invites er på, og det
  // er en DB-verdi routeren ikke kan kjenne.
  {
    path: '/admin/tilgang',
    name: 'admin-tilgang',
    component: () => import('./views/TilgangView.vue')
  },
  // Spilleradministrasjon er flyttet inn i Tropp (/serie/tropp).
  { path: '/admin/hospitanter', redirect: '/serie/tropp' },
  { path: '/admin/hospitanter/:id', redirect: '/serie/tropp' },
  // Skisser for auth-prosjektets skjermer. Ikke i navigasjonen — nås direkte.
  // Slettes når fase 4b er ute.
  {
    path: '/skisser',
    name: 'skisser',
    component: () => import('./views/SkisserView.vue')
  },
  // Trener-håndboka bor under Trening (filosofien bak planen), ikke admin.
  {
    path: '/trening/handbok',
    name: 'handbok',
    component: () => import('./views/TrainingHandbookView.vue')
  },
  {
    path: '/trening/handbok/:slug',
    name: 'handbok-principle',
    component: () => import('./views/TrainingPrincipleView.vue')
  },
  // Øvelsesbank — gjenbrukbare øvelser, plukkes inn i øktene.
  {
    path: '/trening/ovelser',
    name: 'ovelsesbank',
    component: () => import('./views/OvelsesbankView.vue')
  },
  // ---- Treningsplan: egen toppnivå-seksjon (egen fane i bunnmenyen) ----
  {
    path: '/trening',
    name: 'trening',
    component: () => import('./views/TreningsplanView.vue')
  },
  {
    path: '/trening/:id',
    name: 'treningsperiode',
    component: () => import('./views/TreningsperiodeView.vue')
  },
  {
    path: '/trening/:id/okt/:oktId',
    name: 'treningsokt',
    component: () => import('./views/TreningsoktView.vue')
  },
  // Bakoverkompat: treningsplan + håndbok lå tidligere under /admin
  { path: '/admin/treningsplan', redirect: '/trening' },
  { path: '/admin/treningsplan/:id', redirect: to => `/trening/${to.params.id}` },
  { path: '/admin/treningsplan/:id/okt/:oktId', redirect: to => `/trening/${to.params.id}/okt/${to.params.oktId}` },
  { path: '/admin/handbok', redirect: '/trening/handbok' },
  { path: '/admin/handbok/:slug', redirect: to => `/trening/handbok/${to.params.slug}` },
  // Backwards-compat redirects for old paths
  { path: '/sesong', redirect: '/admin/dommerutlegg' },
  { path: '/mer', redirect: '/admin' }
]

export const router = createRouter({
  history: createWebHistory(),
  routes
})

function allows(meta, role) {
  const allowed = meta?.roles || ['coach']
  // `admin` er en trener med mer. Ingen rute trenger å nevne den for å slippe
  // en admin inn på en trenerside.
  if (role === 'admin') return allowed.includes('coach') || allowed.includes('admin')
  return allowed.includes(role)
}

router.beforeEach(async (to) => {
  // Uten denne rekker guarden å kjøre før sesjonen er lest, og sender en
  // innlogget bruker til /login på hver kalde start.
  await authReady()

  const { isLoggedIn, isParent, role } = useAuth()

  if (to.meta?.public) {
    if (to.name === 'login' && isLoggedIn.value) {
      return isParent.value ? { name: 'cup' } : { name: 'hjem' }
    }
    return true
  }

  if (!isLoggedIn.value) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (!allows(to.meta, role.value)) {
    return isParent.value ? { name: 'cup' } : { name: 'hjem' }
  }
})
