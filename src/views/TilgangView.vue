<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { useAuth } from '../stores/auth'
import { useToast } from '../composables/useToast'
import { useSeasonTeams } from '../composables/useSeasonTeams'
import { useSeasons } from '../composables/useSeasons'
import Sheet from '../components/Sheet.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'

const { activeCohort, isAdmin, isPlatformAdmin, coach } = useAuth()
const { show: showToast } = useToast()
const { seasonTeams, fetchSeasonTeams } = useSeasonTeams()
const { activeSeason, fetchSeasons } = useSeasons()

const members = ref([])
const allowCoachInvites = ref(false)
const loading = ref(true)
// Hvilken handling som pågår, ikke bare AT noe pågår. Med et felles
// boolean-flagg sa «Send»-knappen «Sender…» mens man bare lagret e-posten —
// altså at en e-post var på vei når ingenting ble sendt.
const pending = ref('')
const busy = computed(() => !!pending.value)

// Å endre roller og fjerne tilgang er admin-arbeid. En trener som har fått
// invitere skal ikke kunne gi bort kullet.
const canManage = computed(() => isAdmin.value || isPlatformAdmin.value)
const canInvite = computed(() => canManage.value || allowCoachInvites.value)

const ROLE_LABELS = { admin: 'Administrator', coach: 'Trener', parent: 'Forelder' }

function teamName(slug) {
  return slug ? (seasonTeams.value.find(t => t.slug === slug)?.name || null) : null
}
const GROUPS = [
  { role: 'admin', title: 'Administratorer' },
  { role: 'coach', title: 'Trenere' },
  { role: 'parent', title: 'Foreldre' }
]

const grouped = computed(() =>
  GROUPS.map(g => ({
    ...g,
    rows: members.value.filter(m => m.role === g.role)
  })).filter(g => g.rows.length)
)

function daysSince(iso) {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  return Math.floor(ms / 86400000)
}

// Supabase sier ALDRI fra at en e-post bouncet. Det eneste signalet er at en
// invitasjon aldri blir til en innlogging — så alderen på invitasjonen må stå
// synlig, ellers kan man ikke skille «har ikke rukket det» fra «kom aldri fram».
function statusLine(m) {
  if (m.status === 'revoked') return 'Tilgang fjernet'
  if (m.status === 'active') return 'Aktiv'
  // Uten e-post kan ingen invitasjon ha blitt sendt. Radene som ble seedet i
  // fase 2 fikk `invited_at` fra kolonnens default, og ville ellers påstått
  // «sendt i dag» om noe som aldri er sendt — på selve skjermen som skal
  // svare på om invitasjonen kom fram.
  if (!m.email) return 'Mangler e-post'
  // invited_at er null til en invitasjon faktisk er sendt.
  if (!m.invited_at) return 'Ikke invitert ennå'
  const d = daysSince(m.invited_at)
  if (d === 0) return 'Invitert · sendt i dag'
  if (d === 1) return 'Invitert · sendt i går'
  return `Invitert · sendt for ${d} dager siden`
}

function statusTone(m) {
  if (m.status === 'revoked') return 'muted'
  if (m.status === 'active') return 'ok'
  if (!m.email) return 'warn'
  if (!m.invited_at) return 'pending'
  return daysSince(m.invited_at) >= 3 ? 'warn' : 'pending'
}

async function load() {
  if (!isSupabaseConfigured || !activeCohort.value) {
    loading.value = false
    return
  }
  const [memberRes, cohortRes] = await Promise.all([
    supabase
      .from('cohort_members')
      .select('id, name, email, role, status, coach_id, preferred_team, invited_at, profile_id')
      .eq('cohort_id', activeCohort.value.id)
      .order('name'),
    supabase
      .from('cohorts')
      .select('allow_coach_invites')
      .eq('id', activeCohort.value.id)
      .maybeSingle()
  ])

  if (memberRes.error) {
    showToast('Kunne ikke hente medlemmene', 'error')
  } else {
    members.value = memberRes.data || []
  }
  allowCoachInvites.value = !!cohortRes.data?.allow_coach_invites

  await fetchSeasons()
  await fetchSeasonTeams(activeCohort.value.id, activeSeason.value?.id)
  loading.value = false
}

