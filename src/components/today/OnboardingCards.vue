<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { supabase, isSupabaseConfigured } from '../../supabase'
import { useAuth } from '../../stores/auth'
import { useOnboarding } from '../../composables/useOnboarding'
import { usePlayers } from '../../composables/usePlayers'
import { useSeasonTeams } from '../../composables/useSeasonTeams'
import { useToast } from '../../composables/useToast'
import { parsePlayerList, parsePlayerWorkbook, matchTeam } from '../../lib/playerList'
import Sheet from '../Sheet.vue'

// Kortene på Hjem som fyller et tomt kull. Hvert kort er ett steg, og
// forsvinner når steget er gjort. Rekkefølgen er rekkefølgen jobben gjøres i:
// lag → spillere → trenere → kampprogram.

const { activeCohort } = useAuth()
const { seasonTeams } = useSeasonTeams()
const { players, addPlayer } = usePlayers()

// Antall per lag, for å vise hvor langt man er kommet.
const antallPerLag = computed(() => {
  const m = new Map()
  for (const p of players.value) if (p.primary_team) m.set(p.primary_team, (m.get(p.primary_team) || 0) + 1)
  return m
})
const { show: showToast } = useToast()
const {
  teamsDone, playersDone, coachesDone, matchesDone, canManageMembers,
  lagMedSpillere, lagUtenSpillere,
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
// ------------------------------------------------------------ Kampprogram
// Har lagene en FIKS-id, finnes kampene allerede. Da er det ingenting å
// spørre om — de hentes.
//
// MEN: aldri før Hjem er tegnet. Hentingen starter når nettleseren er ledig,
// og skjermen venter ikke på fotball.no et eneste øyeblikk. Går det galt,
// blir knappen stående som utvei — den er reserven, ikke veien.
const fiksLag = computed(() => seasonTeams.value.filter(t => t.fiks_team_id))
const henter = ref(false)
const hentingFeilet = ref(false)
let hentetForSesong = null

async function hentKamper({ stille = false } = {}) {
  const sesong = activeSeason.value
  if (!sesong || henter.value) return
  henter.value = true
  try {
    // Lastes først når den brukes. Hjem skal ikke bære FIKS-koden.
    const { useFiks } = await import('../../composables/useFiks')
    const { importMatches } = useFiks()
    const r = await importMatches(sesong.id, { from: `${new Date().getFullYear()}-01-01` })
    hentingFeilet.value = false
    // Den automatiske hentingen sier ingenting når den lykkes — kampene som
    // dukker opp ER beskjeden.
    if (!stille) showToast(r.lagt ? `${r.lagt} kamper hentet` : 'Fant ingen nye kamper', r.lagt ? 'success' : 'info')
  } catch (e) {
    hentingFeilet.value = true
    if (!stille) showToast(e?.message || 'Fikk ikke kontakt med fotball.no', 'error')
  } finally {
    henter.value = false
  }
}

// Én gang per sesong per økt. `whenIdle` er poenget: uten den konkurrerer
// hentingen med den første tegningen av Hjem.
function whenIdle(fn) {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: 3000 })
  else setTimeout(fn, 300)
}

watch(
  () => [fiksLag.value.length, matchesDone.value, activeSeason.value?.id],
  ([antallLag, harKamper, sesongId]) => {
    if (!antallLag || harKamper || !sesongId || hentetForSesong === sesongId) return
    hentetForSesong = sesongId
    whenIdle(() => hentKamper({ stille: true }))
  },
  { immediate: true }
)

// ---------------------------------------------------------------- Spillere
// Spillere legges inn ETT LAG OM GANGEN. Laget er ikke en innstilling du må
// huske — det er stedet du står. Overskriften er laget, knappen nevner laget,
// og du går videre ved å legge inn eller hoppe over.
//
// Det fantes en versjon med lag-chips på toppen av ett felles ark. Den ble
// forkastet: laget flyttet seg under deg etter lagring, chip-bytte skrev om
// alle radene på én gang, og innliming arvet et valg du ikke hadde tatt.
// Fire ting som skjedde uten at de syntes.
const playersOpen = ref(false)
const pasted = ref('')
const parsed = ref([])           // [{ name }]
const importing = ref(false)
const fileInput = ref(null)

// Stegene går over ALLE lagene, så «Lag 2 av 3» betyr det samme hele veien.
const stegIdx = ref(0)
const steg = computed(() => seasonTeams.value[stegIdx.value] || null)

function apneSpillere() {
  hoppet.value = new Set()
  const forste = seasonTeams.value.findIndex(t => !antallPerLag.value.get(t.slug))
  stegIdx.value = forste === -1 ? 0 : forste
  pasted.value = ''
  parsed.value = []
  playersOpen.value = true
}

