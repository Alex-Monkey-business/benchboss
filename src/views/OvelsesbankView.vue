<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useExercises, EXERCISE_CATEGORIES, groupByCategory, equipmentLabel, plassLabel, spillereLabel } from '../composables/useExercises'
import Sheet from '../components/Sheet.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import ExerciseFields from '../components/ExerciseFields.vue'
import { useAuth } from '../stores/auth'

const router = useRouter()
const { activeCohort } = useAuth()
const klubbNavn = computed(() => activeCohort.value?.club_short_name || activeCohort.value?.club_name || '')
const { exercises, supportsCategory, supportsGruppe, supportsUtstyr, supportsSeEtter, supportsSiTilBarna, supportsNokkeltall, fetchExercises, createExercise, updateExercise, deleteExercise, opphavFor } = useExercises()

// Ekte tilbake: dit du kom fra (perioden, en økt …); /trening som fallback.
function goBack() {
  if (window.history.state?.back) router.back()
  else router.push('/trening')
}

const search = ref('')
const showSearch = computed(() => exercises.value.length > 8)

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return exercises.value
  return exercises.value.filter(e =>
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
const categoryLabel = computed(() =>
  EXERCISE_CATEGORIES.find(c => c.value === active.value?.category)?.label || ''
)

// Gjennomføringen er skrevet som linjer av en trener. Er det flere enn én, er
// det en rekkefølge, og da nummererer appen den — treneren skal ikke skrive
// «1.» selv. Én linje er ett avsnitt: «1.» alene over én setning er et skilt
// uten veikryss.
const gjennomforing = computed(() => {
  const linjer = (active.value?.organisering || '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
  return { linjer, nummerert: linjer.length > 1 }
})

// Tre felt skrives som «ett per linje» i samme slags tekstfelt. Å splitte dem
// tre steder er tre steder å glemme .filter(Boolean) på.
function linjer(tekst) {
  return String(tekst || '').split('\n').map(l => l.trim()).filter(Boolean)
}

// Nøkkeltall-kortet: bare radene som har en verdi. Har øvelsen ingen av dem,
// vises ikke kortet — et kort med tre tomme rader er verre enn ingen kort.
const nokkeltall = computed(() => {
  const a = active.value
  if (!a) return []
  const rader = []
  const spillere = spillereLabel(a.min_spillere, a.maks_spillere)
  if (spillere) rader.push({ merke: 'Spillere', verdi: spillere })
  if (a.min_alder) rader.push({ merke: 'Alder', verdi: `${a.min_alder} år+` })
  if (a.plass) rader.push({ merke: 'Plass', verdi: plassLabel(a.plass) })
  if ((a.utstyr_tags || []).length) {
    rader.push({ merke: 'Utstyr', verdi: a.utstyr_tags.map(equipmentLabel).join(', ') })
  }
  return rader
})

function emptyForm() {
  return { name: '', type: 'none', category: '', tema: '', gruppe: '', utstyr: '', organisering: '', laeringsmomenter: '', se_etter: '', si_til_barna: '', min_spillere: null, maks_spillere: null, utstyr_tags: [], plass: null, min_alder: null, link: { label: '', url: '' } }
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
    utstyr: ex.utstyr || '',
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
    utstyr: form.value.utstyr.trim() || null,
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

onMounted(fetchExercises)
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
      <div v-for="group in grouped" :key="group.value" class="bank__group">
        <div v-if="group.label" class="bank__group-label">{{ group.label }}</div>
        <div class="bank__list">
          <button v-for="ex in group.items" :key="ex.id" type="button" class="bank-row" @click="openView(ex)">
            <span
              v-if="ex.type && ex.type !== 'none'"
              class="bank-row__badge"
              :class="`bank-row__badge--${ex.type}`"
            >{{ ex.type === 'diff' ? 'Diff' : 'Mix' }}</span>
            <span class="bank-row__body">
              <span class="bank-row__name">{{ ex.name }}</span>
              <span class="bank-row__under">
                <span v-if="opphavFor(ex)" class="bank-row__opphav">Fra {{ opphavFor(ex) }}</span>
                <span v-if="ex.tema" class="bank-row__tema">{{ ex.tema }}</span>
              </span>
            </span>
            <svg class="bank-row__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>
      <p v-if="!filtered.length" class="bank__no-hits">Ingen treff på «{{ search }}»</p>
    </template>

    <!-- Detalj: visning først, redigering sekundært -->
    <Sheet :show="showSheet" :title="mode === 'new' ? 'Ny øvelse' : mode === 'edit' ? 'Rediger øvelse' : (active?.name || '')" @close="closeSheet">
      <!-- VISNING -->
      <template v-if="mode === 'view' && active">
        <div class="ex-view">
          <div v-if="(active.type && active.type !== 'none') || categoryLabel" class="ex-view__head">
            <span
              v-if="active.type && active.type !== 'none'"
              class="bank-row__badge"
              :class="`bank-row__badge--${active.type}`"
            >{{ active.type === 'diff' ? 'Diff' : 'Mix' }}</span>
            <span v-if="categoryLabel" class="ex-view__category">{{ categoryLabel }}</span>
            <span v-if="opphavFor(active)" class="bank-row__opphav">Fra {{ opphavFor(active) }}</span>
          </div>
          <p v-if="active.tema" class="ex-view__tema">{{ active.tema }}</p>

          <!-- Nøkkeltallene står FØRST fordi de avgjør om øvelsen er aktuell i
               det hele tatt. Ni avbud en tirsdag, og «Spillere 4–9» er det du
               leser — ikke læringsmålet. Kortet har ingen overskrift: radene
               har sine egne merker, og «Nøkkeltall» over dem ville vært et
               skilt over fire skilt. -->
          <section v-if="nokkeltall.length" class="ex-sek ex-sek--fakta">
            <dl class="ex-fakta">
              <template v-for="r in nokkeltall" :key="r.merke">
                <dt>{{ r.merke }}</dt>
                <dd>{{ r.verdi }}</dd>
              </template>
            </dl>
          </section>

          <!-- Én øvelse har hele flaten her, og da bærer seksjonene sin egen
               ramme: du skanner etter overskriften og finner delen du er ute
               etter. Inne i uka ligger 3-4 øvelser under hverandre — der ville
               det samme blitt tjue rammer på én tirsdag, og der står stakken
               tett med vilje.
               Rekkefølgen er lesningen: hva de skal lære, hva du trenger,
               hva dere gjør. -->
          <section v-if="(active.laeringsmomenter || []).length" class="ex-sek">
            <h4 class="ex-sek__tittel">Læringsmål</h4>
            <ul class="ex-view__points">
              <li v-for="(p, i) in active.laeringsmomenter" :key="i">{{ p }}</li>
            </ul>
          </section>

          <!-- Gruppa og utstyret er det du trenger FØR øvelsen begynner, og de
               er to korte fakta — ett kort med to merkede linjer, ikke to kort
               med én linje hver. -->
          <section v-if="active.gruppe || active.utstyr" class="ex-sek">
            <h4 class="ex-sek__tittel">Gruppe og utstyr</h4>
            <dl class="ex-rigg">
              <template v-if="active.gruppe">
                <dt>Gruppa</dt>
                <dd>{{ active.gruppe }}</dd>
              </template>
              <template v-if="active.utstyr">
                <dt>Utstyr</dt>
                <dd>{{ active.utstyr }}</dd>
              </template>
            </dl>
          </section>

          <section v-if="gjennomforing.linjer.length" class="ex-sek">
            <h4 class="ex-sek__tittel">Gjennomføring</h4>
            <ol v-if="gjennomforing.nummerert" class="ex-steg">
              <li v-for="(l, i) in gjennomforing.linjer" :key="i">{{ l }}</li>
            </ol>
            <p v-else class="ex-view__text">{{ gjennomforing.linjer[0] }}</p>
          </section>

          <!-- Tegnene på at øvelsen virker. Læringsmålet er hva de skal få til;
               dette er hva du ser etter mens de prøver. -->
          <section v-if="(active.se_etter || []).length" class="ex-sek">
            <h4 class="ex-sek__tittel">Se etter dette</h4>
            <ul class="ex-view__points">
              <li v-for="(p, i) in active.se_etter" :key="i">{{ p }}</li>
            </ul>
          </section>

          <!-- Ordene, ikke ordlyden om ordene. De står som sitat fordi de skal
               leses som noe du sier høyt, og de tåler ikke en strek i margen
               som gjør dem til en huskeliste. -->
          <section v-if="(active.si_til_barna || []).length" class="ex-sek">
            <h4 class="ex-sek__tittel">Si dette til barna</h4>
            <ul class="ex-fraser">
              <li v-for="(p, i) in active.si_til_barna" :key="i">«{{ p }}»</li>
            </ul>
          </section>

          <a
            v-if="active.link && active.link.url"
            :href="active.link.url"
            target="_blank"
            rel="noopener"
            class="ex-view__link"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            {{ active.link.label || active.link.url }}
          </a>

          <button type="button" class="ds-btn ds-btn--secondary ds-btn--lg ex-view__edit" @click="startEdit">
            Rediger
          </button>
        </div>
      </template>

      <!-- REDIGERING / NY -->
      <form v-else @submit.prevent="save">
        <ExerciseFields :form="form" :show-category="supportsCategory" :show-gruppe="supportsGruppe" :show-utstyr="supportsUtstyr" :show-se-etter="supportsSeEtter" :show-si-til-barna="supportsSiTilBarna" :show-nokkeltall="supportsNokkeltall" />
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
.bank-row__under {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}

/* Avsenderen, ikke en grense: øvelsen er klubbens og kan brukes av alle. */
.bank-row__opphav {
  flex: none;
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-secondary);
  background: var(--ds-color-bg-subtle);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-full);
  padding: 2px 8px;
}

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

.bank__group { margin-bottom: var(--ds-space-lg); }

.bank__group-label {
  font-size: var(--ds-text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ds-color-text-tertiary);
  padding: 0 4px;
  margin-bottom: 8px;
}

.bank__list {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
}

.bank-row {
  display: flex;
  align-items: center;
  gap: var(--ds-space-md);
  width: 100%;
  padding: 14px var(--ds-space-md);
  background: var(--ds-color-bg-elevated);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-lg);
  cursor: pointer;
  text-align: left;
  font-family: var(--ds-font-body);
  -webkit-tap-highlight-color: transparent;
  transition: border-color var(--ds-duration-fast) var(--ds-ease-out), transform var(--ds-duration-fast) var(--ds-ease-out);
}