async function call(body, kind = 'work') {
  pending.value = kind
  const { data, error } = await supabase.functions.invoke('member-admin', { body })
  pending.value = ''

  // En feil fra funksjonen kommer som HTTP 4xx, og supabase-js pakker den i
  // FunctionsHttpError uten meldingen. Den må leses ut av responsen.
  if (error) {
    let msg = 'Noe gikk galt'
    try { msg = (await error.context?.json())?.error || msg } catch { /* behold fallback */ }
    showToast(msg, 'error')
    return null
  }
  if (data?.error) {
    showToast(data.error, 'error')
    return null
  }
  return data
}

// ---- Inviter ----
const inviteOpen = ref(false)
const form = ref({ name: '', email: '', role: 'coach', preferred_team: '' })

function openInvite() {
  form.value = { name: '', email: '', role: 'coach', preferred_team: '' }
  inviteOpen.value = true
}

async function submitInvite() {
  const res = await call({
    action: 'invite',
    cohort_id: activeCohort.value.id,
    name: form.value.name,
    email: form.value.email,
    role: form.value.role,
    preferred_team: form.value.preferred_team || null
  }, 'send')
  if (!res) return
  inviteOpen.value = false
  showToast(res.note || `Invitasjon sendt til ${form.value.email.trim()}`, res.note ? 'error' : 'success', res.note ? 0 : 3000)
  await load()
}

// ---- Rad-handlinger ----
const selected = ref(null)

// De fire trenerne fra fase 2 ligger inne uten e-post. Da skal man trykke på
// raden og fylle den ut — ikke gå via «Inviter noen» og treffe navnet riktig.
const emailDraft = ref('')

function openRow(m) {
  if (!canInvite.value) return
  emailDraft.value = ''
  selected.value = m
}

async function saveEmail() {
  const m = selected.value
  const email = emailDraft.value.trim()
  if (!email) return
  selected.value = null
  if (await call({ action: 'set_email', member_id: m.id, email }, 'save')) {
    showToast(`E-post lagret for ${m.name}`)
    await load()
  }
}

async function sendInvite() {
  const m = selected.value
  const email = emailDraft.value.trim()
  if (!email) return
  selected.value = null
  const res = await call({ action: 'send_invite', member_id: m.id, email }, 'send')
  if (res) {
    // note settes når invitasjonen gikk ut, men kontoen ikke ble bekreftet —
    // da er lenken eneste vei inn, og det må sies.
    showToast(res.note || `Invitasjon sendt til ${email}`, res.note ? 'error' : 'success', res.note ? 0 : 3000)
    await load()
  }
}

async function resend() {
  const m = selected.value
  selected.value = null
  const res = await call({ action: 'resend', member_id: m.id }, 'send')
  if (res) {
    showToast(res.note || `Sendt på nytt til ${m.email}`, res.note ? 'error' : 'success', res.note ? 0 : 3000)
    await load()
  }
}

async function setRole(role) {
  const m = selected.value
  selected.value = null
  if (await call({ action: 'set_role', member_id: m.id, role })) {
    showToast(`${m.name} er nå ${ROLE_LABELS[role].toLowerCase()}`)
    await load()
  }
}

async function setTeam(slug) {
  const m = selected.value
  selected.value = null
  if (await call({ action: 'set_team', member_id: m.id, team: slug })) {
    showToast(slug ? `${m.name} står nå på ${teamName(slug)}` : `${m.name} står ikke på noe lag`)
    await load()
  }
}

const confirmRevoke = ref(null)

function askRevoke() {
  confirmRevoke.value = selected.value
  selected.value = null
}

async function doRevoke() {
  const m = confirmRevoke.value
  confirmRevoke.value = null
  if (await call({ action: 'revoke', member_id: m.id })) {
    showToast(`Tilgangen til ${m.name} er fjernet`)
    await load()
  }
}

onMounted(load)
</script>

