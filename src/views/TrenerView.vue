<script setup>
// TRENERPROFIL — speiler /spiller/:id.
//
// Ingen rolle-meta på ruta, som spillerprofilen: guarden er fail-closed, så
// dette er trener-only. Foreldre ser troppen, men skal ikke åpne en person.
//
// Flata leser; sheeten redigerer. Samme deling som spillersiden — å lande rett
// i redigeringsmodus er verre enn ett klikk ekstra.
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { supabase, isSupabaseConfigured } from '../supabase'
import { useAuth } from '../stores/auth'
import { useCoaches } from '../composables/useCoaches'
import { useSeasons } from '../composables/useSeasons'
import { useSeasonTeams } from '../composables/useSeasonTeams'
import { useResponsibilities } from '../composables/useResponsibilities'
import { useToast } from '../composables/useToast'
import { AREAS } from '../content/ansvar'
import Sheet from '../components/Sheet.vue'

const route = useRoute()
const { activeCohort } = useAuth()
const { coaches, fetchCoaches } = useCoaches()
const { activeSeason, fetchSeasons } = useSeasons()
const { seasonTeams, setSeasonTeams } = useSeasonTeams()
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

onMounted(async () => {
  const list = await fetchCoaches()
  await fetchSeasons()
  if (cohortId.value) await fetchResponsibilities(cohortId.value, list)
  ready.value = true
})

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
        <div v-if="areas.length" class="tr__tags">
          <span v-for="a in areas" :key="a" class="tr__tag">{{ a }}</span>
        </div>
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
          <div class="tr__pills">
            <button
              v-for="a in AREAS"
              :key="a"
              type="button"
              :class="['tr__pill', { 'tr__pill--on': form.areas.includes(a) }]"
              :aria-pressed="form.areas.includes(a)"
              @click="toggleArea(a)"
            >{{ a }}</button>
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
.tr__nav { margin-bottom: var(--ds-space-lg); }

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
  margin-bottom: var(--ds-space-xl);
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
  margin-bottom: var(--ds-space-lg);
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

.tr__tags,
.tr__pills {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ds-space-sm);
}

.tr__tag {
  padding: 5px 12px;
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-elevated);
  border: 1px solid var(--ds-color-border);
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
}

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
