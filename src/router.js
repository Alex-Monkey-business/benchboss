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
  // Spillerprofil: posisjoner, kamper, mål og spilletid om ett navngitt barn.
  // Ingen meta = trener-only, med vilje. Foreldre ser troppen, men skal ikke
  // kunne åpne en spiller.
  {
    path: '/spiller/:id',
    name: 'spiller',
    component: () => import('./views/SpillerView.vue')
  },
  // Trenerprofil: lag for sesongen og ansvarsområder. Ingen meta = trener-only,
  // av samme grunn som spillerprofilen — foreldre ser troppen, ikke personene.
  {
    path: '/trener/:id',
    name: 'trener',
    component: () => import('./views/TrenerView.vue')
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
  // Møtereferater. Ingen meta = trener-only, med vilje — her står spillernavn
  // med vurderinger knyttet til seg, og det skal aldri nå en foreldreflate.
  {
    path: '/admin/referater',
    name: 'referater',
    component: () => import('./views/MoteReferaterView.vue')
  },
  {
    path: '/admin/referater/:slug',
    name: 'referat',
    component: () => import('./views/MoteReferatView.vue')
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
  // ---- Trening: uka er hele flaten ----
  // Begge rutene rendrer samme uke-side: uten :id velger den måneden som
  // gjelder nå. Ingen redirect — en omdirigering til en id gjorde bare at
  // tilbake-knappen kastet deg rundt.
  //
  // Dagen hadde en egen side en stund. Den døde da uka begynte å vise dagen
  // fullt ut: to renderinger av samme øvelse, og bare Hjem visste om den ene.
  // Nå deeplinker Hjem inn i uka med ?dag=<id>.
  {
    path: '/trening',
    name: 'trening',
    component: () => import('./views/TreningsukeView.vue')
  },
  {
    path: '/trening/:id',
    name: 'treningsperiode',
    component: () => import('./views/TreningsukeView.vue')
  },
  // Bakoverkompat: treningsplan + håndbok lå tidligere under /admin
  { path: '/admin/treningsplan', redirect: '/trening' },
  { path: '/admin/treningsplan/:id', redirect: to => `/trening/${to.params.id}` },
  // Gamle dags-lenker (bokmerker, delte lenker) åpner dagen i uka i stedet.
  { path: '/admin/treningsplan/:id/okt/:oktId', redirect: to => ({ path: `/trening/${to.params.id}`, query: { dag: to.params.oktId } }) },
  { path: '/trening/:id/okt/:oktId', redirect: to => ({ path: `/trening/${to.params.id}`, query: { dag: to.params.oktId } }) },
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
