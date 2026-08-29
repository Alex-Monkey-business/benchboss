import { reactive, computed } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { resetAllData } from './dataReset'
import { readLegacyUser, clearLegacyUser, refreshLegacyFlag } from './legacyAuth'

// Identiteten i BenchBoss.
//
// Storen holder en LISTE med medlemskap og ett aktivt — ikke én rad. De aller
// fleste har nøyaktig ett og merker ingenting, men den som setter opp et nytt
// kull har to. Å bygge dette for én rad først ville betydd å skrive om storen
// rett etter at den var skrevet.
//
// coach.id er fortsatt coaches.id. Det er derfor alle kallstedene som leser
// `coach` er uendret gjennom hele omskrivingen — expenses.paid_by og
// match_coaches peker dit, og de skal ikke røres.

const CACHE_KEY = 'bb_auth_v1'
const ACTIVE_KEY = 'bb_active_cohort'

const state = reactive({
  profile: null,       // { id, email, full_name, is_platform_admin }
  memberships: [],     // cohort_members + kullets navn
  activeCohortId: null,
  legacy: null,        // { id, name, role } fra PIN-broen
  offline: false,
  ready: false,
  // Kampmodus holder sesjonen: en utløpt sesjon der skal gi en varsling, ikke
  // en utkastelse. Å miste en kamp på 1–1 i 40. minutt er uopprettelig, og
  // resetAllData() midt i den ville tømt både klokke og byttehistorikk.
  holdSession: false,
  sessionLost: false
})

// ---------------------------------------------------------------------------
// Varm start
// ---------------------------------------------------------------------------
// Speilingen leses synkront ved modullast. Uten den ville routeren rukket å
// sende en innlogget bruker til /login før getSession() svarte — et glimt av
// innloggingsskjermen hver eneste gang appen åpnes.

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')
  } catch {
    return null
  }
}

function writeCache() {
  localStorage.setItem(CACHE_KEY, JSON.stringify({
    profile: state.profile,
    memberships: state.memberships
  }))
  if (state.activeCohortId) localStorage.setItem(ACTIVE_KEY, state.activeCohortId)
}

function clearCache() {
  localStorage.removeItem(CACHE_KEY)
  localStorage.removeItem(ACTIVE_KEY)
}

const cached = readCache()
if (cached?.profile) {
  state.profile = cached.profile
  state.memberships = cached.memberships || []
  state.activeCohortId = localStorage.getItem(ACTIVE_KEY) || null
}
if (!state.profile) state.legacy = readLegacyUser()

// ---------------------------------------------------------------------------
// Avledet identitet
// ---------------------------------------------------------------------------

const activeMember = computed(() => {
  if (!state.memberships.length) return null
  return state.memberships.find(m => m.cohort_id === state.activeCohortId) || state.memberships[0]
})

const role = computed(() => activeMember.value?.role || state.legacy?.role || null)
const isLoggedIn = computed(() => !!activeMember.value || !!state.legacy)
const isParent = computed(() => role.value === 'parent')
const isCoach = computed(() => role.value === 'coach' || role.value === 'admin')
const isAdmin = computed(() => role.value === 'admin')
const isPlatformAdmin = computed(() => !!state.profile?.is_platform_admin)

// Kallstedene leser `coach.id` og `coach.name` og skal ikke vite at det finnes
// medlemskap i det hele tatt.
const coach = computed(() => {
  const m = activeMember.value
  if (m) return { id: m.coach_id, name: m.name }
  return state.legacy
})

// En trener uten coach_id er ikke en feil appen skal skjule. Før het dette
// reconcileWithCoaches og gjettet seg fram på navn; nå er det en synlig
// tilstand med banner på Hjem.
const identityIncomplete = computed(() => isCoach.value && !coach.value?.id)

// Preferanser, backfilt fra de gamle statiske lag-configene i fase 2. De SEEDER
// filtrene — de låser ingenting.
const preferredTeam = computed(() => activeMember.value?.preferred_team || null)
const preferredCupTeam = computed(() => activeMember.value?.preferred_cup_team || null)

const activeCohort = computed(() => {
  const m = activeMember.value
  if (!m) return null
  return {
    id: m.cohort_id,
    name: m.cohort_name,
    slug: m.cohort_slug,
    club_id: m.club_id,
    club_name: m.club_name,
    club_key: m.club_key,
    club_fiks_id: m.club_fiks_id,
    birth_year: m.birth_year,
    uses_referees: m.uses_referees,
    players_on_pitch: m.players_on_pitch,
    period_count: m.period_count,
    period_minutes: m.period_minutes
  }
})