.bank-row:active { transform: scale(0.99); }

@media (hover: hover) and (pointer: fine) {
  .bank-row:hover { border-color: var(--ds-color-border-strong); }
}

.bank-row__badge {
  flex-shrink: 0;
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: var(--ds-radius-sm);
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.bank-row__badge--diff { background: var(--accent-bg, var(--ds-badge-bg)); color: var(--accent-text, var(--ds-badge-text)); }
.bank-row__badge--mix { background: transparent; color: var(--accent-text, var(--ds-badge-text)); box-shadow: inset 0 0 0 1px currentColor; }

.bank-row__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.bank-row__name {
  font-weight: var(--ds-weight-semibold);
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-primary);
}

.bank-row__tema {
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bank-row__chevron {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--ds-color-text-tertiary);
}

.bank__no-hits {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-tertiary);
  text-align: center;
  padding: var(--ds-space-lg) 0;
  margin: 0;
}


/* ---- Visning av øvelse ---- */
.ex-view {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-lg);
}

.ex-view__head {
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
}

.ex-view__tema {
  font-size: var(--ds-text-md);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-warm-text);
  margin: 0;
}

/* Seksjonen som eget kort. Skillet er ramme + flate + luft, ikke en emoji
   foran overskriften: ikonet er en krykke for hierarki man ikke har, og her
   har vi det. I mørk modus ligger flatene tett på hverandre — der er det
   ramma som bærer skillet, og den er med i begge. */
