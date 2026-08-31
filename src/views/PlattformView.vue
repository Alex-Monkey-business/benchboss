<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase, isSupabaseConfigured } from '../supabase'
import { useAuth } from '../stores/auth'
import { useToast } from '../composables/useToast'
import { useFiks } from '../composables/useFiks'
import { useClientErrors } from '../composables/useClientErrors'
import { clubLogo } from '../lib/klubblogo'
import Sheet from '../components/Sheet.vue'

// Plattform-nivå: klubber og kull.
//
// Her opprettes bare skallet: klubb + første sesong. Årskull, lag, spillform
// og terminliste settes av treneren i /kom-i-gang, som henter alt fra
// fotball.no. Derfor spør vi ikke om noe av det her — et gjett fra admin blir
// likevel overskrevet, og `birth_year is null` er nettopp signalet veiviseren
// leser for å vite at kullet ikke er satt opp.
//
// bb_create_cohort skriver alt i én transaksjon: klubb (om ny) → kull →
// sesong → den som oppretter blir admin. Etterpå står kullet i kull-velgeren
// på /admin, og /admin/tilgang er stedet man inviterer treneren.
//
// KLUBBEN VELGES FRA FOTBALL.NO ALT HER. Skrev admin den fritt, tok treneren
// den samme avgjørelsen en gang til i veiviseren — og navnene trengte ikke å
// være de samme («Stag IF» mot «Sportsklubben Stag»). Nå kobles klubben i det
// skallet lages, og veiviseren starter på årskullet.

const router = useRouter()
const { isPlatformAdmin, memberships, refreshMember, setActiveCohort } = useAuth()
const { show: showToast } = useToast()

const { searchClubs, searching } = useFiks()

const clubs = ref([])
const cohorts = ref([])
const loading = ref(true)
const pending = ref(false)

const grouped = computed(() =>
  clubs.value.map(c => ({
    ...c,
    cohorts: cohorts.value.filter(k => k.club_id === c.id)
  }))
)

const memberOf = computed(() => new Set(memberships.value.map(m => m.cohort_id)))

async function load() {
  if (!isSupabaseConfigured) {
    loading.value = false
    return
  }
  const [clubRes, cohortRes] = await Promise.all([
    supabase.from('clubs').select('id, name, short_name, slug, fiks_id').order('name'),
    supabase
      .from('cohorts')
      .select('id, club_id, name, slug, birth_year, players_on_pitch, period_count, period_minutes')
      .order('name')
  ])
  if (clubRes.error || cohortRes.error) {
    showToast('Kunne ikke hente klubber og kull', 'error')
  } else {
    clubs.value = clubRes.data || []
    cohorts.value = cohortRes.data || []
  }
  loading.value = false
}

onMounted(async () => {
  if (!isPlatformAdmin.value) {
    router.replace('/admin')
    return
  }
  await load()
})

// ---- Nytt kull ----
// NFF-defaultene ligger i lib/spillform.js — delt med veiviseren treneren
// møter, så et kull får samme spillform uansett hvem som opprettet det.

function defaultSeasonName() {
  const d = new Date()
  return `${d.getMonth() >= 6 ? 'Høst' : 'Vår'} ${d.getFullYear()}`
}

const open = ref(false)
const form = ref(null)

function openNew() {
  form.value = {
    club_id: '',
    club_name: '',
    club_short_name: '',
    fiks_id: null,
    season_name: defaultSeasonName()
  }
  sok.value = ''
  treff.value = []
  sokFeil.value = ''
  friTekst.value = false
  open.value = true
}

// ---- Klubbsøk på fotball.no ----
const sok = ref('')
const treff = ref([])
const sokFeil = ref('')
const friTekst = ref(false)
let sokTimer = null

// Klubbene FIKS skriver ut heter «Sportsklubben Stag» og «Ørn Horten, FK».
// Kortnavnet er det som blir igjen når klubbordene er borte — og det er det
// laget heter i kampoppsettet. Feltet står åpent for å rettes.
const KLUBBORD = /\b(sportsklubben|sportsklubb|idrettslaget|idrettslag|idrettsforening|fotballklubben|fotballklubb|ballklubben|ballklubb|fotball|il|if|fk|sk|bk|ik|tif|fil)\b/gi
function foreslattKortnavn(navn) {
  const rensket = String(navn).replace(/[,.]/g, ' ').replace(KLUBBORD, ' ').replace(/\s+/g, ' ').trim()
  return (rensket || String(navn)).split(' ')[0]
}