<template>
  <div class="desktop-container">
    <div class="page-header">
      <h1 class="page-header__title">Tilgang</h1>
    </div>

    <div v-if="loading" class="px-lg">
      <p class="tilgang-empty">Henter…</p>
    </div>

    <template v-else>
      <div v-if="canInvite" class="px-lg tilgang-actions">
        <button type="button" class="tilgang-invite" :disabled="busy" @click="openInvite">
          Inviter noen
        </button>
      </div>

      <div v-for="group in grouped" :key="group.role" class="px-lg tilgang-group">
        <h2 class="ds-section-label">{{ group.title }}</h2>
        <div class="tilgang-list">
          <component
            :is="canInvite ? 'button' : 'div'"
            v-for="m in group.rows"
            :key="m.id"
            type="button"
            class="tilgang-row"
            :class="{ 'tilgang-row--revoked': m.status === 'revoked' }"
            @click="openRow(m)"
          >
            <span class="tilgang-row__main">
              <span class="tilgang-row__name">
                {{ m.name }}<template v-if="coach?.id && m.coach_id === coach.id"> · deg</template>
                <span v-if="m.role !== 'parent' && teamName(m.preferred_team)" class="tilgang-row__team">{{ teamName(m.preferred_team) }}</span>
              </span>
              <span class="tilgang-row__email">{{ m.email || 'ingen e-post' }}</span>
            </span>
            <span class="tilgang-row__status" :data-tone="statusTone(m)">{{ statusLine(m) }}</span>
          </component>
        </div>
      </div>

      <div v-if="!grouped.length" class="px-lg">
        <p class="tilgang-empty">Ingen medlemmer i kullet ennå.</p>
      </div>
    </template>

    <!-- Inviter -->
    <Sheet :show="inviteOpen" title="Inviter" @close="inviteOpen = false">
      <div class="tilgang-form">
        <label class="tilgang-label" for="inv-name">Navn</label>
        <input id="inv-name" v-model="form.name" type="text" class="tilgang-input" autocapitalize="words" />

        <label class="tilgang-label" for="inv-email">E-post</label>
        <input id="inv-email" v-model="form.email" type="email" inputmode="email" autocapitalize="off" spellcheck="false" class="tilgang-input" />

        <label class="tilgang-label" for="inv-role">Rolle</label>
        <select id="inv-role" v-model="form.role" class="tilgang-input">
          <option value="coach">Trener</option>
          <option value="parent">Forelder</option>
          <option v-if="canManage" value="admin">Administrator</option>
        </select>

        <label v-if="form.role !== 'parent'" class="tilgang-label" for="inv-team">Lag</label>
        <select v-if="form.role !== 'parent'" id="inv-team" v-model="form.preferred_team" class="tilgang-input">
          <option value="">Ingen</option>
          <option v-for="t in seasonTeams" :key="t.slug" :value="t.slug">{{ t.name }}</option>
        </select>

        <button
          type="button"
          class="tilgang-submit"
          :disabled="busy || !form.name.trim() || !form.email.trim()"
          @click="submitInvite"
        >
          {{ pending === 'send' ? 'Sender…' : 'Send invitasjon' }}
        </button>
      </div>
    </Sheet>

    <!-- Rad-handlinger -->
    <Sheet :show="!!selected" :title="selected?.name || ''" @close="selected = null">
      <div v-if="selected" class="tilgang-actions-sheet">
        <p class="tilgang-sheet-status">{{ statusLine(selected) }}</p>

        <!-- Uten e-post er det ingenting å sende på nytt — da er dette
             stedet man legger den inn. -->
        <template v-if="selected.status !== 'revoked'">
          <label class="tilgang-sheet-label" for="row-email">E-post</label>
          <input
            id="row-email"
            v-model="emailDraft"
            type="email"
            inputmode="email"
            autocapitalize="off"
            spellcheck="false"
            class="tilgang-input"
            :placeholder="selected.email || ''"
          />
          <div class="tilgang-pair">
            <button
              type="button"
              class="tilgang-action tilgang-pair__half"
              :disabled="busy || !emailDraft.trim()"
              @click="saveEmail"
            >
              {{ pending === 'save' ? 'Lagrer…' : 'Lagre' }}
            </button>
            <button
              type="button"
              class="tilgang-submit tilgang-pair__half tilgang-submit--tight"
              :disabled="busy || (!emailDraft.trim() && !selected.email)"
              @click="emailDraft.trim() ? sendInvite() : resend()"
            >
              {{ pending === 'send' ? 'Sender…' : (selected.invited_at ? 'Send på nytt' : 'Send') }}
            </button>
          </div>
        </template>

        <template v-if="canManage && selected.status !== 'revoked'">
          <button
            v-for="r in ['admin', 'coach', 'parent'].filter(r => r !== selected.role)"
            :key="r"
            type="button"
            class="tilgang-action"
            :disabled="busy"
            @click="setRole(r)"
          >
            Gjør til {{ ROLE_LABELS[r].toLowerCase() }}
          </button>

          <template v-if="selected.role !== 'parent'">
            <p class="tilgang-sheet-label">Lag</p>
            <div class="tilgang-teams">
              <button
                v-for="t in seasonTeams"
                :key="t.slug"
                type="button"
                class="tilgang-team"
                :class="{ 'tilgang-team--on': selected.preferred_team === t.slug }"
                :disabled="busy"
                @click="setTeam(t.slug)"
              >{{ t.name }}</button>
              <button
                type="button"
                class="tilgang-team"
                :class="{ 'tilgang-team--on': !selected.preferred_team }"
                :disabled="busy"
                @click="setTeam(null)"
              >Ingen</button>
            </div>
          </template>

          <button type="button" class="tilgang-action tilgang-action--danger" :disabled="busy" @click="askRevoke">
            Fjern tilgang
          </button>
        </template>
      </div>
    </Sheet>

    <ConfirmDialog
      :show="!!confirmRevoke"
      title="Fjern tilgang"
      :message="confirmRevoke ? `${confirmRevoke.name} mister tilgangen til BenchBoss. Utlegg og kamper som er registrert består.` : ''"
      confirm-label="Fjern tilgang"
      @confirm="doRevoke"
      @cancel="confirmRevoke = null"
    />
  </div>
