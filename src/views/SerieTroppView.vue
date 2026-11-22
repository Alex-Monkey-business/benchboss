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
// Kom du fra Hjem, går tilbakelenka dit. Ellers til Admin.
const tilbake = window.history.state?.back === '/' ? { to: '/', label: 'Hjem' } : { to: '/admin', label: 'Admin' }
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

// Bytter lag med én gang. Feiler lagringen, står spilleren der igjen.
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
// Opp og ned mellom lagene i redigering. Rekkefølgen er lagene slik de
// står på skjermen, med «Ikke plassert» nederst.
const IKKE_PLASSERT = { slug: null, name: 'Ikke plassert' }
function nabo(slug, retning) {
  const rekke = [...seasonTeams.value, IKKE_PLASSERT]
  const i = slug ? rekke.findIndex(t => t.slug === slug) : rekke.length - 1
  return i < 0 ? null : rekke[i + retning] || null
}
async function flytt(p, slug, retning) {
  const til = nabo(slug, retning)
  if (!til) return
  if (await settLag(p.id, til.slug)) meldEvent('lag_endret', { flate: 'tropp', satt: !!til.slug })
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
    <div v-if="canEdit" class="tropp-nav">
      <BackLink :to="tilbake.to" :label="tilbake.label" />
      <button v-if="editing" type="button" class="ds-link tropp-nav__ferdig" @click="editing = false">Ferdig</button>
      <button v-else-if="!ready || players.length" type="button" class="ds-icon-btn tropp-nav__rediger" aria-label="Rediger tropp" @click="editing = true">
        <Ikon navn="rediger" />
      </button>
    </div>
    <div class="page-header">
      <h1 class="page-header__title">Tropp</h1>
      <p class="page-header__subtitle">
        {{ activeSeason?.name || 'Serie' }}<template v-if="canEdit && !editing && unplaced.length"> · {{ unplaced.length }} ikke plassert</template>
      </p>
    </div>

    <div class="px-lg">
      <div v-if="canEdit && editing" class="tropp-actions">
        <button type="button" class="ds-link add-link" @click="openAdd">
          <Ikon navn="pluss" vekt="bold" :size="14" />
          Ny spiller
        </button>
      </div>
      <div v-else-if="canEdit && kanFordeles.length" class="tropp-actions">
        <button type="button" class="ds-btn ds-btn--primary tropp-actions__fordel" @click="fordelEtterNiva">
          Fordel etter nivå
        </button>
      </div>

      <div v-if="canEdit && players.length && !editing" class="ds-pills ds-pills--bred visning" role="tablist" aria-label="Visning">
        <button
          v-for="o in [{ v: 'liste', l: 'Liste' }, { v: 'bane', l: 'Bane' }]"
          :key="o.v"
          type="button"
          role="tab"
          :aria-selected="visning === o.v"
          class="ds-pill"
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
          <ul v-else-if="editing" class="flytt">
            <li v-for="p in teamPlayers(t.slug)" :key="p.id" class="flytt__rad">
              <span class="flytt__navn">{{ p.name }}<span v-if="eligible(p)" class="chip__star" title="Egnet som lånespiller">★</span></span>
              <button type="button" class="ds-icon-btn flytt__pil" :disabled="!nabo(t.slug, -1)" :aria-label="nabo(t.slug, -1) ? `Flytt ${p.name} opp til ${nabo(t.slug, -1).name}` : 'Øverste lag'" @click="flytt(p, t.slug, -1)">
                <Ikon navn="pil-opp" vekt="bold" />
              </button>
              <button type="button" class="ds-icon-btn flytt__pil" :aria-label="`Flytt ${p.name} ned til ${nabo(t.slug, 1).name}`" @click="flytt(p, t.slug, 1)">
                <Ikon navn="pil-ned" vekt="bold" />
              </button>
            </li>
          </ul>
          <div v-else class="roster">
            <span v-for="p in teamPlayers(t.slug)" :key="p.id" class="chip chip--team">
              <router-link v-if="canEdit" :to="`/spiller/${p.id}`" class="chip__name">{{ p.name }}</router-link>
              <template v-else>{{ p.name }}</template>
              <span v-if="eligible(p)" class="chip__star" title="Egnet som lånespiller">★</span>
            </span>
          </div>
        </section>

        <section v-if="canEdit && unplaced.length" class="teamcard teamcard--muted">
          <header class="teamcard__head">
            <span class="teamcard__name">Ikke plassert</span>
            <span class="teamcard__count">{{ unplaced.length }}</span>
          </header>
          <ul v-if="editing" class="flytt">
            <li v-for="p in unplaced" :key="p.id" class="flytt__rad">
              <span class="flytt__navn">{{ p.name }}<span v-if="eligible(p)" class="chip__star" title="Egnet som lånespiller">★</span></span>
              <button type="button" class="ds-icon-btn flytt__pil" :disabled="!nabo(null, -1)" :aria-label="nabo(null, -1) ? `Flytt ${p.name} opp til ${nabo(null, -1).name}` : 'Ingen lag'" @click="flytt(p, null, -1)">
                <Ikon navn="pil-opp" vekt="bold" />
              </button>
              <button type="button" class="ds-icon-btn flytt__pil" disabled aria-label="Nederst">
                <Ikon navn="pil-ned" vekt="bold" />
              </button>
            </li>
          </ul>
          <div v-else class="roster">
            <span v-for="p in unplaced" :key="p.id" class="chip chip--muted">
              <router-link v-if="canEdit" :to="`/spiller/${p.id}`" class="chip__name">{{ p.name }}</router-link>
              <template v-else>{{ p.name }}</template>
              <span v-if="eligible(p)" class="chip__star" title="Egnet som lånespiller">★</span>
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

.tropp-nav {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--ds-space-md) var(--ds-space-lg) 0;
}
.tropp-nav__rediger { margin-right: calc(var(--ds-space-12) * -1); }
.tropp-actions { display: flex; align-items: center; margin-bottom: var(--ds-space-md); }
.tropp-actions__fordel { width: 100%; }
.visning { margin-bottom: var(--ds-space-md); }

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
[data-accent="paper"] .teamcard__dot {
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
/* Redigering: én rad per spiller, med opp og ned mellom lagene. */
.flytt { list-style: none; margin: 0; padding: 0; }
.flytt__rad {
  display: flex; align-items: center; gap: var(--ds-space-sm);
  min-height: 56px;
  border-bottom: 1px solid var(--ds-color-border-light, var(--ds-color-border));
}
.flytt__rad:last-child { border-bottom: 0; }
.flytt__navn { flex: 1; min-width: 0; font-size: var(--ds-text-md); font-weight: var(--ds-weight-medium); color: var(--ds-color-text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.flytt__navn .chip__star { margin-left: var(--ds-space-xs); }
.flytt__pil { background: var(--ds-color-bg-subtle); color: var(--ds-color-text-primary); }
.flytt__pil svg { width: 18px; height: 18px; }
.flytt__pil:disabled { opacity: .35; cursor: default; }
.teamcard--muted .flytt__pil { background: var(--ds-color-bg-elevated); }
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


.chip__star { color: var(--ds-color-warning); font-size: var(--ds-text-2xs); margin: 0 calc(var(--ds-space-2xs) * -1) 0 1px; }


/* .sheet-actions bor i app.css. */
</style>