watch(sok, q => {
  clearTimeout(sokTimer)
  sokFeil.value = ''
  if (q.trim().length < 2) { treff.value = []; return }
  sokTimer = setTimeout(async () => {
    try {
      treff.value = await searchClubs(q)
    } catch (e) {
      sokFeil.value = e?.name === 'AbortError'
        ? 'Søket tok for lang tid. Prøv hele klubbnavnet.'
        : 'Fikk ikke kontakt med fotball.no.'
    }
  }, 350)
})

onUnmounted(() => clearTimeout(sokTimer))

// Er klubben alt i BenchBoss, skal den velges — ikke opprettes en gang til.
// clubs.fiks_id er globalt unik, så rad nummer to ville uansett aldri fått
// koblingen, og treneren hadde stått uten lag.
const finnesFra = fiksId => clubs.value.find(c => String(c.fiks_id) === String(fiksId))

function velgKlubb(c) {
  const gammel = finnesFra(c.fiksId)
  if (gammel) {
    form.value.club_id = gammel.id
    form.value.fiks_id = null
    showToast(`${gammel.name} ligger allerede i BenchBoss`, 'info')
    return
  }
  form.value.club_name = c.name
  form.value.club_short_name = foreslattKortnavn(c.name)
  form.value.fiks_id = c.fiksId
  treff.value = []
  sok.value = ''
}

function nullstillKlubb() {
  form.value.club_name = ''
  form.value.club_short_name = ''
  form.value.fiks_id = null
  friTekst.value = false
}

// Kortnavnet på klubben man har valgt — brukes i det midlertidige kullnavnet.
const clubShort = computed(() => {
  const f = form.value
  if (!f) return ''
  if (f.club_id) return clubs.value.find(c => c.id === f.club_id)?.short_name || ''
  return f.club_short_name.trim() || f.club_name.trim().split(' ')[0] || ''
})

// Kullet må ha et navn i basen, men treneren gir det det riktige («Stag G2018»)
// i det han velger årskull. Fram til da heter det dette. Slug-en får et
// tilfeldig haleheng fordi (club_id, slug) er unik og admin kan opprette to
// skall for samme klubb før noen har logget inn.
const placeholderName = computed(() =>
  clubShort.value ? `${clubShort.value} – nytt kull` : 'Nytt kull'
)

const canSubmit = computed(() => {
  const f = form.value
  if (!f) return false
  return Boolean(f.club_id || f.club_name.trim())
})

// Koblingen legges på klubben etter at kullet finnes — clubs har ingen
// klient-skrivepolicy, så den går gjennom RPC-en. Feiler den, er kullet
// fortsatt riktig opprettet: treneren får bare klubbsøket sitt tilbake.
async function koblKlubb(cohortId, fiksId) {
  if (!fiksId) return
  const { data: kull } = await supabase
    .from('cohorts').select('club_id').eq('id', cohortId).maybeSingle()
  if (!kull?.club_id) return
  const { error } = await supabase.rpc('bb_set_club_fiks_id', {
    p_club_id: kull.club_id,
    p_fiks_id: Number(fiksId)
  })
  if (error) showToast('Kullet er opprettet, men klubben ble ikke koblet til fotball.no', 'error')
}

async function submit() {
  const f = form.value
  pending.value = true
  const { data, error } = await supabase.rpc('bb_create_cohort', {
    p_club_id: f.club_id || null,
    p_club_name: f.club_id ? null : f.club_name.trim(),
    p_club_short_name: f.club_id ? null : (f.club_short_name.trim() || null),
    p_name: placeholderName.value,
    p_slug: `nytt-kull-${Date.now().toString(36)}`,
    // Alt dette setter treneren i veiviseren. Tallene er bare NFF-defaultene
    // kolonnene har fra før, så kullet er gyldig om noen hopper over.
    p_birth_year: null,
    p_players_on_pitch: null,
    p_period_count: null,
    p_period_minutes: null,
    p_teams: [],
    p_season_name: f.season_name.trim() || null
  })
  pending.value = false

  if (error) {
    showToast(error.message || 'Kunne ikke opprette kullet', 'error')
    return
  }

  await koblKlubb(data, f.fiks_id)

  open.value = false
  // Medlemskapet finnes nå — hent det, gå inn i kullet, og rett til Tilgang
  // der den første treneren inviteres.
  await refreshMember()
  setActiveCohort(data)
  showToast('Kullet er opprettet', 'success')
  router.push('/admin/tilgang')
}

