<script setup>
// TRENERPROFIL — speiler /spiller/:id.
//
// Ingen rolle-meta på ruta, som spillerprofilen: guarden er fail-closed, så
// dette er trener-only. Foreldre ser troppen, men skal ikke åpne en person.
//
// Flata leser; sheeten redigerer. Samme deling som spillersiden — å lande rett
// i redigeringsmodus er verre enn ett klikk ekstra.
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { supabase, isSupabaseConfigured } from '../supabase'
import { useAuth } from '../stores/auth'
import { useCoaches } from '../composables/useCoaches'
import { useSeasons } from '../composables/useSeasons'
import { useSeasonTeams } from '../composables/useSeasonTeams'
import { useMatches } from '../composables/useMatches'
import { useExpenses } from '../composables/useExpenses'
import { useResponsibilities } from '../composables/useResponsibilities'
import { useToast } from '../composables/useToast'
import { isOurMatch, isPlayed } from '../lib/matchMeta'
import { shortRelativeDate } from '../lib/dateLabels'
import { AREAS, areaNote } from '../content/ansvar'
import Sheet from '../components/Sheet.vue'
import SeasonPicker from '../components/SeasonPicker.vue'

const route = useRoute()
const { activeCohort } = useAuth()
const { coaches, fetchCoaches } = useCoaches()
const { activeSeason, viewingSeason, fetchSeasons } = useSeasons()
const { seasonTeams, setSeasonTeams, invalidateTeamCoaches } = useSeasonTeams()
const { matches, matchCoaches, fetchMatches, backfillDefaultCoaches } = useMatches()
const { expenses, fetchExpenses } = useExpenses()
const { fetchResponsibilities, areasForCoach, setAreasForCoach, supportsResponsibilities } = useResponsibilities()
const { show: showToast } = useToast()

const ready = ref(false)
const saving = ref(false)

const coach = computed(() => coaches.value.find(c => c.id === route.params.id) || null)
const cohortId = computed(() => activeCohort.value?.id || null)

// Laget leses av trenerlistene på lagene — samme kilde som tropp-siden viser.
const teamNow = computed(() =>
  coach.value ? seasonTeams.value.find(t => (t.trainers || []).includes(coach.value.name)) || null : null
)

const areas = computed(() => (coach.value ? areasForCoach(coach.value.id) : []))

// ── Kamper og utlegg ───────────────────────────────────────────────────────
//
// Tallene fantes fra før — trener-leaderboardet på Statistikk teller nøyaktig
// dette. Her er de bare snudd andre veien: fra «hvem har flest» til «hva har
// denne gjort». Samme kilde (`match_coaches`), samme spilte-definisjon.
//
// Alt er scopet til sesongen man ser på, som spillerprofilen.
const mineKamper = computed(() => {
  if (!coach.value) return []
  const ids = new Set(matchCoaches.value.filter(mc => mc.coach_id === coach.value.id).map(mc => mc.match_id))
  return matches.value.filter(m => ids.has(m.id) && isOurMatch(m))
})

const spilte = computed(() => mineKamper.value.filter(isPlayed))
const kommende = computed(() =>
  mineKamper.value.filter(m => !isPlayed(m)).sort((a, b) => a.match_date.localeCompare(b.match_date))
)

// Nyeste først. Spillerprofilen viser fem; samme her.
const sisteKamper = computed(() =>
  [...spilte.value].sort((a, b) => b.match_date.localeCompare(a.match_date)).slice(0, 5)
)

// Dommerutlegg lagt ut av denne treneren — sesongens kamper, ikke all tid.
const utlegg = computed(() => {
  if (!coach.value) return { antall: 0, kroner: 0 }
  const ids = new Set(matches.value.map(m => m.id))
  const mine = expenses.value.filter(e => e.paid_by === coach.value.id && ids.has(e.match_id))
  return { antall: mine.length, kroner: mine.reduce((s, e) => s + (e.amount || 0), 0) }
})