.ex-sek {
  background: var(--ds-color-bg-subtle);
  border: var(--ds-border-width) solid var(--ds-color-border);
  border-radius: var(--ds-radius-md);
  padding: var(--ds-space-md);
}

.ex-sek__tittel {
  margin: 0 0 var(--ds-space-sm);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
  letter-spacing: -0.01em;
}

/* Merket bærer linja si: to like korte setninger etter hverandre sier ikke
   selv hvem som er hvem. */
.ex-rigg {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--ds-space-xs) var(--ds-space-md);
  margin: 0;
  align-items: baseline;
}

.ex-rigg dt {
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-tertiary);
}

.ex-rigg dd {
  margin: 0;
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-primary);
  line-height: 1.55;
}

/* Verdien står til høyre, merket til venstre, hårstrek mellom radene: det er
   en tabell med to kolonner, og øyet finner «Spillere» uten å lese resten.
   Verdien er tabular-nums så tallene står i loddrett linje. */
.ex-sek--fakta {
  padding: var(--ds-space-sm) var(--ds-space-md);
}

.ex-fakta {
  margin: 0;
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: baseline;
  gap: 0 var(--ds-space-md);
}

.ex-fakta dt {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
  padding: var(--ds-space-sm) 0;
}

.ex-fakta dd {
  margin: 0;
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-primary);
  text-align: right;
  font-variant-numeric: tabular-nums;
  padding: var(--ds-space-sm) 0;
}

