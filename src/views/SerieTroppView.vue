<script setup>
import Ikon from '../components/Ikon.vue'
import Spot from '../components/Spot.vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useAuth } from '../stores/auth'
import { useSeasons } from '../composables/useSeasons'
import { usePlayers } from '../composables/usePlayers'
import { usePlayerSeasonTeams } from '../composables/usePlayerSeasonTeams'
import { useToast } from '../composables/useToast'
import { useSeasonTeams } from '../composables/useSeasonTeams'
import { useCoaches } from '../composables/useCoaches'
import Sheet from '../components/Sheet.vue'
import BackLink from '../components/BackLink.vue'
import LagBane from '../components/LagBane.vue'
import { useOppstilling } from '../composables/useOppstilling'
import { PLAYERS_ON_PITCH_OPTIONS } from '../lib/formations'
import { meldEvent } from '../lib/sporing'
import { usePlayerLevels, LEVELS } from '../composables/usePlayerLevels'

const { isParent, activeCohort } = useAuth()
const { activeSeason, fetchSeasons } = useSeasons()
const { players, fetchPlayers, addPlayer, updatePlayer } = usePlayers()
const { fetchPlayerSeasonTeams, isLoanEligible } = usePlayerSeasonTeams()
const { seasonTeams, activeHasOwnTeams, createTeamsForSeason } = useSeasonTeams()
const { fetchPlayerLevels, levelFor } = usePlayerLevels()
const { coaches, fetchCoaches } = useCoaches()
const { show: showToast } = useToast()

const canEdit = computed(() => !isParent.value)
// Spillerne vi allerede har, tegnes med en gang; hentingen friskes opp bak.
const ready = ref(players.value.length > 0)
const editing = ref(false)
const seasonId = computed(() => activeSeason.value?.id ?? null)

const TEAM_OPTIONS = computed(() =>
  [{ value: '', label: 'Ingen' }, ...seasonTeams.value.map(t => ({ value: t.slug, label: t.name }))])

// Liste eller bane. Bare for trenere: banen viser posisjonene, og nivået
// lekker gjennom hvem som står hvor. Banen er standard; valget huskes på
// telefonen.
const { hent: hentOppstilling } = useOppstilling()
const VISNING = 'bb-tropp-visning'
const visning = ref((() => { try { return localStorage.getItem(VISNING) === 'liste' ? 'liste' : 'bane' } catch { return 'bane' } })())
watch(visning, v => { try { localStorage.setItem(VISNING, v) } catch { /* privat modus */ } })
const visBane = computed(() => canEdit.value && visning.value === 'bane' && !editing.value)
const spillform = computed(() => {
  const n = activeCohort.value?.players_on_pitch
  return PLAYERS_ON_PITCH_OPTIONS.includes(n) ? n : 7
})
function velgVisning(v) {
  if (v === visning.value) return
  visning.value = v
  meldEvent('tropp_visning', { visning: v })
}

onMounted(async () => {
  if (canEdit.value) { hentOppstilling(); fetchPlayerLevels() }
  await Promise.all([fetchSeasons(), fetchPlayers(), fetchPlayerSeasonTeams(), fetchCoaches()])
  ready.value = true
})

// Trenernavnet på lagkortet blir en lenke til trenerprofilen — samme grep som
// spiller-chipsene, samme `canEdit`-lås.
//
// `t.trainers` er NAVN, ikke id-er, og skal forbli det: både
// defaultCoachIdsForMatch og useToday.teamByName slår opp på navn. Oppslaget
// gjøres her i stedet. Står vi på den statiske SEASON_TEAMS-fallbacken finnes
// ingen trenerrad, og da blir navnet stående som tekst.
function coachId(name) {
  return coaches.value.find(c => c.name === name)?.id || null
}

const byName = (a, b) => a.name.localeCompare(b.name, 'no')

// Serielag = players.primary_team. Ingen egen tabell — spilleren bærer laget sitt.
function teamPlayers(slug) {
  return players.value.filter(p => p.primary_team === slug).sort(byName)
}
// Ikke plassert: uten lag, eller på et lag som ikke finnes i sesongen.
const unplaced = computed(() => {
  const slugs = new Set(seasonTeams.value.map(t => t.slug))
  return [...players.value].filter(p => !p.primary_team || !slugs.has(p.primary_team)).sort(byName)
})
// Lånespiller-status er trenerinformasjon. Foreldre ser hverken stjerner eller
// forklaringen på hva de betyr.
const eligible = p => canEdit.value && isLoanEligible(p, seasonId.value)