async function lastSesongdata() {
  if (!viewingSeason.value) return
  await fetchMatches(viewingSeason.value.id)
  await fetchExpenses(matches.value.map(m => m.id))
}

onMounted(async () => {
  const list = await fetchCoaches()
  await fetchSeasons()
  await lastSesongdata()
  if (cohortId.value) await fetchResponsibilities(cohortId.value, list)
  ready.value = true
})

// Uten denne sto tallene fast på sesongen siden ble åpnet i, og velgeren
// gjorde ingenting synlig — samme felle som ble lukket på spillerprofilen.
watch(viewingSeason, lastSesongdata)

// ── Rediger ────────────────────────────────────────────────────────────────
const form = ref(null)

function openEdit() {
  form.value = {
    team: teamNow.value?.slug || '',
    areas: [...areas.value]
  }
}

function toggleArea(area) {
  const i = form.value.areas.indexOf(area)
  if (i > -1) form.value.areas.splice(i, 1)
  else form.value.areas.push(area)
}

// Lag er TO rader — team_coaches for sesongen og cohort_members.preferred_team
// — men ÉN operasjon. Derfor går den gjennom member-admin og aldri rett på
// tabellen: skriver en flate feltene hver for seg, sklir de fra hverandre.
async function saveTeam(slug) {
  if (!isSupabaseConfigured) {
    // Demo har ingen Edge-funksjon. Vi flytter navnet lokalt så tropp-siden
    // viser det samme som her — ellers kan ikke flyten prøves uten prod.
    const name = coach.value.name
    setSeasonTeams(seasonTeams.value.map(t => ({
      ...t,
      trainers: t.slug === slug
        ? [...(t.trainers || []).filter(n => n !== name), name]
        : (t.trainers || []).filter(n => n !== name)
    })))
    return true
  }

  const { data, error } = await supabase.functions.invoke('member-admin', {
    body: { action: 'set_team', coach_id: coach.value.id, team: slug || null }
  })
  if (error) {
    let msg = 'Kunne ikke lagre laget'
    try { msg = (await error.context?.json())?.error || msg } catch { /* behold fallback */ }
    showToast(msg, 'error')
    return false
  }
  if (data?.error) {
    showToast(data.error, 'error')
    return false
  }

  // Kampene i sesongen kan ha blitt hentet før laget hadde en trener — det er
  // normalen nå som plattform-admin ikke lenger kobler seg selv på i
  // veiviseren. Backfillen er idempotent og rører bare kamper som står helt
  // uten trener, så den kan trygt kjøre hver gang noen får et lag.
  invalidateTeamCoaches()
  if (activeSeason.value?.id) await backfillDefaultCoaches(activeSeason.value.id)
  return true
}