/* Streken hører mellom radene, ikke over den første eller under den siste.
   dt og dd er søsken i samme grid, så «alle unntatt de to første» treffer
   hver rad etter den øverste. */
.ex-fakta dt:not(:first-of-type),
.ex-fakta dd:not(:first-of-type) {
  border-top: 1px solid var(--ds-color-border);
}

/* Frasene er replikker, ikke punkter. Ingen markør — anførselstegnene er
   markøren, og de sier noe strekene ikke kan: dette leses høyt. */
.ex-fraser {
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-xs);
}

.ex-fraser li {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-primary);
  line-height: 1.55;
}

/* Tallet står i margen, ikke i tekstblokka: teksten får én venstrekant å
   følge uansett om steget er én linje eller fire. */
.ex-steg {
  margin: 0;
  padding: 0;
  list-style: none;
  counter-reset: steg;
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
}

.ex-steg li {
  counter-increment: steg;
  position: relative;
  padding-left: 1.9em;
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-primary);
  line-height: 1.55;
}

.ex-steg li::before {
  content: counter(steg) ".";
  position: absolute;
  left: 0;
  top: 0;
  width: 1.4em;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--ds-color-text-tertiary);
}

/* Reset-en nuller list-style på alle lister, så «padding-left» ga bare tom
   plass: et moment over to linjer rant rett inn i det neste. Streken i margen
   er den samme markøren uka bruker — ett moment, én strek. */
.ex-view__points {
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
}

.ex-view__points li {
  position: relative;
  padding-left: var(--ds-space-md);
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-primary);
  line-height: 1.55;
}

.ex-view__points li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.7em;
  width: 8px;
  height: 1px;
  background: var(--ds-color-text-tertiary);
}

/* Avsnittene er skrevet av en trener med tomme linjer — de skal stå. */
.ex-view__text {
  white-space: pre-line;
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-primary);
  line-height: 1.55;
  margin: 0;
}

.ex-view__link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--ds-text-sm);
  font-weight: 500;
  color: var(--ds-color-accent);
  text-decoration: none;
}

.ex-view__link svg { width: 15px; height: 15px; }

.ex-view__category {
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-full);
  padding: 2px 8px;
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
