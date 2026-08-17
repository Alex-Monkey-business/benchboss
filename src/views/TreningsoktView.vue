<script setup>
// DAGEN — lesevisningen. Denne åpner du når du står på banen.
//
// Ingen redigering her, ingen knapper som endrer noe. Planen bygges i
// uke-visningen (/trening); dette er den ferdige planen, stor og lesbar.
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTrainingPeriods } from '../composables/useTrainingPeriods'
import { useTrainingSessions } from '../composables/useTrainingSessions'
import { useExercises, resolveDrills } from '../composables/useExercises'
import { sessionIllustration, illoWebp, illoPng } from '../lib/sessionVisuals'

const route = useRoute()
const router = useRouter()
const { getPeriod, fetchPeriods } = useTrainingPeriods()
const { sessions, loadedPeriod, fetchSessions } = useTrainingSessions()
const { exercises, fetchExercises } = useExercises()

const heroLoaded = ref(false)

const periodId = computed(() => route.params.id)
const oktId = computed(() => route.params.oktId)
const period = computed(() => getPeriod(periodId.value))
const okt = computed(() => sessions.value.find(s => s.id === oktId.value) || null)

// Innholdet leses fra banken — se resolveDrills i useExercises.
const drills = computed(() => resolveDrills(okt.value?.drills, exercises.value))

// Bildet velges av ukedagen, ikke av deg — se lib/sessionVisuals.
const heroIllo = computed(() => sessionIllustration(okt.value))

// «1 t 30 min» er slik folk snakker om det. «90 min» er slik databaser gjør.
function formatMinutes(min) {
  if (!min) return ''
  const t = Math.floor(min / 60)
  const m = min % 60
  if (!t) return `${m} min`
  return m ? `${t} t ${m} min` : `${t} t`
}

// Hvor lenge varer økta? Står i headeren, så du vet det før du begynner.
const lengde = computed(() => formatMinutes(okt.value?.duration_min))

// Ekte tilbake: dit du kom fra (Hjem, uka, banken …). Uka er bare fallback
// ved direkte-lenke uten historikk.
function goBack() {
  if (window.history.state?.back) router.back()
  else router.push(`/trening/${periodId.value}`)
}

onMounted(async () => {
  if (!period.value) await fetchPeriods()
  if (loadedPeriod.value !== periodId.value || !sessions.value.length) {
    await fetchSessions(periodId.value)
  }
  fetchExercises()
})
</script>

