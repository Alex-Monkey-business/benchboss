<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { supabase, isSupabaseConfigured } from '../../supabase'
import { useAuth } from '../../stores/auth'
import { useOnboarding } from '../../composables/useOnboarding'
import { usePlayers } from '../../composables/usePlayers'
import { useSeasonTeams } from '../../composables/useSeasonTeams'
import { useToast } from '../../composables/useToast'
import { parsePlayerList, parsePlayerWorkbook } from '../../lib/playerList'
import Sheet from '../Sheet.vue'

// Kortene på Hjem som fyller et tomt kull. Hvert kort er ett steg, og
// forsvinner når steget er gjort. Rekkefølgen er rekkefølgen jobben gjøres i:
// lag → spillere → trenere → kampprogram.

const { activeCohort } = useAuth()
const { seasonTeams } = useSeasonTeams()
const { addPlayer } = usePlayers()
const { show: showToast } = useToast()
const {
  teamsDone, playersDone, coachesDone, matchesDone, canManageMembers,
  memberCount, activeSeason, load, addTeam, renameTeam, removeTeam
} = useOnboarding()

onMounted(load)

const cohortName = computed(() => activeCohort.value?.name || 'kullet')

// Tallene teller det som GJENSTÅR, ikke steg i en plan: «2, 4» etter at 1 og 3
// er gjort ser ut som noe mangler.
const stepNo = computed(() => {
  const order = [
    ['teams', !teamsDone.value],
    ['players', !playersDone.value],
    ['coaches', !coachesDone.value && canManageMembers.value],
    ['matches', !matchesDone.value]
  ].filter(([, shown]) => shown).map(([k]) => k)
  return Object.fromEntries(order.map((k, i) => [k, i + 1]))
})

// ---------------------------------------------------------------- Lag
const teamsOpen = ref(false)
const newTeam = ref('')
const drafts = ref({})   // teamId -> navn under redigering
const busy = ref(false)

watch(teamsOpen, open => {
  if (open) drafts.value = Object.fromEntries(seasonTeams.value.map(t => [t.id, t.name]))
})

async function guard(fn, fallback = 'Noe gikk galt') {
  busy.value = true
  try {
    await fn()
  } catch (e) {
    const msg = /restrict|foreign key/i.test(e?.message || '')
      ? 'Laget har spillere. Flytt dem først.'
      : (e?.message || fallback)
    showToast(msg, 'error')
  } finally {
    busy.value = false
  }
}

async function submitTeam() {
  const name = newTeam.value.trim()
  if (!name) return
  await guard(async () => {
    await addTeam(name)
    newTeam.value = ''
  })
}

async function saveTeam(t) {
  const name = (drafts.value[t.id] || '').trim()
  if (!name || name === t.name) return
  await guard(() => renameTeam(t.id, name))
}

async function deleteTeam(t) {
  await guard(() => removeTeam(t.id))
}

// ---------------------------------------------------------------- Spillere
const playersOpen = ref(false)
const pasted = ref('')
const parsed = ref([])           // [{ name, team }]
const importing = ref(false)
const fileInput = ref(null)

const defaultTeam = computed(() => seasonTeams.value.length === 1 ? seasonTeams.value[0].slug : '')

watch(pasted, text => {
  const names = parsePlayerList(text)
  const existing = new Map(parsed.value.map(p => [p.name.toLowerCase(), p.team]))
  parsed.value = names.map(name => ({ name, team: existing.get(name.toLowerCase()) ?? defaultTeam.value }))
})

async function pickFile(e) {
  const file = e.target.files?.[0]
  if (!file) return
  try {
    const names = await parsePlayerWorkbook(file)
    if (!names.length) {
      showToast('Fant ingen navn i filen', 'error')
      return
    }
    pasted.value = names.join('\n')
  } catch {
    showToast('Kunne ikke lese filen', 'error')
  } finally {
    e.target.value = ''
  }
}

function cycleTeam(p) {
  const slugs = ['', ...seasonTeams.value.map(t => t.slug)]
  const i = slugs.indexOf(p.team)
  p.team = slugs[(i + 1) % slugs.length]
}

function teamName(slug) {
  return seasonTeams.value.find(t => t.slug === slug)?.name || 'Uten lag'
}

async function importPlayers() {
  if (!parsed.value.length) return
  importing.value = true
  let ok = 0
  for (const p of parsed.value) {
    const row = await addPlayer(p.name, p.team || null)
    if (row) ok++
  }
  importing.value = false
  playersOpen.value = false
  pasted.value = ''
  parsed.value = []
  showToast(ok === 1 ? '1 spiller lagt inn' : `${ok} spillere lagt inn`, ok ? 'success' : 'error')
}

// ---------------------------------------------------------------- Trenere
const coachOpen = ref(false)
const invite = ref({ name: '', email: '', team: '' })
const sending = ref(false)

