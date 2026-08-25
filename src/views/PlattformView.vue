<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase, isSupabaseConfigured } from '../supabase'
import { useAuth } from '../stores/auth'
import { useToast } from '../composables/useToast'
import { PLAYERS_ON_PITCH_OPTIONS } from '../lib/formations'
import Sheet from '../components/Sheet.vue'

// Plattform-nivå: klubber og kull. Veiviseren bak et nytt kull.
//
// Alt skrives av bb_create_cohort i én transaksjon: klubb (om ny) → kull →
// lag → sesong → den som oppretter blir admin. Etterpå står kullet i
// kull-velgeren på /admin, og /admin/tilgang er stedet man inviterer den
// første treneren.

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
// NFF-defaultene per alder. Forslag — alt kan endres.
function formatFor(birthYear) {
  const y = parseInt(birthYear, 10)
  if (!y) return null
  const age = new Date().getFullYear() - y
  if (age <= 7) return 3
  if (age <= 9) return 5
  if (age <= 11) return 7
  if (age <= 12) return 9
  return 11
}
const PERIODS = { 3: [2, 15], 5: [2, 20], 7: [2, 30], 9: [2, 30], 11: [2, 35] }

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
    name: '',
    birth_year: '',
    players_on_pitch: 7,
    period_count: 2,
    period_minutes: 30,
    teams: '',
    season_name: defaultSeasonName()
  }
  open.value = true
}

// Årskull → spillform → kamplengde. Hver følger den over, til man rører den.
watch(() => form.value?.birth_year, y => {
  if (!form.value) return
  const f = formatFor(y)
  if (f) form.value.players_on_pitch = f
})
watch(() => form.value?.players_on_pitch, n => {
  if (!form.value) return
  const p = PERIODS[n]
  if (p) [form.value.period_count, form.value.period_minutes] = p
})
// Kullnavn foreslås fra klubb + årskull («Stag G2018»). Overskrives fritt.
watch(() => [form.value?.club_id, form.value?.club_name, form.value?.birth_year], () => {
  if (!form.value || form.value.nameTouched) return
  const club = form.value.club_id
    ? clubs.value.find(c => c.id === form.value.club_id)?.short_name
    : (form.value.club_short_name || form.value.club_name.split(' ')[0])
  const y = form.value.birth_year
  form.value.name = club && y ? `${club} G${y}` : ''
})

const ACCENTS = ['sage', 'warm', 'paper', 'sky', 'cornflower', 'olive', 'peach']

const teamList = computed(() =>
  (form.value?.teams || '')
    .split(/[,\n]/)
    .map(s => s.trim())
    .filter(Boolean)
    .map((name, i) => ({ name, accent: ACCENTS[i % ACCENTS.length] }))
)

const canSubmit = computed(() => {
  const f = form.value
  if (!f) return false
  if (!f.name.trim()) return false
  if (!f.club_id && !f.club_name.trim()) return false
  return true
})

async function submit() {
  const f = form.value
  pending.value = true
  const { data, error } = await supabase.rpc('bb_create_cohort', {
    p_club_id: f.club_id || null,
    p_club_name: f.club_id ? null : f.club_name.trim(),
    p_club_short_name: f.club_id ? null : (f.club_short_name.trim() || null),
    p_name: f.name.trim(),
    p_slug: null,
    p_birth_year: parseInt(f.birth_year, 10) || null,
    p_players_on_pitch: Number(f.players_on_pitch),
    p_period_count: Number(f.period_count),
    p_period_minutes: Number(f.period_minutes),
    p_teams: teamList.value,
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
  showToast(`${f.name.trim()} er opprettet`, 'success')
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
                {{ k.players_on_pitch }}er · {{ k.period_count }}×{{ k.period_minutes }} min
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

        <label class="plattform-label" for="nk-year">Årskull</label>
        <input id="nk-year" v-model="form.birth_year" type="number" inputmode="numeric" class="plattform-input" placeholder="2018" min="2005" :max="new Date().getFullYear()" />

        <label class="plattform-label" for="nk-name">Kullets navn</label>
        <input id="nk-name" v-model="form.name" type="text" class="plattform-input" placeholder="Stag G2018" autocapitalize="words" @input="form.nameTouched = true" />

        <label class="plattform-label" for="nk-format">Spillform</label>
        <select id="nk-format" v-model="form.players_on_pitch" class="plattform-input">
          <option v-for="n in PLAYERS_ON_PITCH_OPTIONS" :key="n" :value="n">{{ n }}er</option>
        </select>

        <div class="plattform-pair">
          <div class="plattform-pair__half">
            <label class="plattform-label" for="nk-periods">Omganger</label>
            <input id="nk-periods" v-model="form.period_count" type="number" inputmode="numeric" min="1" max="4" class="plattform-input" />
          </div>
          <div class="plattform-pair__half">
            <label class="plattform-label" for="nk-minutes">Minutter per omgang</label>
            <input id="nk-minutes" v-model="form.period_minutes" type="number" inputmode="numeric" min="5" max="45" class="plattform-input" />
          </div>
        </div>

        <label class="plattform-label" for="nk-teams">Lag <span class="plattform-muted">ett per linje, eller komma</span></label>
        <textarea id="nk-teams" v-model="form.teams" rows="3" class="plattform-input" placeholder="Stag 1&#10;Stag 2"></textarea>
        <p v-if="teamList.length" class="plattform-hint">
          {{ teamList.map(t => t.name).join(' · ') }}
        </p>

        <label class="plattform-label" for="nk-season">Første sesong</label>
        <input id="nk-season" v-model="form.season_name" type="text" class="plattform-input" autocapitalize="words" />

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

.plattform-pair {
  display: flex;
  gap: var(--ds-space-sm);
}

.plattform-pair__half {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-xs);
  min-width: 0;
}
</style>