// ---------------------------------------------------------------------------
// authReady — routeren venter på denne
// ---------------------------------------------------------------------------

let resolveReady
const readyPromise = new Promise(resolve => { resolveReady = resolve })

function finishReady() {
  state.ready = true
  resolveReady()
}

export function authReady() {
  return readyPromise
}

// ---------------------------------------------------------------------------
// Lasting
// ---------------------------------------------------------------------------

function applyMemberships(profile, rows) {
  const previousProfile = state.profile?.id

  state.profile = profile
  state.memberships = (rows || []).map(r => ({
    id: r.id,
    cohort_id: r.cohort_id,
    cohort_name: r.cohorts?.name || null,
    cohort_slug: r.cohorts?.slug || null,
    // Klubben og spillformen følger medlemskapet, så «hvem er vi» og «hvor
    // mange på banen» er kjent i samme oppslag som rollen — og ligger i
    // cachen ved kald start.
    club_id: r.cohorts?.club_id || null,
    club_name: r.cohorts?.clubs?.name || null,
    club_key: (r.cohorts?.clubs?.short_name || '').toLowerCase() || null,
    // FIKS-koblingen og årskullet er det onboardingen spør om. De ligger her
    // fordi svaret «er dette kullet satt opp?» må være kjent før første
    // tegning — ellers blinker hjemskjermen innom før veiviseren tar over.
    club_fiks_id: r.cohorts?.clubs?.fiks_id ?? null,
    birth_year: r.cohorts?.birth_year ?? null,
    // Default true når kolonnen ikke finnes ennå: en app som er deployet før
    // migrasjonen skal oppføre seg som før, ikke skjule dommerne.
    uses_referees: r.cohorts?.uses_referees ?? true,
    players_on_pitch: r.cohorts?.players_on_pitch || 7,
    period_count: r.cohorts?.period_count || 2,
    period_minutes: r.cohorts?.period_minutes || 30,
    role: r.role,
    coach_id: r.coach_id,
    name: r.name,
    preferred_team: r.preferred_team,
    preferred_cup_team: r.preferred_cup_team
  }))

  // Et lagret aktivt kull kan peke på et medlemskap som er fjernet. Da skal
  // appen falle tilbake til det første — ikke låse seg på et kull brukeren
  // ikke lenger har tilgang til.
  if (!state.memberships.some(m => m.cohort_id === state.activeCohortId)) {
    state.activeCohortId = state.memberships[0]?.cohort_id || null
  }

  // Byttet person bak skjermen? De 18 composablene er singletons som lever så
  // lenge fanen gjør det, og ville ellers vist forrige brukers kamper.
  if (previousProfile && previousProfile !== profile?.id) resetAllData()

  // Ekte innlogging vinner over PIN-broen.
  if (state.memberships.length) state.legacy = null

  writeCache()
}

async function loadMember(user) {
  const [profileRes, memberRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, full_name, is_platform_admin')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('cohort_members')
      .select('id, cohort_id, role, coach_id, name, preferred_team, preferred_cup_team, cohorts(name, slug, club_id, birth_year, uses_referees, players_on_pitch, period_count, period_minutes, clubs(name, short_name, fiks_id))')
      .eq('profile_id', user.id)
      .eq('status', 'active')
  ])

  if (profileRes.error || memberRes.error) {
    // Beholder cachen med vilje. En trener på en bane med dårlig dekning skal
    // ikke logges ut midt i en kamp fordi ett kall feilet.
    state.offline = true
    return
  }

  state.offline = false
  applyMemberships(
    profileRes.data || { id: user.id, email: user.email, is_platform_admin: false },
    memberRes.data
  )
}

