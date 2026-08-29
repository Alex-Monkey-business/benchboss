<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase, isSupabaseConfigured } from '../supabase'
import { useAuth } from '../stores/auth'
import { useToast } from '../composables/useToast'
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

const router = useRouter()
const { isPlatformAdmin, memberships, refreshMember, setActiveCohort } = useAuth()
const { show: showToast } = useToast()

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
    supabase.from('clubs').select('id, name, short_name, slug').order('name'),
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
    season_name: defaultSeasonName()
  }
  open.value = true
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

  open.value = false
  // Medlemskapet finnes nå — hent det, gå inn i kullet, og rett til Tilgang
  // der den første treneren inviteres.
  await refreshMember()
  setActiveCohort(data)
  showToast('Kullet er opprettet', 'success')
  router.push('/admin/tilgang')
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
        <h2 class="ds-section-label">{{ club.name }} <span class="plattform-muted">· {{ club.short_name }}</span></h2>
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

    <Sheet :show="open" title="Nytt kull" @close="open = false">
      <div v-if="form" class="plattform-form">
        <label class="plattform-label" for="nk-club">Klubb</label>
        <select id="nk-club" v-model="form.club_id" class="plattform-input">
          <option value="">Ny klubb</option>
          <option v-for="c in clubs" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>

        <template v-if="!form.club_id">
          <label class="plattform-label" for="nk-club-name">Klubbnavn</label>
          <input id="nk-club-name" v-model="form.club_name" type="text" class="plattform-input" placeholder="Stag IF" autocapitalize="words" />

          <label class="plattform-label" for="nk-club-short">Kortnavn <span class="plattform-muted">slik det står i kampoppsettet</span></label>
          <input id="nk-club-short" v-model="form.club_short_name" type="text" class="plattform-input" :placeholder="form.club_name.split(' ')[0] || 'Stag'" autocapitalize="words" />
        </template>

        <label class="plattform-label" for="nk-season">Første sesong</label>
        <input id="nk-season" v-model="form.season_name" type="text" class="plattform-input" autocapitalize="words" />

        <p class="plattform-hint plattform-note">
          Årskull, lag, spillform og terminliste settes av treneren første gang han logger inn.
          Alt hentes fra fotball.no.
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
</style>