// ---- Krasj fra ekte enheter ----
//
// Her, ikke i et eget verktøy: dette er den eneste flaten som allerede betyr
// «hele plattformen, ikke ett kull», og feilene er nettopp det.
const { saker: feil, laster: lasterFeil, hentFeil, kvitterUt } = useClientErrors()
const visKvitterte = ref(false)
const kvitterer = ref(null)

onMounted(() => hentFeil())

async function kvitter(sak) {
  kvitterer.value = sak.fingerprint
  const ok = await kvitterUt(sak)
  kvitterer.value = null
  showToast(ok ? 'Kvittert ut' : 'Fikk ikke kvittert ut', ok ? 'success' : 'error')
}

function nårTekst(iso) {
  const min = Math.round((Date.now() - new Date(iso)) / 60000)
  if (min < 1) return 'nå'
  if (min < 60) return `${min} min siden`
  if (min < 1440) return `${Math.round(min / 60)} t siden`
  return `${Math.round(min / 1440)} d siden`
}
</script>

<template>
  <div class="desktop-container">
    <div class="page-header">
      <h1 class="page-header__title">Klubber og kull</h1>
    </div>

    <div v-if="loading" class="px-lg">
      <p class="plattform-empty">Henter…</p>
    </div>

    <template v-else>
      <div class="px-lg plattform-actions">
        <button type="button" class="plattform-primary" :disabled="pending" @click="openNew">
          Nytt kull
        </button>
      </div>

      <div v-for="club in grouped" :key="club.id" class="px-lg plattform-group">
        <h2 class="ds-section-label">
          <img
            v-if="clubLogo(club.fiks_id)"
            class="plattform-merke"
            :src="clubLogo(club.fiks_id)"
            alt=""
            width="18"
            height="18"
            loading="lazy"
            @error="$event.target.style.display = 'none'"
          />
          {{ club.name }} <span class="plattform-muted">· {{ club.short_name }}</span>
        </h2>
        <div class="plattform-list">
          <div v-for="k in club.cohorts" :key="k.id" class="plattform-row">
            <span class="plattform-row__main">
              <span class="plattform-row__name">
                {{ k.name }}<template v-if="memberOf.has(k.id)"> · deg</template>
              </span>
              <span class="plattform-row__meta">
                <template v-if="k.birth_year">
                  {{ k.players_on_pitch }}er · {{ k.period_count }}×{{ k.period_minutes }} min
                </template>
                <template v-else>Venter på treneren</template>
              </span>
            </span>
          </div>
          <p v-if="!club.cohorts.length" class="plattform-empty">Ingen kull.</p>
        </div>
      </div>

      <div v-if="!grouped.length" class="px-lg">
        <p class="plattform-empty">Ingen klubber ennå.</p>
      </div>
    </template>

    <div class="px-lg feil-seksjon">
      <div class="feil-hode">
        <h2 class="ds-section-label">Krasj</h2>
        <button type="button" class="feil-bytt" @click="visKvitterte = !visKvitterte; hentFeil({ inkluderKvitterte: visKvitterte })">
          {{ visKvitterte ? 'Bare ubehandlede' : 'Vis kvitterte også' }}
        </button>
      </div>

      <p v-if="lasterFeil" class="plattform-empty">Henter…</p>
      <p v-else-if="!feil.length" class="plattform-empty">
        Ingenting har krasjet. Det er ikke det samme som at ingenting er galt — en
        knapp som ikke gjør noe krasjer heller ikke.
      </p>

      <div v-for="s in feil" :key="s.fingerprint" class="feil-sak">
        <div class="feil-sak__topp">
          <span class="feil-sak__antall">{{ s.antall }}</span>
          <span class="feil-sak__nar">{{ nårTekst(s.sist) }}</span>
          <span class="feil-sak__rute">{{ s.route }}</span>
        </div>
        <p class="feil-sak__melding">{{ s.message }}</p>
        <details v-if="s.stack" class="feil-sak__stack">
          <summary>Stack</summary>
          <pre>{{ s.stack }}</pre>
        </details>
        <button type="button" class="feil-sak__kvitter" :disabled="kvitterer === s.fingerprint" @click="kvitter(s)">
          {{ kvitterer === s.fingerprint ? 'Kvitterer…' : 'Kvitter ut' }}
        </button>
      </div>
    </div>

    <Sheet :show="open" title="Nytt kull" @close="open = false">
      <div v-if="form" class="plattform-form">
        <label class="plattform-label" for="nk-club">Klubb</label>
        <select id="nk-club" v-model="form.club_id" class="plattform-input">
          <option value="">Ny klubb</option>
          <option v-for="c in clubs" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>

        <template v-if="!form.club_id">
          <!-- Valgt klubb -->
          <template v-if="form.club_name">
            <div class="plattform-valgt">
              <span class="plattform-valgt__navn">{{ form.club_name }}</span>
              <button type="button" class="plattform-tekstknapp" @click="nullstillKlubb">Bytt</button>
            </div>

            <label class="plattform-label" for="nk-club-short">Kortnavn <span class="plattform-muted">slik det står i kampoppsettet</span></label>
            <input id="nk-club-short" v-model="form.club_short_name" type="text" class="plattform-input" autocapitalize="words" />
          </template>

          <!-- Søk på fotball.no -->
          <template v-else-if="!friTekst">
            <label class="plattform-label" for="nk-club-sok">Søk etter klubben på fotball.no</label>
            <input id="nk-club-sok" v-model="sok" type="search" autocomplete="off" class="plattform-input" placeholder="Stag" />

            <p v-if="searching" class="plattform-hint">Søker … korte søkeord kan ta noen sekunder.</p>
            <p v-else-if="sokFeil" class="plattform-hint">{{ sokFeil }}</p>
            <p v-else-if="sok.trim().length >= 2 && !treff.length" class="plattform-hint">Ingen klubber med det navnet.</p>

            <ul v-if="treff.length" class="plattform-treff">
              <li v-for="c in treff" :key="c.fiksId">
                <button type="button" class="plattform-treff__rad" @click="velgKlubb(c)">
                  <span class="plattform-treff__navn">{{ c.name }}</span>
                  <span class="plattform-treff__meta">{{ c.district }} · {{ c.teams.length }} lag</span>
                </button>
              </li>
            </ul>

            <button type="button" class="plattform-tekstknapp" @click="friTekst = true">
              Finner ikke klubben — skriv navnet selv
            </button>
          </template>

          <!-- Utvei: klubben finnes ikke i FIKS -->
          <template v-else>
            <label class="plattform-label" for="nk-club-name">Klubbnavn</label>
            <input id="nk-club-name" v-model="form.club_name" type="text" class="plattform-input" placeholder="Stag IF" autocapitalize="words" />

            <label class="plattform-label" for="nk-club-short">Kortnavn <span class="plattform-muted">slik det står i kampoppsettet</span></label>
            <input id="nk-club-short" v-model="form.club_short_name" type="text" class="plattform-input" :placeholder="form.club_name.split(' ')[0] || 'Stag'" autocapitalize="words" />

            <button type="button" class="plattform-tekstknapp" @click="friTekst = false">Søk på fotball.no likevel</button>
          </template>
        </template>

        <label class="plattform-label" for="nk-season">Første sesong</label>
        <input id="nk-season" v-model="form.season_name" type="text" class="plattform-input" autocapitalize="words" />

        <p class="plattform-hint plattform-note">
          <template v-if="form.fiks_id">
            Klubben er koblet til fotball.no. Treneren velger årskull første gang han logger inn, og
            får lagene og terminlista derfra.
          </template>
          <template v-else>
            Årskull, lag, spillform og terminliste settes av treneren første gang han logger inn.
            Uten kobling til fotball.no må han finne klubben selv.
          </template>
        </p>

        <button type="button" class="plattform-primary plattform-submit" :disabled="pending || !canSubmit" @click="submit">
          {{ pending ? 'Oppretter…' : 'Opprett kull' }}
        </button>
        <p class="plattform-hint">Du blir administrator i kullet. Treneren inviterer du fra Tilgang etterpå.</p>
      </div>
    </Sheet>
  </div>