// Hurtig lag-bytte (chip-prikkene / ×)
async function assign(playerId, team) {
  await updatePlayer(playerId, { primary_team: team })
  meldEvent('lag_endret', { flate: 'spiller', satt: true })
}
// Av laget med én gang; Angre i varslinga setter spilleren tilbake på samme
// lag. Feiler lagringen, står spilleren der igjen.
async function settLag(playerId, team) {
  const p = players.value.find(x => x.id === playerId)
  const for_ = p?.primary_team ?? null
  if (p) p.primary_team = team
  const ok = await updatePlayer(playerId, { primary_team: team }).catch(() => null)
  if (!ok) {
    if (p) p.primary_team = for_
    showToast('Fikk ikke lagret. Prøv igjen.', 'error')
  }
  return !!ok
}
async function remove(playerId) {
  const p = players.value.find(x => x.id === playerId)
  const lag = p?.primary_team
  if (!p || !lag) return
  if (!(await settLag(playerId, null))) return
  meldEvent('lag_endret', { flate: 'spiller', satt: false })
  showToast(`${p.name.split(' ')[0]} tatt av laget`, 'success', 5000, {
    action: { label: 'Angre', handler: () => settLag(playerId, lag) }
  })
}

// ── Nye lag for sesongen ─────────────────────────────────────────────────────
// Lagene gjelder til en sesong får egne. Arver sesongen fra en tidligere, kan
// treneren sette opp nye: A, B og C når lagene meldes på etter nivå.
const visNyeLag = ref(false)
const nyeLagNavn = ref([])
const nyeLagFeil = ref('')
const lagrerNyeLag = ref(false)
function openNyeLag() {
  nyeLagNavn.value = [...LEVELS]
  nyeLagFeil.value = ''
  visNyeLag.value = true
}
async function lagNyeLag() {
  const navn = nyeLagNavn.value.map(n => n.trim()).filter(Boolean)
  if (!navn.length || !seasonId.value) return
  lagrerNyeLag.value = true
  nyeLagFeil.value = ''
  try {
    await createTeamsForSeason(activeCohort.value?.id, seasonId.value, navn)
    await Promise.all([fetchPlayers(), fetchPlayerSeasonTeams()])
    meldEvent('nye_lag', { antall: navn.length })
    visNyeLag.value = false
    showToast(`${navn.join(', ')} gjelder fra ${activeSeason.value?.name || 'denne sesongen'}`, 'success')
  } catch (e) {
    nyeLagFeil.value = e?.message || 'Fikk ikke laget lagene. Prøv igjen.'
  } finally {
    lagrerNyeLag.value = false
  }
}

// ── Fordel etter nivå ────────────────────────────────────────────────────────
// Nivå A på laget som heter A, og så videre. Heter lagene noe annet, går
// nivåene på lagene i rekkefølge. Bare de som ikke er plassert flyttes:
// det treneren har bestemt selv, står.
const lagForNiva = computed(() => {
  const m = new Map()
  LEVELS.forEach((niva, i) => {
    const t = seasonTeams.value.find(x => x.name.trim().toUpperCase() === niva) || seasonTeams.value[i]
    if (t) m.set(niva, t.slug)
  })
  return m
})
const kanFordeles = computed(() => unplaced.value.filter(p => lagForNiva.value.has(levelFor(p.id))))
async function fordelEtterNiva() {
  const flytt = kanFordeles.value.map(p => ({ id: p.id, for_: p.primary_team ?? null, til: lagForNiva.value.get(levelFor(p.id)) }))
  if (!flytt.length) return
  const igjen = unplaced.value.length - flytt.length
  const ok = await Promise.all(flytt.map(f => settLag(f.id, f.til)))
  const antall = ok.filter(Boolean).length
  meldEvent('lag_fordelt_niva', { antall })
  if (!antall) return
  showToast(
    igjen ? `${antall} fordelt. ${igjen} uten nivå står igjen.` : `${antall} fordelt etter nivå`,
    'success', 6000,
    { action: { label: 'Angre', handler: () => Promise.all(flytt.map(f => settLag(f.id, f.for_))) } }
  )
}