watch(pasted, text => {
  parsed.value = parsePlayerList(text).map(name => ({ name }))
})

function fjern(navn) {
  parsed.value = parsed.value.filter(p => p.name !== navn)
}

// Videre til neste lag uten spillere — FRAMOVER fra der du står, ellers sto
// «Hopp over» stille på laget du nettopp hoppet over.
//
// Et lag du hopper over er et valg, ikke en glemsel: det tas ut av runden.
// Ellers ville veiviseren kommet tilbake til det og mast om en jobb du
// akkurat sa nei til.
const hoppet = ref(new Set())

function nesteSteg({ hopper = false } = {}) {
  if (hopper && steg.value) hoppet.value = new Set(hoppet.value).add(steg.value.slug)
  pasted.value = ''
  parsed.value = []
  const igjen = seasonTeams.value
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => !antallPerLag.value.get(t.slug) && !hoppet.value.has(t.slug))
  const neste = igjen.find(({ i }) => i > stegIdx.value) || igjen[0]
  if (!neste) { playersOpen.value = false; return }
  stegIdx.value = neste.i
}

async function importPlayers() {
  if (!parsed.value.length || !steg.value) return
  importing.value = true
  let ok = 0
  for (const p of parsed.value) {
    const row = await addPlayer(p.name, steg.value.slug)
    if (row) ok++
  }
  importing.value = false
  showToast(`${ok} ${ok === 1 ? 'spiller' : 'spillere'} på ${steg.value.name}`, ok ? 'success' : 'error')
  await nextTick()
  nesteSteg()
}

// ---------------------------------------------------- Hele kullet fra fil
// Egen inngang, ikke et alternativ inne i lag-steget: å laste opp en fil med
// lagkolonne er en ANNEN jobb enn å fylle ett lag. To jobber, to flater.
const filOpen = ref(false)
const filRader = ref([])         // [{ name, team, kilde }]
const filApen = ref(null)

async function pickFile(e) {
  const file = e.target.files?.[0]
  if (!file) return
  try {
    const rader = await parsePlayerWorkbook(file)
    if (!rader.length) {
      showToast('Fant ingen navn i filen', 'error')
      return
    }
    filRader.value = rader.map(r => ({
      name: r.name,
      team: matchTeam(r.team, seasonTeams.value),
      kilde: r.team
    }))
    playersOpen.value = false
    filOpen.value = true
  } catch {
    showToast('Kunne ikke lese filen', 'error')
  } finally {
    e.target.value = ''
  }
}

// Rader uten lag lagres ikke i blinde. De må plukkes, eller fjernes.
const filUtenLag = computed(() => filRader.value.filter(r => !r.team))

function settFilLag(rad, slug) {
  rad.team = slug
  filApen.value = null
}

function fjernFilRad(rad) {
  filRader.value = filRader.value.filter(r => r !== rad)
}

async function importerFil() {
  if (!filRader.value.length || filUtenLag.value.length) return
  importing.value = true
  let ok = 0
  for (const r of filRader.value) {
    const row = await addPlayer(r.name, r.team)
    if (row) ok++
  }
  importing.value = false
  filOpen.value = false
  filRader.value = []
  showToast(`${ok} ${ok === 1 ? 'spiller' : 'spillere'} lagt inn`, ok ? 'success' : 'error')
}