</template>

<style scoped>
.feil-seksjon { margin-top: var(--ds-space-2xl); }
.feil-hode { display: flex; align-items: baseline; justify-content: space-between; gap: var(--ds-space-md); }
.feil-bytt {
  background: none; border: 0; padding: 0; cursor: pointer;
  font: inherit; font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary);
  text-decoration: underline; text-underline-offset: 3px;
}
.feil-sak {
  margin-top: var(--ds-space-md);
  padding: var(--ds-space-md);
  background: var(--ds-color-surface);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-lg);
}
.feil-sak__topp {
  display: flex; align-items: center; gap: var(--ds-space-sm);
  font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary);
}
.feil-sak__antall {
  font-variant-numeric: tabular-nums; font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
}
.feil-sak__rute { margin-left: auto; font-family: var(--ds-font-mono, monospace); }
.feil-sak__melding {
  margin: var(--ds-space-sm) 0 0;
  font-size: var(--ds-text-base); font-weight: var(--ds-weight-medium);
  overflow-wrap: anywhere;
}
.feil-sak__stack { margin-top: var(--ds-space-sm); font-size: var(--ds-text-sm); }
.feil-sak__stack pre {
  margin: var(--ds-space-xs) 0 0; overflow-x: auto;
  font-size: 11px; line-height: 1.5; color: var(--ds-color-text-secondary);
}
.feil-sak__kvitter {
  margin-top: var(--ds-space-sm); background: none; border: 0; padding: 0; cursor: pointer;
  font: inherit; font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary);
  text-decoration: underline; text-underline-offset: 3px;
}
.plattform-actions {
  margin-bottom: var(--ds-space-lg);
}