async function save() {
  if (!form.value || !coach.value || saving.value) return
  saving.value = true
  try {
    const nyttLag = (form.value.team || '') !== (teamNow.value?.slug || '')
    if (nyttLag && !(await saveTeam(form.value.team))) return

    const før = areas.value
    const etter = form.value.areas
    const endret = før.length !== etter.length || før.some(a => !etter.includes(a))
    if (endret && supportsResponsibilities.value) {
      await setAreasForCoach(coach.value.id, cohortId.value, etter)
    }

    form.value = null
    showToast(`${coach.value.name} oppdatert`, 'success')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="desktop-container">
    <div class="tr__nav">
      <router-link to="/serie/tropp" class="tr__back">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Tropp
      </router-link>
    </div>

    <div v-if="!ready" class="tr__muted">Henter trener …</div>
    <div v-else-if="!coach" class="tr__muted">Fant ikke treneren.</div>

    <template v-else>
      <header class="tr__head">
        <img v-if="coach.image" :src="coach.image" alt="" class="tr__photo" />
        <span v-else class="tr__initial" aria-hidden="true">{{ coach.name.charAt(0).toUpperCase() }}</span>
        <div class="tr__id">
          <h1 class="tr__name">{{ coach.name }}</h1>
          <p class="tr__sub">
            <span v-if="teamNow">{{ teamNow.name }}</span>
            <span v-else>Ikke på et lag</span>
          </p>
        </div>
        <button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" @click="openEdit">Rediger</button>
      </header>

      <section class="tr__section">
        <h2 class="ds-section-label tr__h2">Lag {{ activeSeason ? `· ${activeSeason.name}` : '' }}</h2>
        <p v-if="teamNow" class="tr__body">
          Trener {{ teamNow.name }} denne sesongen. Det styrer hvilke kamper som havner på Hjem.
        </p>
        <template v-else>
          <p class="tr__muted">Ikke satt på et lag. Da faller Hjem tilbake på alle Halsen-kamper.</p>
          <button type="button" class="tr__inline-action" @click="openEdit">Sett lag</button>
        </template>
      </section>

      <section class="tr__section">
        <h2 class="ds-section-label tr__h2">Ansvarsområder</h2>
        <!-- Området alene sier ikke hva jobben er. «Dommere» kan være å dømme,
             å skaffe dommer eller å betale ham. Linja under fjerner tvilen. -->
        <ul v-if="areas.length" class="tr__areas">
          <li v-for="a in areas" :key="a" class="tr__area">
            <span class="tr__area-name">{{ a }}</span>
            <span v-if="areaNote(a)" class="tr__area-note">{{ areaNote(a) }}</span>
          </li>
        </ul>
        <template v-else>
          <p class="tr__muted">Ingen ansvarsområder.</p>
          <button v-if="supportsResponsibilities" type="button" class="tr__inline-action" @click="openEdit">Sett ansvar</button>
        </template>
        <!-- Migrasjonen ikke kjørt: vi viser fordelingen fra fila, men later
             ikke som om den kan endres herfra. -->
        <p v-if="!supportsResponsibilities" class="tr__note">
          Vises fra innholdsfila. Kjør <code>20260818090000_coach_responsibilities.sql</code> for å kunne endre den her.
        </p>
      </section>

      <!-- Sesongvelger, ikke bare en overskrift: tallene er sesongscopet, og
           uten den fantes ingen vei til fjorårets tall herfra. -->
      <section class="tr__section">
        <div class="tr__seasonrow">
          <h2 class="ds-section-label tr__h2">Sesong</h2>
          <SeasonPicker />
        </div>
        <div class="tr__stats">
          <div class="tr__stat">
            <span class="tr__statnum">{{ spilte.length }}</span>
            <span class="tr__statlabel">{{ spilte.length === 1 ? 'kamp' : 'kamper' }}</span>
          </div>
          <div class="tr__stat">
            <span class="tr__statnum">{{ kommende.length }}</span>
            <span class="tr__statlabel">kommende</span>
          </div>
          <div v-if="utlegg.antall" class="tr__stat">
            <span class="tr__statnum">{{ utlegg.kroner }}</span>
            <span class="tr__statlabel">kr lagt ut</span>
          </div>
        </div>
        <p v-if="!spilte.length && !kommende.length" class="tr__note">
          Ingen kamper denne sesongen. Trenere settes på kamper ut fra laget de trener.
        </p>
      </section>

      <section v-if="sisteKamper.length" class="tr__section">
        <h2 class="ds-section-label tr__h2">Siste kamper</h2>
        <ul class="tr__matches">
          <li v-for="m in sisteKamper" :key="m.id">
            <router-link :to="`/kamp/${m.id}`" class="tr__match">
              <span class="tr__matchname">{{ m.home_team }} – {{ m.away_team }}</span>
              <span class="tr__matchdate">{{ shortRelativeDate(m.match_date) }}</span>
            </router-link>
          </li>
        </ul>
      </section>
    </template>

    <Sheet :show="!!form" :title="`Rediger ${coach?.name || ''}`" @close="form = null">
      <form v-if="form" @submit.prevent="save">
        <div class="ds-form-group">
          <label class="ds-label">Lag</label>
          <div class="tr__pills">
            <button
              v-for="t in seasonTeams"
              :key="t.slug"
              type="button"
              :class="['tr__pill', { 'tr__pill--on': form.team === t.slug }]"
              @click="form.team = t.slug"
            >{{ t.name }}</button>
            <button
              type="button"
              :class="['tr__pill', { 'tr__pill--on': !form.team }]"
              @click="form.team = ''"
            >Ingen</button>
          </div>
        </div>

        <div v-if="supportsResponsibilities" class="ds-form-group">
          <label class="ds-label">Ansvarsområder</label>
          <div class="tr__picker">
            <button
              v-for="a in AREAS"
              :key="a.name"
              type="button"
              :class="['tr__pick', { 'tr__pick--on': form.areas.includes(a.name) }]"
              :aria-pressed="form.areas.includes(a.name)"
              @click="toggleArea(a.name)"
            >
              <span class="tr__pick-body">
                <span class="tr__pick-name">{{ a.name }}</span>
                <span class="tr__pick-note">{{ a.note }}</span>
              </span>
              <svg v-if="form.areas.includes(a.name)" class="tr__pick-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              <svg v-else class="tr__pick-plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          </div>
        </div>

        <div class="sheet-actions">
          <button type="submit" class="ds-btn ds-btn--primary ds-btn--lg sheet-actions__save" :disabled="saving">
            {{ saving ? 'Lagrer…' : 'Lagre' }}
          </button>
        </div>
      </form>
    </Sheet>
  </div>
</template>

<style scoped>
/* .desktop-container gir INGEN padding under 768 px — den setter bare
   maksbredde. Hver blokk må derfor trekke seg inn selv, slik SpillerView gjør.
   Her brukes margin, ikke padding: da følger skillelinja på .tr__section
   innholdet i stedet for å gå fra kant til kant. */
.tr__nav {
  margin: var(--ds-space-md) var(--ds-space-lg) var(--ds-space-lg);
}

.tr__back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-secondary);
  text-decoration: none;
  letter-spacing: -0.005em;
}

