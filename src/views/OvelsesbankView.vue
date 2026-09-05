<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useExercises, groupByCategory, kullAlder, passerAlder, ovelsensVideo } from '../composables/useExercises'
import Sheet from '../components/Sheet.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import ExerciseFields from '../components/ExerciseFields.vue'
import ExerciseView from '../components/ExerciseView.vue'
import { useAuth } from '../stores/auth'

const router = useRouter()
const route = useRoute()
const { activeCohort } = useAuth()
const klubbNavn = computed(() => activeCohort.value?.club_short_name || activeCohort.value?.club_name || '')
const { exercises, supportsCategory, supportsGruppe, supportsSeEtter, supportsSiTilBarna, supportsNokkeltall, fetchExercises, createExercise, updateExercise, deleteExercise, opphavFor } = useExercises()

// Ekte tilbake: dit du kom fra (perioden, en økt …); /trening som fallback.
function goBack() {
  if (window.history.state?.back) router.back()
  else router.push('/trening')
}

const search = ref('')
const showSearch = computed(() => synlige.value.length > 8)

// Kortet i hylla: plakaten fra videoen, eller en tom flate. Ærlig tom — vi
// tegner ikke en fotball for å late som det finnes film.
function plakat(ex) {
  return ovelsensVideo(ex)?.poster || null
}

function varighet(ex) {
  const s = Math.round(ovelsensVideo(ex)?.duration || 0)
  if (!s) return ''
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Kullets alder, og øvelsene som er anbefalt for eldre. Default viser vi det
// som passer — men de skjulte er ALLTID tellet fram nederst, så det aldri er
// et mysterium hvorfor banken er kortere enn den var.
const alder = computed(() => kullAlder(activeCohort.value))
const visForEldre = ref(false)

const forEldre = computed(() =>
  alder.value == null ? [] : exercises.value.filter(e => !passerAlder(e, alder.value))
)

// Laveste alder blant de skjulte: «anbefalt fra 10 år» er mer presist enn
// «for eldre», og treneren vet da om det gjelder ett år eller fire.
const forEldreFra = computed(() => {
  const tall = forEldre.value.map(e => e.min_alder).filter(Boolean)
  return tall.length ? Math.min(...tall) : null
})

const synlige = computed(() =>
  visForEldre.value ? exercises.value : exercises.value.filter(e => passerAlder(e, alder.value))
)

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return synlige.value
  return synlige.value.filter(e =>
    e.name.toLowerCase().includes(q) || (e.tema || '').toLowerCase().includes(q)
  )
})

const grouped = computed(() =>
  supportsCategory.value
    ? groupByCategory(filtered.value)
    : [{ value: 'alle', label: '', items: filtered.value }]
)

// ---- Detalj-sheet: visning først, redigering er sekundært ----
const showSheet = ref(false)
const mode = ref('view') // 'view' | 'edit' | 'new'
const activeId = ref(null)
const saving = ref(false)
const form = ref(emptyForm())

const active = computed(() => exercises.value.find(e => e.id === activeId.value) || null)

// Tre felt skrives som «ett per linje» i samme slags tekstfelt. Å splitte dem
// tre steder er tre steder å glemme .filter(Boolean) på.
function linjer(tekst) {
  return String(tekst || '').split('\n').map(l => l.trim()).filter(Boolean)
}

function emptyForm() {
  return { name: '', type: 'none', category: '', tema: '', gruppe: '', organisering: '', laeringsmomenter: '', se_etter: '', si_til_barna: '', min_spillere: null, maks_spillere: null, utstyr_tags: [], plass: null, min_alder: null, link: { label: '', url: '' } }
}

function openView(ex) {
  activeId.value = ex.id
  mode.value = 'view'
  showSheet.value = true
}

function openNew() {
  activeId.value = null
  form.value = emptyForm()
  mode.value = 'new'
  showSheet.value = true
}

function startEdit() {
  const ex = active.value
  form.value = {
    name: ex.name,
    type: ex.type || 'none',
    category: ex.category || '',
    tema: ex.tema || '',
    gruppe: ex.gruppe || '',
    organisering: ex.organisering || '',
    laeringsmomenter: (ex.laeringsmomenter || []).join('\n'),
    se_etter: (ex.se_etter || []).join('\n'),
    si_til_barna: (ex.si_til_barna || []).join('\n'),
    min_spillere: ex.min_spillere ?? null,
    maks_spillere: ex.maks_spillere ?? null,
    utstyr_tags: [...(ex.utstyr_tags || [])],
    plass: ex.plass || null,
    min_alder: ex.min_alder ?? null,
    link: ex.link ? { label: ex.link.label || '', url: ex.link.url || '' } : { label: '', url: '' }
  }
  mode.value = 'edit'
}