async function sendInvite() {
  if (!isSupabaseConfigured) return
  sending.value = true
  const { data, error } = await supabase.functions.invoke('member-admin', {
    body: {
      action: 'invite',
      cohort_id: activeCohort.value.id,
      name: invite.value.name.trim(),
      email: invite.value.email.trim(),
      role: 'coach',
      preferred_team: invite.value.team || null
    }
  })
  sending.value = false
  if (error || data?.error) {
    let msg = data?.error || 'Kunne ikke sende invitasjonen'
    try { msg = (await error?.context?.json())?.error || msg } catch { /* behold */ }
    showToast(msg, 'error')
    return
  }
  showToast(data?.note || `Invitasjon sendt til ${invite.value.email.trim()}`, data?.note ? 'error' : 'success', data?.note ? 0 : 3000)
  invite.value = { name: '', email: '', team: '' }
  if (memberCount.value !== null) memberCount.value++
}
</script>

<template>
  <section class="onb">
    <h2 class="onb__kicker">Kom i gang med {{ cohortName }}</h2>

    <!-- 1. Lag -->
    <button v-if="!teamsDone" type="button" class="ds-card ds-card--interactive onb-card" @click="teamsOpen = true">
      <span class="onb-card__step">{{ stepNo.teams }}</span>
      <span class="onb-card__body">
        <span class="onb-card__title">Sett opp lagene</span>
        <span class="onb-card__lead">Ett eller flere. Spillerne fordeles på dem etterpå.</span>
      </span>
      <svg class="onb-card__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
    </button>

    <!-- 2. Spillere -->
    <button v-if="!playersDone" type="button" class="ds-card ds-card--interactive onb-card" :disabled="!teamsDone" @click="playersOpen = true">
      <span class="onb-card__step">{{ stepNo.players }}</span>
      <span class="onb-card__body">
        <span class="onb-card__title">Legg inn spillerne</span>
        <span class="onb-card__lead">Lim inn lista fra Spond eller et regneark — én per linje.</span>
      </span>
      <svg class="onb-card__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
    </button>

    <!-- 3. Trenere -->
    <button v-if="!coachesDone && canManageMembers" type="button" class="ds-card ds-card--interactive onb-card" @click="coachOpen = true">
      <span class="onb-card__step">{{ stepNo.coaches }}</span>
      <span class="onb-card__body">
        <span class="onb-card__title">Inviter trenerne</span>
        <span class="onb-card__lead">De får en e-post og logger inn med koden i den.</span>
      </span>
      <svg class="onb-card__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
    </button>

    <!-- 4. Kampprogram -->
    <router-link v-if="!matchesDone" to="/admin/sesong-kamper" class="ds-card ds-card--interactive onb-card" :class="{ 'onb-card--muted': !playersDone }">
      <span class="onb-card__step">{{ stepNo.matches }}</span>
      <span class="onb-card__body">
        <span class="onb-card__title">Last opp kampprogrammet</span>
        <span class="onb-card__lead">Excel-fila fra kretsen{{ activeSeason ? ` → ${activeSeason.name}` : '' }}. Da våkner Hjem.</span>
      </span>
      <svg class="onb-card__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
    </router-link>

    <!-- Lag -->
    <Sheet :show="teamsOpen" title="Lag" @close="teamsOpen = false">
      <div class="onb-form">
        <div v-for="t in seasonTeams" :key="t.id" class="onb-team">
          <input v-model="drafts[t.id]" class="ds-input" :aria-label="`Navn på ${t.name}`" @blur="saveTeam(t)" @keydown.enter="saveTeam(t)" />
          <button type="button" class="onb-team__remove" :disabled="busy" aria-label="Fjern lag" @click="deleteTeam(t)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div class="onb-team onb-team--new">
          <input v-model="newTeam" class="ds-input" :placeholder="seasonTeams.length ? 'Nytt lag' : `${activeCohort?.club_name?.split(' ')[0] || 'Lag'} 1`" @keydown.enter="submitTeam" />
          <button type="button" class="ds-btn ds-btn--primary" :disabled="busy || !newTeam.trim()" @click="submitTeam">Legg til</button>
        </div>

        <p class="onb-hint">Navnet bør stå slik det står i kampoppsettet fra kretsen, så kampene finner laget sitt.</p>

        <div class="onb-actions">
          <button type="button" class="ds-btn ds-btn--primary" :disabled="!seasonTeams.length" @click="teamsOpen = false">Ferdig</button>
        </div>
      </div>
    </Sheet>

    <!-- Spillere -->
    <Sheet :show="playersOpen" title="Spillere" @close="playersOpen = false">
      <div class="onb-form">
        <label class="ds-label" for="onb-paste">Lim inn lista</label>
        <textarea id="onb-paste" v-model="pasted" class="ds-input onb-paste" rows="6" placeholder="Ola Nordmann&#10;Kari Nordmann&#10;…"></textarea>
        <div class="onb-file">
          <button type="button" class="ds-btn ds-btn--secondary" @click="fileInput?.click()">Eller velg Excel-fil</button>
          <input ref="fileInput" type="file" accept=".xlsx,.xls,.csv" hidden @change="pickFile" />
        </div>

        <template v-if="parsed.length">
          <p class="ds-label">{{ parsed.length }} {{ parsed.length === 1 ? 'spiller' : 'spillere' }}<span v-if="seasonTeams.length > 1"> · trykk på laget for å bytte</span></p>
          <ul class="onb-players">
            <li v-for="p in parsed" :key="p.name" class="onb-player">
              <span class="onb-player__name">{{ p.name }}</span>
              <button v-if="seasonTeams.length" type="button" class="onb-player__team" :class="{ 'onb-player__team--none': !p.team }" @click="cycleTeam(p)">{{ teamName(p.team) }}</button>
            </li>
          </ul>
        </template>

        <div class="onb-actions">
          <button type="button" class="ds-btn ds-btn--secondary" @click="playersOpen = false">Avbryt</button>
          <button type="button" class="ds-btn ds-btn--primary" :disabled="importing || !parsed.length" @click="importPlayers">
            {{ importing ? 'Legger inn…' : `Legg inn ${parsed.length || ''}`.trim() }}
          </button>
        </div>
      </div>
    </Sheet>

    <!-- Trenere -->
    <Sheet :show="coachOpen" title="Inviter trener" @close="coachOpen = false">
      <div class="onb-form">
        <label class="ds-label" for="onb-c-name">Navn</label>
        <input id="onb-c-name" v-model="invite.name" class="ds-input" autocapitalize="words" />
        <label class="ds-label" for="onb-c-email">E-post</label>
        <input id="onb-c-email" v-model="invite.email" type="email" inputmode="email" autocapitalize="off" spellcheck="false" class="ds-input" />
        <label class="ds-label ds-label--optional" for="onb-c-team">Lag</label>
        <select id="onb-c-team" v-model="invite.team" class="ds-input">
          <option value="">Ingen</option>
          <option v-for="t in seasonTeams" :key="t.slug" :value="t.slug">{{ t.name }}</option>
        </select>
        <div class="onb-actions">
          <button type="button" class="ds-btn ds-btn--secondary" @click="coachOpen = false">Ferdig</button>
          <button type="button" class="ds-btn ds-btn--primary" :disabled="sending || !invite.name.trim() || !invite.email.trim()" @click="sendInvite">
            {{ sending ? 'Sender…' : 'Send invitasjon' }}
          </button>
        </div>
        <p class="onb-hint">Flere trenere? Send én, så står skjemaet klart til neste.</p>
      </div>
    </Sheet>
  </section>