.tr__back svg { width: 14px; height: 14px; }
.tr__back:hover { color: var(--ds-color-text-primary); }

.tr__head {
  display: flex;
  align-items: center;
  gap: var(--ds-space-md);
  margin: 0 var(--ds-space-lg) var(--ds-space-xl);
}

/* Samme avatar-språk som ansvarsblokka på referatsiden: utklippene er hele
   figurer, så toppen får styre. */
.tr__photo,
.tr__initial {
  flex-shrink: 0;
  width: 56px;
  height: 56px;
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-accent-light);
  overflow: hidden;
}

.tr__photo { object-fit: cover; object-position: center top; }

.tr__initial {
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-lg);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-accent);
}

.tr__id { flex: 1; min-width: 0; }

.tr__name {
  margin: 0;
  font-family: var(--ds-font-display);
  font-size: clamp(1.6rem, 6vw, 2.2rem);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-tighter);
  line-height: 1.1;
  color: var(--ds-color-text-primary);
  font-variation-settings: var(--ds-font-display-settings);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tr__sub {
  margin: 2px 0 0;
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
}

.tr__section {
  padding-top: var(--ds-space-lg);
  border-top: 1px solid var(--ds-color-border-light);
  margin: 0 var(--ds-space-lg) var(--ds-space-lg);
}

.tr__h2 { margin: 0 0 var(--ds-space-md); }

.tr__body,
.tr__muted {
  margin: 0;
  font-size: var(--ds-text-sm);
  line-height: 1.5;
  color: var(--ds-color-text-secondary);
}

.tr__muted { color: var(--ds-color-text-tertiary); }

/* Laster/fant-ikke står utenfor seksjonene og trenger egen innrykk. */
.desktop-container > .tr__muted { margin: 0 var(--ds-space-lg); }

.tr__note {
  margin: var(--ds-space-md) 0 0;
  font-size: var(--ds-text-xs);
  line-height: 1.5;
  color: var(--ds-color-text-tertiary);
}