async function save() {
  if (!form.value.name.trim() || saving.value) return
  saving.value = true
  const payload = {
    name: form.value.name.trim(),
    type: form.value.type,
    tema: form.value.tema.trim() || null,
    gruppe: form.value.gruppe.trim() || null,
    organisering: form.value.organisering.trim() || null,
    laeringsmomenter: linjer(form.value.laeringsmomenter),
    se_etter: linjer(form.value.se_etter),
    si_til_barna: linjer(form.value.si_til_barna),
    min_spillere: form.value.min_spillere || null,
    maks_spillere: form.value.maks_spillere || null,
    utstyr_tags: [...(form.value.utstyr_tags || [])],
    plass: form.value.plass || null,
    min_alder: form.value.min_alder || null,
    link: form.value.link.url.trim() ? { label: form.value.link.label.trim(), url: form.value.link.url.trim() } : null
  }
  if (supportsCategory.value) payload.category = form.value.category || null
  if (mode.value === 'edit') {
    await updateExercise(activeId.value, payload)
    mode.value = 'view'
  } else {
    const row = await createExercise(payload)
    if (row) {
      activeId.value = row.id
      mode.value = 'view'
    } else {
      showSheet.value = false
    }
  }
  saving.value = false
}

function closeSheet() {
  showSheet.value = false
  mode.value = 'view'
}

// ---- Slett (kun her — å slette fra banken er ekte sletting) ----
const showDelete = ref(false)

async function confirmDelete() {
  await deleteExercise(activeId.value)
  showDelete.value = false
  showSheet.value = false
}

// Fra dagen: «Endre øvelsen i banken» kommer med ?ovelse=<id>, og da skal
// den stå åpen når du lander — ikke en liste på sytten der du må finne den
// igjen. Ønsket brukes én gang.
onMounted(async () => {
  await fetchExercises()
  const ønsket = route.query.ovelse
  if (ønsket && exercises.value.some(e => e.id === ønsket)) {
    openView({ id: ønsket })
    router.replace({ path: route.path })
  }
})
</script>