function teamName(slug) {
  return seasonTeams.value.find(t => t.slug === slug)?.name || 'Uten lag'
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
    <button v-if="!playersDone" type="button" class="ds-card ds-card--interactive onb-card" :disabled="!teamsDone" @click="apneSpillere">
      <span class="onb-card__step">{{ stepNo.players }}</span>
      <span class="onb-card__body">
        <span class="onb-card__title">Legg inn spillerne</span>
        <!-- Har ett lag fått spillere, er «legg inn spillerne» ikke lenger
             sant. Da skal kortet si hvilke lag som står igjen. -->
        <span v-if="players.length" class="onb-card__lead">
          {{ lagUtenSpillere.map(t => t.name).join(' og ') }}
          {{ lagUtenSpillere.length === 1 ? 'mangler spillere' : 'mangler spillere' }}.
        </span>
        <span v-else class="onb-card__lead">Lim inn lista fra Spond eller et regneark — én per linje.</span>
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
    <!-- Går hentingen av seg selv, er dette en beskjed — ikke en oppgave.
         Først når den har feilet blir det noe å trykke på. -->
    <div v-if="!matchesDone && fiksLag.length && !hentingFeilet" class="ds-card onb-card onb-card--stille">
      <span class="onb-card__step onb-card__step--stille" aria-hidden="true"></span>
      <span class="onb-card__body">
        <span class="onb-card__title">Henter kampene fra fotball.no</span>
        <span class="onb-card__lead">Terminlista for {{ fiksLag.map(t => t.name).join(', ') }}.</span>
      </span>
    </div>

    <button v-else-if="!matchesDone && fiksLag.length" type="button" class="ds-card ds-card--interactive onb-card" :disabled="henter || !activeSeason" @click="hentKamper()">
      <span class="onb-card__step">{{ stepNo.matches }}</span>
      <span class="onb-card__body">
        <span class="onb-card__title">{{ henter ? 'Henter kampene …' : 'Prøv å hente kampene igjen' }}</span>
        <span class="onb-card__lead">Fikk ikke kontakt med fotball.no.</span>
      </span>
      <svg class="onb-card__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
    </button>

    <router-link v-else-if="!matchesDone" to="/admin/sesong-kamper" class="ds-card ds-card--interactive onb-card" :class="{ 'onb-card--muted': !playersDone }">
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
        <!-- Den korte veien først. Å skrive inn lagnavn for hånd er reserven,
             ikke hovedveien — men den blir stående for den som vil det. -->
        <router-link to="/kom-i-gang" class="onb-fiks">
          Hent lagene og kampene fra fotball.no
        </router-link>

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

    <!-- Spillere: ett lag per steg -->
    <Sheet :show="playersOpen" :title="steg?.name || 'Spillere'" @close="playersOpen = false">
      <div v-if="steg" class="onb-form">
        <p class="onb-steg">Lag {{ stegIdx + 1 }} av {{ seasonTeams.length }}</p>

        <label class="ds-label" for="onb-paste">Spillerne på {{ steg.name }}</label>
        <textarea id="onb-paste" v-model="pasted" class="ds-input onb-paste" :rows="parsed.length ? 3 : 6" placeholder="Ola Nordmann&#10;Kari Nordmann&#10;…"></textarea>
        <p class="onb-hint">
          Én per linje, eller skilt med komma. «Nordmann, Ola» leses som ett navn.
          Draktnummer, punkter og overskrifter fjernes.
        </p>

        <template v-if="parsed.length">
          <p class="ds-label">{{ parsed.length }} {{ parsed.length === 1 ? 'spiller' : 'spillere' }} på {{ steg.name }}</p>
          <ul class="onb-players">
            <li v-for="p in parsed" :key="p.name" class="onb-player onb-player--enkel">
              <span class="onb-player__name">{{ p.name }}</span>
              <button type="button" class="onb-player__fjern" :aria-label="`Fjern ${p.name}`" @click="fjern(p.name)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </li>
          </ul>
        </template>

        <div class="onb-actions">
          <button type="button" class="ds-btn ds-btn--secondary" @click="nesteSteg({ hopper: true })">Hopp over</button>
          <button type="button" class="ds-btn ds-btn--primary" :disabled="importing || !parsed.length" @click="importPlayers">
            {{ importing ? 'Legger inn…' : `Legg inn ${parsed.length} på ${steg.name}` }}
          </button>
        </div>

        <!-- Egen jobb, egen inngang. -->
        <button type="button" class="onb-lenke" @click="fileInput?.click()">
          Har du en fil med navn og lag? Fyll hele kullet på én gang
        </button>
        <input ref="fileInput" type="file" accept=".xlsx,.xls,.csv" hidden @change="pickFile" />
      </div>
    </Sheet>

    <!-- Hele kullet fra fil: egen flate, med lag på hver rad -->
    <Sheet :show="filOpen" title="Fra fil" @close="filOpen = false">
      <div class="onb-form">
        <p class="ds-label">{{ filRader.length }} {{ filRader.length === 1 ? 'spiller' : 'spillere' }} i filen</p>
        <ul class="onb-players onb-players--fil">
          <li v-for="r in filRader" :key="r.name" class="onb-player">
            <div class="onb-player__rad">
              <span class="onb-player__name">{{ r.name }}</span>
              <button
                type="button"
                class="onb-player__team"
                :class="{ 'onb-player__team--none': !r.team }"
                :aria-expanded="filApen === r.name"
                @click="filApen = filApen === r.name ? null : r.name"
              >{{ r.team ? teamName(r.team) : 'Velg lag' }}</button>
              <button type="button" class="onb-player__fjern" :aria-label="`Fjern ${r.name}`" @click="fjernFilRad(r)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <p v-if="!r.team && r.kilde" class="onb-player__ukjent">«{{ r.kilde }}» er ikke et av lagene</p>
            <div v-if="filApen === r.name" class="onb-lagvalg onb-lagvalg--rad">
              <button
                v-for="t in seasonTeams"
                :key="t.id"
                type="button"
                class="onb-chip"
                :class="{ 'onb-chip--valgt': r.team === t.slug }"
                @click="settFilLag(r, t.slug)"
              >{{ t.name }}</button>
            </div>
          </li>
        </ul>

        <div class="onb-actions">
          <button type="button" class="ds-btn ds-btn--secondary" @click="filOpen = false">Avbryt</button>
          <button type="button" class="ds-btn ds-btn--primary" :disabled="importing || !filRader.length || filUtenLag.length" @click="importerFil">
            {{ importing ? 'Legger inn…' : `Legg inn ${filRader.length}` }}
          </button>
        </div>
        <p v-if="filUtenLag.length" class="onb-hint">
          {{ filUtenLag.length }} {{ filUtenLag.length === 1 ? 'spiller mangler' : 'spillere mangler' }} lag. Velg lag eller fjern raden.
        </p>
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

/* På 320–360 px havnet «Legg inn 9» under folden når lista var full. Den er
   handlingen hele arket finnes for — den skal ikke måtte letes fram. */
.onb-form .onb-actions {
  position: sticky;
  bottom: 0;
  padding-top: var(--ds-space-sm);
  background: var(--ds-color-bg-elevated);
}

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
  /* dvh, ikke vh: på iOS krymper ikke vh når tastaturet kommer opp, så
     lista ville holdt 40 % av HELE skjermen i under halve den synlige. Resten
     av appen bruker dvh — dette var det ene stedet som ikke gjorde det. */
  max-height: 40dvh;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.onb-player {
  /* Raden er én linje; lagvelgeren legger seg UNDER den når den åpnes. Var
     dette fortsatt en flex-rad, ble chipsene presset inn ved siden av navnet. */
  display: flex;
  flex-direction: column;
  padding: 8px 10px;
  background: var(--ds-color-bg-elevated);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-md);
}