</template>

<style scoped>
.onb {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
}

.onb__kicker {
  margin: 0 0 var(--ds-space-xs);
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
}

.onb-card {
  display: flex;
  align-items: center;
  gap: var(--ds-space-md);
  width: 100%;
  padding: var(--ds-space-lg);
  text-align: left;
  text-decoration: none;
  color: inherit;
  font-family: var(--ds-font-body);
  cursor: pointer;
}

.onb-card:disabled,
.onb-card--muted {
  opacity: 0.55;
}

.onb-card:disabled { cursor: default; }

.onb-card__step {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-family: var(--ds-font-heading);
  font-weight: var(--ds-weight-bold);
  font-size: var(--ds-text-sm);
  background: var(--ds-color-accent-light);
  color: var(--ds-color-accent);
}

.onb-card__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.onb-card__title {
  font-family: var(--ds-font-heading);
  font-size: var(--ds-text-lg);
  letter-spacing: -0.01em;
  line-height: 1.25;
  color: var(--ds-color-text-primary);
}

.onb-card__lead {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
}

.onb-card__chevron {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--ds-color-text-tertiary);
}

/* ---- Ark ---- */
.onb-form {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
  padding-bottom: var(--ds-space-md);
}

.onb-team {
  display: flex;
  gap: var(--ds-space-sm);
  align-items: center;
}

.onb-team .ds-input { flex: 1; }

.onb-team--new { margin-top: var(--ds-space-xs); }

.onb-team__remove {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-md);
  color: var(--ds-color-text-tertiary);
  cursor: pointer;
}

.onb-team__remove svg { width: 16px; height: 16px; }

.onb-hint {
  margin: 0;
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
}

.onb-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--ds-space-sm);
  margin-top: var(--ds-space-md);
}

.onb-paste {
  resize: vertical;
  font-family: var(--ds-font-body);
  line-height: 1.5;
}

.onb-file { display: flex; }

.onb-players {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 40vh;
  overflow-y: auto;
}

.onb-player {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-sm);
  padding: 8px 10px;
  background: var(--ds-color-bg-elevated);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-md);
}

.onb-player__name {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.onb-player__team {
  flex-shrink: 0;
  padding: 3px 10px;
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
  background: var(--ds-color-surface);
  border: 1px solid var(--ds-color-border-strong);
  border-radius: var(--ds-radius-full);
  cursor: pointer;
}

.onb-player__team--none {
  color: var(--ds-color-text-tertiary);
  border-style: dashed;
  font-weight: var(--ds-weight-regular);
}
</style>