<template>
  <div class="bank">
    <div class="bank__nav">
      <button type="button" class="back-btn" @click="goBack">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Tilbake
      </button>
    </div>

    <!-- «Ny øvelse» ligger øverst: det var det Alex ikke fant da den lå
         under en liste som kan bli hundre rader lang. -->
    <header class="bank__head">
      <div class="bank__head-text">
        <h1 class="bank__title">Øvelsesbank</h1>
        <!-- Banken er klubbens, ikke kullets. En ny trener som ser sytten
             øvelser han ikke har laget, skal vite hvorfor de er der. -->
        <p class="bank__count">
          {{ exercises.length }} {{ exercises.length === 1 ? 'øvelse' : 'øvelser' }}<template v-if="klubbNavn"> · delt i hele {{ klubbNavn }}</template>
        </p>
      </div>
      <button v-if="exercises.length" type="button" class="ds-btn ds-btn--primary bank__new" @click="openNew">
        Ny øvelse
      </button>
    </header>

    <input
      v-if="showSearch"
      v-model="search"
      class="ds-input bank__search"
      type="search"
      placeholder="Søk i øvelser"
    />

    <div v-if="exercises.length === 0" class="ds-empty">
      <img src="/illustrations/bench-boss-feature-icons/512/training-plan-transparent.png" alt="" class="ds-empty__illo" />
      <div class="ds-empty__title">Ingen øvelser ennå</div>
      <div class="ds-empty__description">
        Øvelser du lager mens du planlegger uka havner her automatisk — og deles med
        de andre kullene<template v-if="klubbNavn"> i {{ klubbNavn }}</template>.
      </div>
      <button type="button" class="ds-btn ds-btn--primary ds-empty__action" @click="openNew">Ny øvelse</button>
    </div>

    <template v-else>
      <!-- Banken er hyller, ikke en liste. Én hylle per kategori, kortene
           ligger på rekke og ruller sidelengs — som PocketCoach, og som
           enhver videotjeneste: du kjenner øvelsen igjen på bildet før du
           har lest navnet. 124 øvelser i én kolonne var en vegg. -->
      <section v-for="group in grouped" :key="group.value" class="hylle">
        <header v-if="group.label" class="hylle__hode">
          <h2 class="hylle__tittel">{{ group.label }}</h2>
          <span class="hylle__tall">{{ group.items.length }}</span>
        </header>
        <div class="hylle__rekke">
          <button v-for="ex in group.items" :key="ex.id" type="button" class="kort" @click="openView(ex)">
            <span class="kort__bilde" :class="{ 'kort__bilde--tom': !plakat(ex) }">
              <img v-if="plakat(ex)" :src="plakat(ex)" alt="" loading="lazy" decoding="async" />
              <span v-else class="kort__tomt">Ingen video</span>
              <span v-if="ex.type && ex.type !== 'none'" class="kort__badge" :class="`kort__badge--${ex.type}`">{{ ex.type === 'diff' ? 'Diff' : 'Mix' }}</span>
              <span v-if="varighet(ex)" class="kort__tid">{{ varighet(ex) }}</span>
            </span>
            <span class="kort__navn">{{ ex.name }}</span>
            <span v-if="ex.tema || opphavFor(ex)" class="kort__under">
              <template v-if="opphavFor(ex)">Fra {{ opphavFor(ex) }}<template v-if="ex.tema"> · </template></template>{{ ex.tema }}
            </span>
          </button>
        </div>
      </section>
      <p v-if="!filtered.length && search" class="bank__no-hits">Ingen treff på «{{ search }}»</p>

      <!-- Konsekvensen først: hvor mange, og fra hvilken alder. En bryter som
           bare sier «vis alle» tvinger deg til å trykke for å finne ut om det
           er noe der. Raden vises bare når noe FAKTISK er skjult. -->
      <button
        v-if="forEldre.length && !visForEldre"
        type="button"
        class="bank__eldre"
        @click="visForEldre = true"
      >
        <span class="bank__eldre-tall">{{ forEldre.length }}</span>
        <span class="bank__eldre-tekst">
          {{ forEldre.length === 1 ? 'øvelse er' : 'øvelser er' }} anbefalt fra
          {{ forEldreFra }} år<template v-if="alder != null"> — kullet er {{ alder }}</template>
        </span>
        <span class="bank__eldre-handling">Vis {{ forEldre.length === 1 ? 'den' : 'dem' }}</span>
      </button>

      <button
        v-else-if="forEldre.length && visForEldre"
        type="button"
        class="bank__eldre bank__eldre--av"
        @click="visForEldre = false"
      >
        <span class="bank__eldre-tekst">Viser hele klubbens bank</span>
        <span class="bank__eldre-handling">Vis bare det som passer</span>
      </button>
    </template>

    <!-- Detalj: visning først, redigering sekundært -->
    <Sheet :show="showSheet" :title="mode === 'new' ? 'Ny øvelse' : mode === 'edit' ? 'Rediger øvelse' : (active?.name || '')" @close="closeSheet">
      <!-- VISNING — samme rendring som dagen bruker (ExerciseView). Retter du
           noe her i banken, er det det treneren ser på tirsdag. -->
      <template v-if="mode === 'view' && active">
        <ExerciseView class="ex-view--sheet" :exercise="active" :opphav="opphavFor(active)">
          <button type="button" class="ds-btn ds-btn--secondary ds-btn--lg ex-view__edit" @click="startEdit">
            Rediger
          </button>
        </ExerciseView>
      </template>

      <!-- REDIGERING / NY -->
      <form v-else @submit.prevent="save">
        <ExerciseFields :form="form" :show-category="supportsCategory" :show-gruppe="supportsGruppe" :show-se-etter="supportsSeEtter" :show-si-til-barna="supportsSiTilBarna" :show-nokkeltall="supportsNokkeltall" />
        <div class="bank__form-actions">
          <button
            v-if="mode === 'edit'"
            type="button"
            class="ds-btn ds-btn--ghost bank__delete"
            @click="showDelete = true"
          >
            Slett
          </button>
          <button type="submit" class="ds-btn ds-btn--primary ds-btn--lg bank__save" :disabled="!form.name.trim() || saving">
            {{ saving ? 'Lagrer…' : mode === 'edit' ? 'Lagre endringer' : 'Legg i banken' }}
          </button>
        </div>
      </form>
    </Sheet>

    <ConfirmDialog
      :show="showDelete"
      title="Slett øvelse?"
      :message="`«${active?.name}» fjernes fra banken. Treningsdager som bruker den beholder sin kopi.`"
      confirm-label="Slett"
      variant="warning"
      @confirm="confirmDelete"
      @cancel="showDelete = false"
    />
  </div>
</template>

<style scoped>
.bank {
  max-width: 640px;
  margin: 0 auto;
  padding: var(--ds-space-md) var(--ds-space-lg) var(--ds-space-2xl);
}

.bank__nav { margin-bottom: var(--ds-space-xl); }

.bank__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--ds-space-md);
  margin-bottom: var(--ds-space-lg);
}

.bank__head-text { min-width: 0; }
.bank__new { flex-shrink: 0; }

.bank__title {
  font-family: var(--ds-font-display);
  font-size: clamp(2rem, 6.5vw, 2.8rem);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-tighter);
  line-height: 1.1;
  color: var(--ds-color-text-primary);
  font-variation-settings: var(--ds-font-display-settings);
  margin: 0 0 4px;
}