<template>
  <div v-if="okt" class="okt-view" :data-accent="okt.accent || 'warm'">
    <div class="okt-view__nav">
      <button type="button" class="okt-view__back" @click="goBack">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Tilbake
      </button>
    </div>

    <!-- Farget kapittel-panel -->
    <div class="chapter">
      <div class="chapter__hero" :class="{ 'chapter__hero--bare': !heroIllo }">
        <picture v-if="heroIllo">
          <source :srcset="illoWebp(heroIllo)" type="image/webp" />
          <img
            :src="illoPng(heroIllo)"
            :alt="okt.title"
            class="chapter__img"
            :class="{ 'is-loaded': heroLoaded }"
            decoding="async"
            fetchpriority="high"
            @load="heroLoaded = true"
          />
        </picture>
        <div v-if="heroIllo" class="chapter__scrim"></div>
        <header class="hero">
          <h1 class="hero__title">{{ okt.title }}</h1>
          <p v-if="okt.focus" class="hero__focus">{{ okt.focus }}</p>
          <p v-if="lengde" class="hero__meta">{{ lengde }}</p>
        </header>
      </div>

      <div class="chapter__body">
        <div v-if="drills.length" class="drills">
          <div v-for="(d, di) in drills" :key="di" class="drill">
            <div class="drill__head">
              <span
                v-if="d.type && d.type !== 'none'"
                class="drill__badge"
                :class="`drill__badge--${d.type}`"
              >{{ d.type === 'diff' ? 'Diff' : 'Mix' }}</span>
              <h3 class="drill__name">{{ d.text }}</h3>
              <!-- Tida settes i uka, men det er her den brukes: med ballen i
                   hånda vil du vite hvor lenge denne øvelsen skal vare. -->
              <span v-if="d.minutes" class="drill__time">{{ formatMinutes(d.minutes) }}</span>
            </div>
            <p v-if="d.tema" class="drill__focus">{{ d.tema }}</p>

            <ul v-if="d.laeringsmomenter && d.laeringsmomenter.length" class="drill__points">
              <li v-for="(p, pi) in d.laeringsmomenter" :key="pi">{{ p }}</li>
            </ul>

            <p v-if="d.organisering" class="drill__org"><span class="drill__org-label">Oppsett</span>{{ d.organisering }}</p>

            <a
              v-if="d.link && d.link.url"
              :href="d.link.url"
              target="_blank"
              rel="noopener"
              class="drill__link"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              {{ d.link.label || d.link.url }}
            </a>
          </div>
        </div>

        <!-- Tom dag: planlegging skjer i uka, så herfra peker vi dit. -->
        <div v-else class="okt-view__empty">
          <p>Ingen øvelser lagt inn på denne dagen.</p>
          <router-link :to="`/trening/${periodId}`" class="ds-btn ds-btn--primary">Planlegg uka</router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.okt-view[data-accent="warm"]       { --accent-bg: #F8E8E0; --accent-text: #7A3A24; }
.okt-view[data-accent="sage"]       { --accent-bg: #E2EDDE; --accent-text: #3D5C44; }
.okt-view[data-accent="cornflower"] { --accent-bg: #D6DDEF; --accent-text: #3D456B; }
.okt-view[data-accent="peach"]      { --accent-bg: #F8E8E0; --accent-text: #7A3A24; }
.okt-view[data-accent="sky"]        { --accent-bg: #DDE6EC; --accent-text: #3A4C5C; }
.okt-view[data-accent="olive"]      { --accent-bg: #F0E7D6; --accent-text: #6B5630; }

:global([data-theme="dark"] .okt-view[data-accent="warm"]) { --accent-bg: #2A1E18; --accent-text: #F4C4A8; }
:global([data-theme="dark"] .okt-view[data-accent="sage"]) { --accent-bg: #1A241D; --accent-text: #B5D2B0; }
:global([data-theme="dark"] .okt-view[data-accent="cornflower"]) { --accent-bg: #1A1F33; --accent-text: #B9C2E5; }
:global([data-theme="dark"] .okt-view[data-accent="peach"]) { --accent-bg: #2A1E18; --accent-text: #F4C4A8; }
:global([data-theme="dark"] .okt-view[data-accent="sky"]) { --accent-bg: #1A222A; --accent-text: #B0C5D8; }
:global([data-theme="dark"] .okt-view[data-accent="olive"]) { --accent-bg: #2A241A; --accent-text: #D9C99E; }

/* Dyp, kinematisk header-palett (VG-aktig) — lik i lyst og mørkt tema */
.okt-view[data-accent="warm"]       { --hero-bg: #4A1E14; --hero-accent: #E5A488; --hero-fg: #F6EAE3; }
.okt-view[data-accent="sage"]       { --hero-bg: #233528; --hero-accent: #9CC49A; --hero-fg: #EAF1E7; }
.okt-view[data-accent="cornflower"] { --hero-bg: #232A4A; --hero-accent: #A6B2E4; --hero-fg: #E9ECF6; }
.okt-view[data-accent="peach"]      { --hero-bg: #5A241C; --hero-accent: #F0AE97; --hero-fg: #F8ECE6; }
.okt-view[data-accent="sky"]        { --hero-bg: #1F2E3C; --hero-accent: #9FC2D8; --hero-fg: #E9F1F6; }
.okt-view[data-accent="olive"]      { --hero-bg: #3E331C; --hero-accent: #D8C189; --hero-fg: #F3EDDE; }

.okt-view {
  max-width: 640px;
  margin: 0 auto;
  padding: var(--ds-space-md) var(--ds-space-lg) var(--ds-space-2xl);
}

/* Farget kapittel-panel som svever på vanlig bakgrunn */
.chapter {
  background: var(--hero-bg);
  border-radius: var(--ds-radius-lg);
  box-shadow: var(--ds-shadow-md);
  overflow: hidden;
}

/* Bildet fyller toppen og toner ut i panelfargen (VG-scrim) */
.chapter__hero {
  position: relative;
  min-height: 60vh;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: var(--ds-space-xl);
}

/* Uten illustrasjon: kompakt panel — 60vh tom farge lover innhold som ikke finnes.
   Stram bunn: body-en under har egen padding, to lag stables til død sone. */
.chapter__hero--bare {
  min-height: 0;
  padding-top: var(--ds-space-2xl);
  padding-bottom: var(--ds-space-sm);
}

.chapter__img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center top;
  opacity: 0;
  transition: opacity 350ms var(--ds-ease-out);
}

.chapter__img.is-loaded { opacity: 1; }

@media (prefers-reduced-motion: reduce) {
  .chapter__img { transition: none; }
}

.chapter__scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0) 50%, var(--hero-bg) 88%);
}

.chapter__body {
  padding: var(--ds-space-xl) var(--ds-space-xl) var(--ds-space-2xl);
}

.okt-view__nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--ds-space-lg);
}

.okt-view__back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-secondary);
  text-decoration: none;
  letter-spacing: -0.005em;
  min-width: 0;
}

.okt-view__back svg { width: 14px; height: 14px; flex-shrink: 0; }
.okt-view__back:hover { color: var(--ds-color-text-primary); }

/* ---- Header (over bildet, nederst i hero-sonen) ---- */
.hero {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.hero__title {
  font-family: var(--ds-font-display-sans);
  font-size: clamp(3rem, 13vw, 4.6rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 0.92;
  text-transform: uppercase;
  color: var(--hero-fg);
  margin: 4px 0 0;
}

.hero__focus {
  font-family: var(--ds-font-display);
  font-size: var(--ds-text-lg);
  font-weight: var(--ds-weight-regular);
  line-height: 1.45;
  letter-spacing: -0.01em;
  color: var(--hero-fg);
  margin: var(--ds-space-md) 0 0;
  max-width: 42ch;
}

.hero__meta {
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-wider);
  text-transform: uppercase;
  color: var(--hero-accent);
  margin: var(--ds-space-md) 0 0;
}

/* ---- Øvelser ---- */
.drills {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.drill {
  padding: var(--ds-space-lg) 0;
  border-top: 1px solid rgba(255, 255, 255, 0.14);
}

.drill:first-child { padding-top: 0; border-top: 0; }

/* Scanne-linja: badge + navn */
.drill__head {
  display: flex;
  align-items: baseline;
  gap: var(--ds-space-sm);
}

.drill__badge {
  flex-shrink: 0;
  padding: 2px 9px;
  border-radius: var(--ds-radius-sm);
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-wider);
  text-transform: uppercase;
}

.drill__badge--diff { background: #E2EDDE; color: #3D5C44; }
.drill__badge--mix  { background: #F8E8E0; color: #7A3A24; }

:global([data-theme="dark"] .drill__badge--diff) { background: #1A241D; color: #B5D2B0; }
:global([data-theme="dark"] .drill__badge--mix) { background: #2A1E18; color: #F4C4A8; }

/* Panelet er alltid mørkt, så tida låner hero-aksenten i stedet for den lyse
   pillebakgrunnen uka bruker. */
/* Wrapper navnet over flere linjer, skal tida stå på den FØRSTE — «center»
   plasserer den midt inni tittelen. */
.drill__time {
  flex-shrink: 0;
  align-self: flex-start;
  margin-top: 2px;
  padding: 2px 9px;
  border-radius: var(--ds-radius-full);
  background: rgba(255, 255, 255, 0.12);
  color: var(--hero-fg);
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.drill__name {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-lg);
  font-weight: var(--ds-weight-semibold);
  line-height: 1.25;
  letter-spacing: -0.01em;
  color: var(--hero-fg);
}

/* Panelet er alltid mørkt — standardknappene (nesten svart primær, lys grå
   sekundær) drukner eller gjørmer seg. Panel-lokal variant i panelets språk. */
.okt-view__empty .ds-btn--primary {
  background: var(--hero-fg);
  border-color: var(--hero-fg);
  color: var(--hero-bg);
}
.okt-view__empty .ds-btn--primary:hover { opacity: 0.92; }

/* Fokus — det vi øver på, fremhevet i aksent */
.drill__focus {
  margin: 6px 0 0;
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-md);
  font-weight: var(--ds-weight-medium);
  color: var(--hero-accent);
  letter-spacing: -0.005em;
}

/* Detalj — dempet, sekundært */
.drill__points {
  list-style: none;
  padding: 0;
  margin: var(--ds-space-md) 0 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.drill__points li {
  position: relative;
  padding-left: var(--ds-space-md);
  font-size: var(--ds-text-sm);
  line-height: 1.45;
  color: var(--hero-fg);
  opacity: 0.8;
  letter-spacing: -0.005em;
}

.drill__points li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.62em;
  width: 8px;
  height: 1px;
  background: var(--hero-accent);
  opacity: 0.7;
}

.drill__org {
  margin: var(--ds-space-md) 0 0;
  font-size: var(--ds-text-sm);
  line-height: 1.5;
  color: var(--hero-fg);
  opacity: 0.72;
  letter-spacing: -0.005em;
}

.drill__org-label {
  margin-right: 6px;
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-wider);
  text-transform: uppercase;
  color: var(--hero-accent);
}

.drill__link {
  display: inline-flex;
  align-items: center;
  gap: var(--ds-space-sm);
  margin-top: var(--ds-space-md);
  max-width: 100%;
  padding: 7px var(--ds-space-md);
  background: var(--accent-bg);
  color: var(--accent-text);
  border-radius: var(--ds-radius-md);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  text-decoration: none;
  letter-spacing: -0.005em;
  transition: transform var(--ds-duration-fast) var(--ds-ease-out);
}

.drill__link svg { width: 15px; height: 15px; flex-shrink: 0; }
.drill__link:active { transform: scale(0.98); }

.okt-view__empty {
  text-align: center;
  padding: var(--ds-space-lg) 0 var(--ds-space-sm);
  color: var(--hero-fg);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ds-space-md);
}

/* Global p-farge er mørk grå — usynlig på det alltid-mørke panelet.
   Dempingen ligger på teksten alene: lå den på hele blokka, arvet knappen
   den og så deaktivert ut. */
.okt-view__empty p {
  color: inherit;
  opacity: 0.8;
  margin: 0;
}

</style>