</template>

<style scoped>
.tilgang-actions {
  margin-bottom: var(--ds-space-lg);
}

.tilgang-invite {
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

.tilgang-group {
  margin-bottom: var(--ds-space-xl);
}

.tilgang-list {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
  margin-top: var(--ds-space-sm);
}

.tilgang-row {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-md);
  padding: var(--ds-space-md);
  text-align: left;
  background: var(--ds-color-surface);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-md);
  box-shadow: var(--ds-shadow-xs);
  font-family: var(--ds-font-body);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.tilgang-row--revoked { opacity: 0.55; }

.tilgang-row__main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.tilgang-row__name {
  font-size: var(--ds-text-base);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
}

.tilgang-row__email {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tilgang-row__status {
  flex-shrink: 0;
  font-size: var(--ds-text-xs);
  text-align: right;
  color: var(--ds-color-text-secondary);
}

.tilgang-row__status[data-tone="ok"] { color: var(--ds-color-text-tertiary); }
.tilgang-row__status[data-tone="warn"] { color: var(--ds-color-error); }
.tilgang-row__status[data-tone="muted"] { color: var(--ds-color-text-tertiary); }

.tilgang-empty {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
}

/* ---- Skjema ---- */
.tilgang-form {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-xs);
  padding-bottom: var(--ds-space-md);
}

.tilgang-label {
  margin-top: var(--ds-space-sm);
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
}

.tilgang-optional {
  color: var(--ds-color-text-tertiary);
}

.tilgang-input {
  width: 100%;
  padding: var(--ds-space-md);
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-base);
  color: var(--ds-color-text-primary);
  background: var(--ds-color-bg-elevated);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-md);
}

.tilgang-submit {
  margin-top: var(--ds-space-lg);
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

.tilgang-submit:disabled { opacity: 0.5; cursor: default; }

.tilgang-submit--tight { margin-top: 0; }

.tilgang-pair {
  display: flex;
  gap: var(--ds-space-sm);
  margin-top: var(--ds-space-sm);
}

.tilgang-pair__half {
  flex: 1;
  text-align: center;
}

/* ---- Handlinger ---- */
.tilgang-actions-sheet {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
  padding-bottom: var(--ds-space-md);
}

.tilgang-sheet-status {
  margin: 0 0 var(--ds-space-sm);
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
}

.tilgang-action {
  width: 100%;
  padding: var(--ds-space-md);
  text-align: left;
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-base);
  color: var(--ds-color-text-primary);
  background: var(--ds-color-bg-elevated);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-md);
  cursor: pointer;
}

.tilgang-sheet-label {
  margin: var(--ds-space-sm) 0 0;
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
}

.tilgang-teams {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ds-space-sm);
}

.tilgang-team {
  flex: 1 1 auto;
  padding: var(--ds-space-sm) var(--ds-space-md);
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-primary);
  background: var(--ds-color-bg-elevated);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-md);
  cursor: pointer;
}

.tilgang-team--on {
  border-color: var(--ds-color-text-primary);
  font-weight: var(--ds-weight-semibold);
}

.tilgang-row__team {
  margin-left: 6px;
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-tertiary);
}

.tilgang-action--danger { color: var(--ds-color-error); }
.tilgang-action:disabled { opacity: 0.5; cursor: default; }
</style>