.bank__count {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-tertiary);
  margin: 0;
  font-variant-numeric: tabular-nums;
}

.bank__search {
  width: 100%;
  margin-bottom: var(--ds-space-md);
}

/* ---- Hyllene ---- */
.hylle { margin-bottom: var(--ds-space-xl); }

.hylle__hode {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ds-space-md);
  margin-bottom: var(--ds-space-sm);
}

.hylle__tittel {
  margin: 0;
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-lg);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-tight);
  color: var(--ds-color-text-primary);
}

.hylle__tall {
  font-size: var(--ds-text-sm);
  font-variant-numeric: tabular-nums;
  color: var(--ds-color-text-tertiary);
}

/* Rekka går kant til kant: sidemargen trekkes ut og legges inn igjen som
   padding, så første kort flukter med overskriften og siste kort kan skimtes
   i kanten — det er den halve kanten som sier «det er mer her». */
.hylle__rekke {
  display: flex;
  gap: var(--ds-space-sm);
  margin: 0 calc(-1 * var(--ds-space-lg));
  padding: 0 var(--ds-space-lg) var(--ds-space-xs);
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scroll-padding-left: var(--ds-space-lg);
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}

.hylle__rekke::-webkit-scrollbar { display: none; }

/* 200 px: på 360 ser du 1,7 kort. På 640 tre og en halv. Aldri ett helt og
   så ingenting — kanten på neste er det som får deg til å rulle. */
.kort {
  flex: none;
  width: 200px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0;
  border: none;
  background: none;
  text-align: left;
  font-family: var(--ds-font-body);
  cursor: pointer;
  scroll-snap-align: start;
  -webkit-tap-highlight-color: transparent;
}

.kort:active .kort__bilde { transform: scale(0.98); }

.kort__bilde {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: var(--ds-radius-md);
  border: 1px solid var(--ds-color-border-light);
  background: var(--ds-color-bg-subtle);
  transition: transform var(--ds-duration-fast) var(--ds-ease-out);
}

.kort__bilde img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.kort__tomt {
  position: absolute;
  left: 10px;
  bottom: 8px;
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-tertiary);
}

/* Merkene ligger PÅ bildet, i hjørnene — de skal ikke ta en linje under det. */
.kort__badge {
  position: absolute;
  left: 8px;
  top: 8px;
  padding: 2px 7px;
  border-radius: var(--ds-radius-sm);
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  background: var(--ds-color-bg-elevated);
  color: var(--ds-color-text-primary);
  box-shadow: var(--ds-shadow-xs);
}

.kort__badge--mix { background: var(--ds-color-bg-elevated); box-shadow: inset 0 0 0 1px var(--ds-color-border-strong), var(--ds-shadow-xs); }

.kort__tid {
  position: absolute;
  right: 8px;
  bottom: 8px;
  padding: 2px 6px;
  border-radius: var(--ds-radius-sm);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-medium);
  font-variant-numeric: tabular-nums;
  background: rgba(10, 10, 10, 0.72);
  color: #fff;
}

.kort__navn {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-semibold);
  line-height: 1.3;
  letter-spacing: -0.005em;
  color: var(--ds-color-text-primary);
}

.kort__under {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-tertiary);
}

.bank__no-hits {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-tertiary);
  text-align: center;
  padding: var(--ds-space-lg) 0;
  margin: 0;
}


/* Raden bærer et tall, en setning og en handling. Den er en knapp i sin
   helhet — å treffe «Vis dem» presist på en 320 px-skjerm med hansker på er
   ikke en rimelig forventning. */
.bank__eldre {
  display: flex;
  align-items: center;
  gap: var(--ds-space-md);
  width: 100%;
  margin-top: var(--ds-space-lg);
  padding: var(--ds-space-md);
  background: var(--ds-color-bg-subtle);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-md);
  text-align: left;
  cursor: pointer;
}

.bank__eldre-tall {
  flex: none;
  font-size: var(--ds-text-md);
  font-weight: var(--ds-weight-semibold);
  font-variant-numeric: tabular-nums;
  color: var(--ds-color-text-primary);
}

.bank__eldre-tekst {
  flex: 1;
  min-width: 0;
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
  line-height: 1.4;
}

.bank__eldre-handling {
  flex: none;
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-accent);
}

.ex-view__edit { width: 100%; margin-top: var(--ds-space-sm); }

.bank__form-actions {
  display: flex;
  gap: var(--ds-space-sm);
  margin-top: var(--ds-space-sm);
}

.bank__delete { flex-shrink: 0; color: var(--ds-color-error); }
.bank__save { flex: 1; }

</style>