// Ny spiller
const showAdd = ref(false)
const newName = ref('')
const newTeam = ref('')
function openAdd() {
  newName.value = ''
  newTeam.value = ''
  showAdd.value = true
}
async function handleAdd() {
  const name = newName.value.trim()
  if (!name) return
  await addPlayer(name, newTeam.value)
  showToast(`${name} lagt til`, 'success')
  showAdd.value = false
}

</script>

<template>
  <div class="desktop-container">
    <div v-if="canEdit" class="px-lg" style="padding-top: var(--ds-space-md);">
      <BackLink to="/admin" label="Admin" />
    </div>
    <div class="page-header">
      <h1 class="page-header__title">Tropp</h1>
      <p class="page-header__subtitle">{{ activeSeason?.name || 'Serie' }}</p>
    </div>

    <div class="px-lg">
      <div v-if="canEdit && (!ready || players.length)" class="tropp-actions">
        <button v-if="editing" type="button" class="ds-link add-link" @click="openAdd">
          <Ikon navn="pluss" vekt="bold" :size="14" />
          Ny spiller
        </button>
        <button v-else-if="kanFordeles.length" type="button" class="ds-btn ds-btn--primary ds-btn--sm" @click="fordelEtterNiva">
          Fordel etter nivå
        </button>
        <span v-else-if="unplaced.length" class="tropp-hint">{{ unplaced.length }} ikke plassert</span>
        <button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" @click="editing = !editing">
          {{ editing ? 'Ferdig' : 'Rediger tropp' }}
        </button>
      </div>

      <div v-if="canEdit && players.length && !editing" class="visning" role="tablist" aria-label="Visning">
        <button
          v-for="o in [{ v: 'liste', l: 'Liste' }, { v: 'bane', l: 'Bane' }]"
          :key="o.v"
          type="button"
          role="tab"
          :aria-selected="visning === o.v"
          :class="['visning__valg', { 'visning__valg--aktiv': visning === o.v }]"
          @click="velgVisning(o.v)"
        >{{ o.l }}</button>
      </div>

      <div v-if="!ready"></div>

      <div v-else-if="canEdit && players.length === 0" class="ds-empty">
        <Spot name="squad" class="ds-empty__illo" />
        <h3 class="ds-empty__title">Ingen spillere ennå</h3>
        <button type="button" class="ds-btn ds-btn--primary ds-empty__action" @click="openAdd">Ny spiller</button>
      </div>

      <!-- Samme layout i lese- og edit-modus: lag-kort med chips -->
      <template v-else>
        <section v-for="t in seasonTeams" :key="t.slug" class="teamcard" :data-accent="t.accent" :data-team="t.slug">
          <header class="teamcard__head">
            <span v-if="t.accent" class="teamcard__dot"></span>
            <span class="teamcard__name">{{ t.name }}</span>
            <span class="teamcard__count">{{ teamPlayers(t.slug).length }}</span>
          </header>
          <p v-if="t.trainers?.length" class="teamcard__trainers">
            <span>Trenere: </span>
            <template v-for="(n, i) in t.trainers" :key="n">
              <span v-if="i > 0">, </span>
              <router-link v-if="canEdit && coachId(n)" :to="`/trener/${coachId(n)}`" class="teamcard__trainer">{{ n }}</router-link>
              <template v-else>{{ n }}</template>
            </template>
          </p>
          <p v-if="teamPlayers(t.slug).length === 0" class="teamcard__empty">Ingen spillere lagt til ennå.</p>
          <!-- Uten id (demo) kan justeringer ikke lagres; banen vises likevel,
               så Bane-fanen aldri står aktiv over en liste. -->
          <LagBane
            v-else-if="visBane"
            :team="t"
            :spillere="teamPlayers(t.slug)"
            :spillform="spillform"
            :kan-endre="canEdit && !!t.id"
          />
          <div v-else class="roster">
            <span v-for="p in teamPlayers(t.slug)" :key="p.id" class="chip chip--team">
              <router-link v-if="canEdit" :to="`/spiller/${p.id}`" class="chip__name">{{ p.name }}</router-link>
              <template v-else>{{ p.name }}</template>
              <span v-if="eligible(p)" class="chip__star" title="Egnet som lånespiller">★</span>
              <button v-if="editing" type="button" class="chip__x" :aria-label="`Ta ${p.name} av laget`" @click="remove(p.id)">×</button>
            </span>
          </div>
        </section>

        <section v-if="canEdit && unplaced.length" class="teamcard teamcard--muted">
          <header class="teamcard__head">
            <span class="teamcard__name">Ikke plassert</span>
            <span class="teamcard__count">{{ unplaced.length }}</span>
          </header>
          <div class="roster">
            <span v-for="p in unplaced" :key="p.id" class="chip chip--muted">
              <router-link v-if="canEdit" :to="`/spiller/${p.id}`" class="chip__name">{{ p.name }}</router-link>
              <template v-else>{{ p.name }}</template>
              <span v-if="eligible(p)" class="chip__star" title="Egnet som lånespiller">★</span>
              <span v-if="editing" class="chip__assign">
                <button
                  v-for="t in seasonTeams"
                  :key="t.slug"
                  type="button"
                  class="chip__dot"
                  :data-accent="t.accent"
                  :data-team="t.slug"
                  :aria-label="`Sett ${p.name} på ${t.name}`"
                  :title="t.name"
                  @click="assign(p.id, t.slug)"
                ><template v-if="!t.accent">{{ t.name.slice(0, 2) }}</template></button>
              </span>
            </span>
          </div>
        </section>

        <div v-if="canEdit && !editing && !activeHasOwnTeams && activeSeason" class="nye-lag">
          <button type="button" class="ds-btn ds-btn--ghost" @click="openNyeLag">Nye lag for {{ activeSeason.name }}</button>
        </div>
      </template>
    </div>

    <Sheet :show="visNyeLag" :title="`Nye lag for ${activeSeason?.name || 'sesongen'}`" @close="visNyeLag = false">
      <p class="nye-lag__tekst">
        Lagene og kampene fra tidligere sesonger blir stående som de er.
        Alle spillerne tas av lagene, og du fordeler dem på nytt.
      </p>
      <div class="nye-lag__liste">
        <div v-for="(n, i) in nyeLagNavn" :key="i" class="nye-lag__rad">
          <input v-model="nyeLagNavn[i]" class="ds-input" :aria-label="`Lag ${i + 1}`" />
          <button
            v-if="nyeLagNavn.length > 1"
            type="button"
            class="nye-lag__fjern"
            :aria-label="`Fjern ${n || 'laget'}`"
            @click="nyeLagNavn.splice(i, 1)"
          >×</button>
        </div>
      </div>
      <button type="button" class="ds-link add-link" @click="nyeLagNavn.push('')">
        <Ikon navn="pluss" vekt="bold" :size="14" />
        Lag
      </button>
      <p v-if="nyeLagFeil" class="nye-lag__feil" role="alert">{{ nyeLagFeil }}</p>
      <div class="sheet-actions">
        <button class="ds-btn ds-btn--secondary" @click="visNyeLag = false">Avbryt</button>
        <button
          class="ds-btn ds-btn--primary"
          :disabled="lagrerNyeLag || !nyeLagNavn.some(n => n.trim())"
          @click="lagNyeLag"
        >Lag nye lag</button>
      </div>
    </Sheet>

    <Sheet :show="showAdd" title="Ny spiller" @close="showAdd = false">
      <div class="ds-form-group">
        <label class="ds-label">Navn</label>
        <input v-model="newName" class="ds-input" placeholder="Spillerens navn" @keydown.enter="handleAdd" />
      </div>
      <div class="ds-form-group">
        <label class="ds-label">Lag</label>
        <select v-model="newTeam" class="ds-input">
          <option v-for="opt in TEAM_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
      </div>
      <div class="sheet-actions">
        <button class="ds-btn ds-btn--secondary" @click="showAdd = false">Avbryt</button>
        <button class="ds-btn ds-btn--primary" :disabled="!newName.trim()" @click="handleAdd">Legg til</button>
      </div>
    </Sheet>

  </div>