async function bootstrap() {
  // Ikke await-et: legacy-flagget skal ikke kunne forsinke oppstarten.
  refreshLegacyFlag()

  if (!isSupabaseConfigured) {
    finishReady()
    return
  }

  try {
    const { data } = await supabase.auth.getSession()
    if (data?.session?.user) {
      await loadMember(data.session.user)
    } else if (state.profile) {
      // Cachen påsto innlogget, men sesjonen er borte.
      state.profile = null
      state.memberships = []
      state.activeCohortId = null
      clearCache()
      state.legacy = readLegacyUser()
    }
  } catch {
    state.offline = true
  }

  finishReady()

  supabase.auth.onAuthStateChange((event, session) => {
    // Callbacken må ALDRI kalle Supabase synkront. Den kjører inne i
    // auth-mutexen, og et kall herfra låser den — appen henger ved kald start,
    // uten feilmelding.
    setTimeout(async () => {
      if (event === 'SIGNED_OUT' || !session?.user) {
        if (state.holdSession) {
          state.sessionLost = true
          return
        }
        clearAuthState()
        return
      }
      await loadMember(session.user)
    }, 0)
  })
}

bootstrap()

// ---------------------------------------------------------------------------
// Handlinger
// ---------------------------------------------------------------------------

function clearAuthState() {
  state.profile = null
  state.memberships = []
  state.activeCohortId = null
  clearCache()
  resetAllData()
}

// Settes av MatchModeView. Slippes den mens sesjonen er tapt, ryddes det opp
// først da — etter at kampen er ferdig.
function setSessionHold(hold) {
  state.holdSession = hold
  if (!hold && state.sessionLost) {
    state.sessionLost = false
    clearAuthState()
  }
}

function setActiveCohort(cohortId) {
  if (cohortId === state.activeCohortId) return
  if (!state.memberships.some(m => m.cohort_id === cohortId)) return
  state.activeCohortId = cohortId
  localStorage.setItem(ACTIVE_KEY, cohortId)
  // Samme mekanisme som ved brukerbytte, av samme grunn.
  resetAllData()
}

// Etter verifyCode må medlemsraden være lest FØR vi navigerer. Å stole på
// onAuthStateChange her ville gitt et kappløp routeren taper: den ser en
// bruker uten medlemskap og sender deg rett tilbake til innloggingen.
async function refreshMember() {
  if (!isSupabaseConfigured) return
  const { data } = await supabase.auth.getSession()
  if (data?.session?.user) await loadMember(data.session.user)
}

async function sendCode(email) {
  // shouldCreateUser: false er hele grunnen til at det ikke finnes
  // selvregistrering. Uten den kan hvem som helst skrive inn en e-post og få
  // en konto.
  return supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${window.location.origin}/auth/callback`
    }
  })
}

async function verifyCode(email, token) {
  return supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.trim(),
    type: 'email'
  })
}

// Demo-modus (ingen Supabase): rolleknapper i stedet for innlogging.
function demoLogin({ name, role: r, coachId = null, cohortId = 'demo-cohort' }) {
  state.legacy = null
  state.profile = { id: 'demo-profile', email: null, full_name: name, is_platform_admin: r === 'admin' }
  state.memberships = [{
    id: 'demo-member',
    cohort_id: cohortId,
    cohort_name: 'Halsen G2015',
    cohort_slug: 'g2015',
    club_id: 'demo-club',
    club_name: 'Halsen IL',
    club_key: 'halsen',
    club_fiks_id: 505,
    birth_year: 2015,
    uses_referees: true,
    players_on_pitch: 7,
    period_count: 2,
    period_minutes: 30,
    role: r,
    coach_id: coachId,
    name,
    preferred_team: null,
    preferred_cup_team: null
  }]
  state.activeCohortId = cohortId
  resetAllData()
  writeCache()
}

async function logout() {
  clearLegacyUser()
  state.legacy = null
  state.profile = null
  state.memberships = []
  state.activeCohortId = null
  clearCache()

  if (isSupabaseConfigured) {
    try { await supabase.auth.signOut() } catch { /* sesjonen er uansett borte lokalt */ }
  }

  resetAllData()
}

export function useAuth() {
  return {
    // uendret overflate for de eksisterende kallstedene
    coach,
    user: coach,
    role,
    isCoach,
    isParent,
    isLoggedIn,
    logout,

    // nytt
    isAdmin,
    isPlatformAdmin,
    identityIncomplete,
    activeCohort,
    preferredTeam,
    preferredCupTeam,
    memberships: computed(() => state.memberships),
    offline: computed(() => state.offline),
    ready: computed(() => state.ready),
    isLegacySession: computed(() => !!state.legacy),
    sessionLost: computed(() => state.sessionLost),
    setSessionHold,
    setActiveCohort,
    sendCode,
    verifyCode,
    refreshMember,
    demoLogin
  }
}