.tr__note code {
  font-size: 0.95em;
  word-break: break-all;
}

.tr__inline-action {
  margin-top: var(--ds-space-sm);
  padding: 0;
  border: none;
  background: none;
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-primary);
  text-decoration: underline;
  cursor: pointer;
}

.tr__seasonrow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-md);
  margin-bottom: var(--ds-space-md);
}

.tr__seasonrow .tr__h2 { margin: 0; }

.tr__stats { display: flex; flex-wrap: wrap; gap: var(--ds-space-md); }

.tr__stat {
  flex: 1 1 0;
  min-width: 88px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--ds-space-md);
  border: 1.5px solid var(--ds-color-border);
  border-radius: var(--ds-radius-md);
  background: var(--ds-color-bg-elevated);
}

.tr__statnum {
  font-size: var(--ds-text-xl);
  font-weight: var(--ds-weight-semibold);
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.tr__statlabel { font-size: var(--ds-text-xs); color: var(--ds-color-text-tertiary); }

.tr__matches { list-style: none; margin: 0; padding: 0; }

.tr__match {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-md);
  padding: 11px 0;
  text-decoration: none;
  color: inherit;
  border-bottom: 1px solid var(--ds-color-border);
}

.tr__matches li:last-child .tr__match { border-bottom: 0; }

.tr__matchname {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--ds-text-sm);
}

.tr__matchdate { flex: none; font-size: var(--ds-text-xs); color: var(--ds-color-text-tertiary); }

.tr__pills {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ds-space-sm);
}

/* Ansvar er ikke tagger lenger — en pille rommer ikke forklaringen, og det er
   forklaringen som gjør lista verdt å lese. */
.tr__areas {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
}

.tr__area {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: var(--ds-space-md);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-md);
  background: var(--ds-color-bg-elevated);
}

.tr__area-name {
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-md);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-tight);
  color: var(--ds-color-text-primary);
}

.tr__area-note {
  font-size: var(--ds-text-sm);
  line-height: 1.4;
  color: var(--ds-color-text-tertiary);
  letter-spacing: -0.005em;
}

/* Plukkeren viser hva området ER, så man ikke huker av i blinde — samme
   begrunnelse som øvelsesplukkeren i treningsmodulen, og nå samme form:
   én rad per område med hake til høyre.
   Åtte kort à to linjer var en vegg å scrolle gjennom før man nådde Lagre.
   Navn og forklaring flyter på samme linje og bryter bare når de må. */
.tr__picker {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tr__pick {
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
  width: 100%;
  padding: 11px 12px;
  border: 1px solid transparent;
  border-radius: var(--ds-radius-md);
  background: var(--ds-color-bg-subtle);
  text-align: left;
  font-family: var(--ds-font-body);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.tr__pick:active { transform: scale(0.99); }

.tr__pick-body { flex: 1; min-width: 0; line-height: 1.4; }

.tr__pick-name {
  font-weight: var(--ds-weight-semibold);
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-primary);
}

.tr__pick-note {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-tertiary);
}

/* Forklaringen henger på navnet med en prikk, ikke på egen linje. */
.tr__pick-note::before { content: ' · '; }

.tr__pick-check,
.tr__pick-plus {
  width: 17px;
  height: 17px;
  flex-shrink: 0;
  color: var(--ds-color-text-tertiary);
}

.tr__pick--on {
  background: var(--ds-color-accent-light);
  border-color: var(--ds-color-accent);
}

.tr__pick--on .tr__pick-check { color: var(--ds-color-accent); }

.tr__pill {
  padding: 9px 14px;
  border-radius: var(--ds-radius-full);
  border: 1px solid var(--ds-color-border);
  background: var(--ds-color-bg-elevated);
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.tr__pill--on {
  background: var(--ds-color-text-primary);
  border-color: var(--ds-color-text-primary);
  color: var(--ds-color-bg);
}
</style>