.onb-player__name {
  min-width: 0;
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.onb-player__team {
  /* Målt til 28 px. Dette er kontrollen man treffer for å flytte en spiller
     til et annet lag — den kan ikke være halvparten av en fingertupp. */
  min-height: 44px;
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

.onb-fiks {
  display: block;
  padding: var(--ds-space-md);
  background: var(--ds-color-bg-subtle);
  border: var(--ds-border-width) solid var(--ds-color-border);
  border-radius: var(--ds-radius-md);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
  text-decoration: none;
  text-align: center;
}

.onb-lagvalg {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ds-space-xs);
}

.onb-lagvalg--rad {
  margin-top: var(--ds-space-xs);
  padding-bottom: var(--ds-space-xs);
}

.onb-chip {
  /* Målt til 41 px. 44 er gulvet på en telefon. */
  min-height: 44px;
  padding: var(--ds-space-sm) var(--ds-space-md);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-secondary);
  background: var(--ds-color-bg-elevated);
  border: var(--ds-border-width) solid var(--ds-color-border);
  border-radius: var(--ds-radius-full);
  cursor: pointer;
}

.onb-chip--valgt {
  color: var(--ds-color-accent);
  border-color: var(--ds-color-accent);
  border-width: var(--ds-border-width-heavy);
}

.onb-player__rad {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-sm);
  min-width: 0;
}

.onb-card--stille { opacity: 0.75; }

.onb-card__step--stille {
  border: var(--ds-border-width) dashed var(--ds-color-border);
  background: none;
}

.onb-chip__tall {
  margin-left: 6px;
  font-variant-numeric: tabular-nums;
  color: var(--ds-color-text-tertiary);
}

.onb-chip--ferdig { border-style: dashed; }

.onb-hint--inline {
  margin: 0;
  align-self: center;
}

.onb-file {
  align-items: center;
  gap: var(--ds-space-sm);
  flex-wrap: wrap;
}

.onb-steg {
  margin: 0 0 var(--ds-space-xs);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-wider);
  text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
}

.onb-player--enkel { flex-direction: row; align-items: center; justify-content: space-between; }

.onb-player__fjern {
  min-width: 44px;
  min-height: 44px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  background: none;
  border: 0;
  color: var(--ds-color-text-tertiary);
  cursor: pointer;
}

.onb-player__fjern svg { width: 16px; height: 16px; }

.onb-player__ukjent {
  margin: 2px 0 0;
  font-size: var(--ds-text-xs);
  color: var(--ds-color-warning);
}

.onb-players--fil { max-height: 46dvh; }

.onb-lenke {
  margin-top: var(--ds-space-sm);
  padding: var(--ds-space-sm) 0;
  min-height: 44px;
  background: none;
  border: 0;
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
  text-decoration: underline;
  text-align: left;
  cursor: pointer;
}
</style>