</template>

<style scoped>
.nye-lag { display: flex; justify-content: center; margin-top: var(--ds-space-xl); }
.nye-lag__tekst { margin: 0 0 var(--ds-space-lg); color: var(--ds-color-text-secondary); font-size: var(--ds-text-sm); line-height: 1.5; }
.nye-lag__liste { display: flex; flex-direction: column; gap: var(--ds-space-sm); margin-bottom: var(--ds-space-md); }
.nye-lag__rad { display: flex; align-items: center; gap: var(--ds-space-sm); }
.nye-lag__rad .ds-input { flex: 1; }
.nye-lag__fjern {
  width: 44px; height: 44px; flex: none; border: 0; border-radius: var(--ds-radius-full);
  background: transparent; color: var(--ds-color-text-tertiary); font-size: var(--ds-text-lg); cursor: pointer;
}
.nye-lag__fjern:hover { background: var(--ds-color-bg-subtle); color: var(--ds-color-text-primary); }
.nye-lag__feil { margin: var(--ds-space-md) 0 0; color: var(--ds-color-danger, #C0392B); font-size: var(--ds-text-sm); }
.cmd-muted { color: var(--ds-color-text-tertiary); font-size: var(--ds-text-sm); padding: var(--ds-space-sm) var(--ds-space-2xs); }

.tropp-actions {
  display: flex; align-items: center; justify-content: space-between; gap: var(--ds-space-md);
  margin-bottom: var(--ds-space-md);
}
.tropp-actions > .ds-btn:last-child { margin-left: auto; }
/* Liste | Bane: samme bryter som Kommende | Tidligere på Kamper. */
.visning {
  display: grid; grid-template-columns: 1fr 1fr; gap: var(--ds-space-xs);
  padding: var(--ds-space-xs); margin-bottom: var(--ds-space-md);
  background: var(--ds-color-bg-subtle);
  border-radius: var(--ds-radius-full);
}
.visning__valg {
  min-height: 40px; border: 0; border-radius: var(--ds-radius-full);
  background: transparent; color: var(--ds-color-text-secondary);
  font: inherit; font-size: var(--ds-text-sm); font-weight: var(--ds-weight-semibold);
  cursor: pointer; transition: background .15s ease, color .15s ease, box-shadow .15s ease;
}
.visning__valg--aktiv {
  background: var(--ds-color-bg-elevated); color: var(--ds-color-text-primary);
  box-shadow: var(--ds-shadow-xs);
}
.tropp-hint { font-size: var(--ds-text-sm); color: var(--ds-color-text-tertiary); }

.edit-hint {
  color: var(--ds-color-text-tertiary); font-size: var(--ds-text-sm);
  margin: 0 0 var(--ds-space-md);
}

/* Lagene er identitet, ikke dekor. data-accent går via dekorpaletten i
   app.css, der «sage» og «warm» peker til plomme og stein siden 30. aug, så
   Grønn ble rosa og Rød grå her. Har laget en egen lagfarge, vinner den. */
[data-team="gronn"] { --accent-bg: var(--ds-team-gronn-bg); --accent-text: var(--ds-team-gronn); }
[data-team="rod"]   { --accent-bg: var(--ds-team-rod-bg);   --accent-text: var(--ds-team-rod); }

/* Tonal accent-palett (delt med treningsplan/login) */
/* Hvit = nøytral papir-chip med stroke (token-basert → følger dark mode) */
[data-accent="paper"] {
  --accent-bg: var(--ds-color-bg-elevated);
  --accent-text: var(--ds-color-text-primary);
  --accent-border: var(--ds-color-border-strong);
}
[data-accent="paper"] .teamcard__dot,
[data-accent="paper"] .chip__dot {
  background: var(--ds-color-bg-elevated);
  border: 1px solid var(--ds-color-border-strong);
  box-shadow: none;
}

/* Ett kort per lag */
.teamcard {
  margin-top: var(--ds-space-md);
  background: var(--ds-color-bg-elevated);
  border: var(--ds-border-width) solid var(--ds-color-border-light);
  border-radius: var(--ds-radius-lg);
  box-shadow: var(--ds-shadow-xs);
  padding: var(--ds-space-md) var(--ds-space-lg) var(--ds-space-lg);
}
.teamcard:first-of-type { margin-top: 0; }
.teamcard--muted { background: var(--ds-color-bg-subtle); box-shadow: none; }

.teamcard__head {
  display: flex; align-items: center; gap: var(--ds-space-sm);
  margin-bottom: var(--ds-space-md);
}
.teamcard__dot { width: 10px; height: 10px; border-radius: 50%; flex: none; background: var(--accent-text); }
.teamcard__name {
  font-family: var(--ds-font-heading);
  font-size: var(--ds-text-lg);
  font-weight: var(--ds-weight-bold);
  letter-spacing: var(--ds-tracking-tight);
  color: var(--ds-color-text-primary);
}
.teamcard--muted .teamcard__name { color: var(--ds-color-text-tertiary); font-size: var(--ds-text-md); }
.teamcard__count {
  margin-left: auto;
  color: var(--ds-color-text-tertiary);
  font-size: var(--ds-text-sm); font-weight: var(--ds-weight-medium);
}
.teamcard__trainers {
  margin: calc(var(--ds-space-sm) * -1) 0 var(--ds-space-md);
  color: var(--ds-color-text-tertiary); font-size: var(--ds-text-sm);
}
/* Understreket, ikke farget: navnet skal se klikkbart ut uten å konkurrere
   med spillerne under, som er kortets hovedsak. */
.teamcard__trainer {
  color: var(--ds-color-text-secondary);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.teamcard__trainer:hover { color: var(--ds-color-text-primary); }
.teamcard__empty { color: var(--ds-color-text-tertiary); font-size: var(--ds-text-sm); margin: 0; }

.roster { display: flex; flex-wrap: wrap; gap: var(--ds-space-sm); }
.chip {
  position: relative;
  display: inline-flex; align-items: center; gap: var(--ds-space-xs);
  min-height: 44px;
  padding: var(--ds-space-sm) var(--ds-space-md);
  border: 1px solid transparent;
  border-radius: var(--ds-radius-full);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-semibold);
}
.chip--team { background: var(--accent-bg, var(--ds-color-bg-subtle)); color: var(--accent-text, var(--ds-color-text-primary)); border-color: var(--accent-border, transparent); }
.chip--muted {
  background: var(--ds-color-bg-subtle); color: var(--ds-color-text-secondary);
  padding-right: var(--ds-space-xs);
}
/* «Ikke plassert»-kortet er selv dempet; chipsene løftes så de ikke blir
   løs tekst på flaten. */
.teamcard--muted .chip--muted { background: var(--ds-color-bg-elevated); border-color: var(--ds-color-border-light); }
.chip__name {
  background: transparent; border: 0; padding: 0; margin: 0; cursor: pointer;
  font: inherit; color: inherit; letter-spacing: inherit;
}
.chip__name:hover { text-decoration: underline; }
/* Hele chipen er trykkflata, ikke bare navnet. */
.chip__name::after { content: ''; position: absolute; inset: 0; border-radius: inherit; }
.chip__x, .chip__assign { position: relative; z-index: 1; }

.chip__x {
  display: grid; place-items: center;
  width: 32px; height: 32px; margin: 0 calc(var(--ds-space-12) * -1) 0 calc(var(--ds-space-xs) * -1); padding: 0;
  border: none; border-radius: 50%;
  background: transparent; color: inherit; opacity: 0.55;
  font-size: var(--ds-text-sm); line-height: 1; cursor: pointer;
}
.chip__x:hover { opacity: 1; }

.chip__assign { display: inline-flex; align-items: center; gap: var(--ds-space-xs); margin-left: var(--ds-space-xs); }
.chip__dot {
  width: 24px; height: 24px; padding: 0; flex: none;
  background: var(--accent-text);
  border: 2px solid var(--ds-color-bg-elevated);
  border-radius: 50%; cursor: pointer;
  box-shadow: 0 0 0 1px var(--ds-color-border-light);
}
.chip__dot:hover { transform: scale(1.15); }
/* Lag uten farge (A, B, C): navnet i prikken, nøytral flate. */
.chip__dot:not([data-accent]) {
  width: auto; min-width: 28px; height: 28px; padding: 0 var(--ds-space-sm);
  background: var(--ds-color-bg-elevated); color: var(--ds-color-text-primary);
  font: inherit; font-size: var(--ds-text-xs); font-weight: var(--ds-weight-semibold);
  box-shadow: 0 0 0 1px var(--ds-color-border-strong);
}

.chip__star { color: var(--ds-color-warning); font-size: var(--ds-text-2xs); margin: 0 calc(var(--ds-space-2xs) * -1) 0 1px; }


/* .sheet-actions bor i app.css. */
</style>