.plattform-primary {
  width: 100%;
  padding: var(--ds-space-md);
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-base);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-bg);
  background: var(--ds-color-text-primary);
  border: 1px solid var(--ds-color-text-primary);
  border-radius: var(--ds-radius-md);
  cursor: pointer;
}
.plattform-primary:disabled { opacity: 0.5; cursor: default; }
.plattform-submit { margin-top: var(--ds-space-lg); }

.plattform-group {
  margin-bottom: var(--ds-space-xl);
}

.plattform-list {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
  margin-top: var(--ds-space-sm);
}

.plattform-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-md);
  padding: var(--ds-space-md);
  background: var(--ds-color-surface);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-md);
  box-shadow: var(--ds-shadow-xs);
}

.plattform-row__main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.plattform-row__name {
  font-size: var(--ds-text-base);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
}

.plattform-row__meta {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
}

.plattform-muted {
  font-weight: var(--ds-weight-regular);
  text-transform: none;
  letter-spacing: 0;
  color: var(--ds-color-text-tertiary);
}

.plattform-empty,
.plattform-hint {
  margin: var(--ds-space-xs) 0 0;
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
}

.plattform-form {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-xs);
  padding-bottom: var(--ds-space-md);
}

.plattform-label {
  margin-top: var(--ds-space-sm);
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
}

.plattform-input {
  width: 100%;
  padding: var(--ds-space-md);
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-base);
  color: var(--ds-color-text-primary);
  background: var(--ds-color-bg-elevated);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-md);
  resize: vertical;
}

.plattform-note {
  margin-top: var(--ds-space-md);
}

.plattform-merke {
  width: 18px;
  height: 18px;
  object-fit: contain;
  vertical-align: -3px;
  margin-right: 4px;
}

.plattform-valgt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-sm);
  padding: var(--ds-space-md);
  background: var(--ds-color-bg-elevated);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-md);
}

.plattform-valgt__navn {
  font-size: var(--ds-text-base);
  font-weight: var(--ds-weight-semibold);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plattform-tekstknapp {
  align-self: flex-start;
  min-height: 44px;
  padding: var(--ds-space-xs) 0;
  background: none;
  border: 0;
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
  cursor: pointer;
}

.plattform-treff {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-xs);
}

.plattform-treff__rad {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--ds-space-md);
  text-align: left;
  background: var(--ds-color-bg-elevated);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-md);
  cursor: pointer;
}

.plattform-treff__navn {
  font-size: var(--ds-text-base);
  color: var(--ds-color-text-primary);
}

.plattform-treff__meta {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
}
</style>
